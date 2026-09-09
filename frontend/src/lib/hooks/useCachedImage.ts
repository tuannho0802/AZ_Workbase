'use client';

import { useEffect, useRef, useState } from 'react';

// Bump version (v1 -> v2) nếu sau này đổi cấu trúc lưu (vd đổi cách build
// Request key) để tự bỏ cache cũ không đọc được. Bump lần này (v1 -> v2) vì
// đổi ĐỊNH DẠNG cacheKey cho avatar (thêm tiền tố `avatars:`, xem
// buildImageCacheKey() bên dưới) - nếu không bump, entry cũ theo key cũ
// (không tiền tố) sẽ nằm mồ côi vĩnh viễn trong Cache Storage (tốn dung
// lượng, không bao giờ được đọc lại vì không còn ai tạo request theo key cũ).
const CACHE_NAME = 'az-workbase-image-cache-v2';
// Origin giả cố định - CHỈ dùng làm key cho Cache Storage, KHÔNG bao giờ
// thật sự fetch tới domain này. Cache Storage API yêu cầu key là Request/URL
// hợp lệ, không nhận string tuỳ ý.
const FAKE_ORIGIN = 'https://az-workbase-image-cache.local';

function buildCacheRequest(cacheKey: string): Request {
    return new Request(`${FAKE_ORIGIN}/${encodeURIComponent(cacheKey)}`);
}

// ⚠️ FIX BUG THẬT (root cause vụ avatar Header/Profile ĐÃ cache rồi nhưng
// trang /storage-img vẫn tự fetch riêng 1 bản KHÁC cho ĐÚNG 1 file: xem
// DevTools Application > Cache Storage - từng thấy 2 entry
// `avatars%2F1%2FAdmin_Admin.png` (từ AvatarUpload/layout, dùng thẳng
// `avatarKey` thô) VÀ `media%3Aavatars%3Aavatars%2F1%2FAdmin_Admin.png` (từ
// storage-img, tự ghép `media:${bucket}:${item.key}`) - CÙNG 1 object trên
// B2 nhưng 2 cacheKey khác nhau -> Cache Storage coi là 2 ảnh khác nhau,
// không bao giờ dùng chung, mỗi trang tự fetch + lưu riêng, tốn gấp đôi
// dung lượng VÀ băng thông cho cùng 1 file):
// TẤT CẢ nơi gọi `useCachedImage()` cho ảnh lấy từ B2 (avatar, đính kèm nghỉ
// phép, media-library...) PHẢI dùng chung hàm này để build cacheKey - không
// tự ghép chuỗi thủ công ở từng component - đảm bảo cùng 1 `bucket` + `key`
// luôn ra ĐÚNG 1 cacheKey, bất kể ảnh đó đang hiển thị ở trang nào.
export type ImageCacheBucket = 'avatars' | 'leave-attachments' | 'media-library';

export function buildImageCacheKey(bucket: ImageCacheBucket, key: string): string {
    return `media:${bucket}:${key}`;
}

function supportsCacheStorage(): boolean {
    return typeof window !== 'undefined' && 'caches' in window;
}

// ⚠️ FIX BUG THẬT (dedup request đang bay - root cause của việc avatar Header
// tải 2 LẦN THẬT từ B2 với 2 signed URL KHÁC NHAU, thấy rõ trong DevTools
// Network dù cache đang hoạt động đúng): mỗi khi `signedUrl` truyền vào đổi
// (BE ký lại URL mới cho CÙNG 1 `cacheKey` - vd effect tự refresh avatar mỗi
// 8 phút ở dashboard layout, hoặc React 18 StrictMode dev tự chạy effect 2
// lần), nếu 2 lần gọi hook xảy ra GẦN NHAU trước khi lần fetch đầu kịp
// `cache.put()` xong, `cache.match()` ở lần gọi sau vẫn miss (cache còn
// trống) -> tự fetch thêm 1 lần THẬT nữa qua B2 dù ảnh giống hệt, tốn gấp
// đôi băng thông đúng lúc cache còn "lạnh". Fix: 1 Map DÙNG CHUNG (module-
// level, không phải per-hook-instance) theo dõi promise fetch+cache-write
// đang bay cho từng `cacheKey` - lần gọi sau (dù `signedUrl` khác) chỉ cần
// AWAIT lại đúng promise đó thay vì tự fetch thêm, đảm bảo TỐI ĐA 1 request
// mạng thật sự cho mỗi `cacheKey` tại 1 thời điểm, bất kể có bao nhiêu
// component/effect cùng yêu cầu cùng lúc.
const inFlightFetches = new Map<string, Promise<Blob>>();

async function fetchAndCache(cache: Cache, request: Request, cacheKey: string, signedUrl: string): Promise<Blob> {
    const existing = inFlightFetches.get(cacheKey);
    if (existing) return existing;

    const promise = (async () => {
        const response = await fetch(signedUrl);
        if (!response.ok) throw new Error(`Tải ảnh thất bại (${response.status})`);
        // Lưu vào cache bằng bản clone (body Response chỉ đọc được 1 lần).
        await cache.put(request, response.clone());
        return response.blob();
    })();

    inFlightFetches.set(cacheKey, promise);
    try {
        return await promise;
    } finally {
        // Chỉ xoá nếu vẫn còn đúng promise này (tránh race hiếm: promise mới
        // hơn đã ghi đè trong lúc promise cũ đang finally).
        if (inFlightFetches.get(cacheKey) === promise) {
            inFlightFetches.delete(cacheKey);
        }
    }
}

/**
 * Cache 1 ảnh (avatar / ảnh đính kèm nghỉ phép / media-library...) theo
 * `cacheKey` ỔN ĐỊNH (object key thô trên B2, hoặc id bản ghi DB - KHÔNG
 * PHẢI signed URL, vì signed URL đổi mỗi lần BE ký lại nên không dùng làm
 * cache key được).
 *
 * Cơ chế: dùng Cache Storage API (`caches`), key theo `cacheKey` chứ không
 * theo URL:
 *  - Cache hit -> trả blob local ngay (KHÔNG có request mạng nào tới B2, kể
 *    cả khi `signedUrl` truyền vào là 1 URL MỚI khác lần trước).
 *  - Cache miss (lần đầu, hoặc cacheKey đổi vì ảnh thật sự đổi) -> fetch
 *    đúng 1 lần qua `signedUrl`, lưu blob vào cache theo `cacheKey`, dùng
 *    lại cho mọi lần sau - kể cả sau khi TTL của signed URL (1h/10p) hết
 *    hạn, vì blob đã nằm sẵn trên máy, không cần URL còn hiệu lực để ĐỌC.
 *
 * Trả về:
 *  - `undefined` khi chưa có gì để hiển thị (đang chờ cacheKey/signedUrl,
 *    hoặc trình duyệt không hỗ trợ Cache Storage và signedUrl cũng chưa có).
 *  - object URL (`blob:...`) khi lấy được từ cache hoặc vừa fetch xong.
 *  - `signedUrl` nguyên bản làm fallback nếu Cache Storage không khả dụng
 *    (Safari private mode, môi trường không secure context...) hoặc fetch
 *    lỗi - vẫn hiển thị được ảnh, chỉ là không cache.
 */
export function useCachedImage(
    cacheKey: string | null | undefined,
    signedUrl: string | null | undefined,
): string | undefined {
    const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);
    // Object URL hiện đang "sở hữu" bởi state, để revoke đúng cái cũ khi thay
    // bằng cái mới hoặc unmount - tránh rò bộ nhớ khi dùng ở list nhiều ảnh
    // (MediaGrid, danh sách đính kèm...).
    const currentObjectUrlRef = useRef<string | undefined>(undefined);

    useEffect(() => {
      if (!cacheKey || !signedUrl) {
          setObjectUrl(undefined);
          return;
      }

      let cancelled = false;

      const revokeCurrent = () => {
          if (currentObjectUrlRef.current) {
              URL.revokeObjectURL(currentObjectUrlRef.current);
              currentObjectUrlRef.current = undefined;
          }
      };

      const setFromBlob = (blob: Blob) => {
          if (cancelled) return;
          revokeCurrent();
          const url = URL.createObjectURL(blob);
          currentObjectUrlRef.current = url;
          setObjectUrl(url);
      };

      (async () => {
          if (!supportsCacheStorage()) {
              if (!cancelled) setObjectUrl(signedUrl);
              return;
          }

        try {
            const cache = await caches.open(CACHE_NAME);
          const request = buildCacheRequest(cacheKey);
          const cached = await cache.match(request);

          if (cached) {
              const blob = await cached.blob();
            setFromBlob(blob);
            return;
        }

            // Dedup qua Map dùng chung - xem comment ở fetchAndCache() phía
            // trên: tối đa 1 request mạng thật cho mỗi cacheKey tại 1 thời điểm.
            const blob = await fetchAndCache(cache, request, cacheKey, signedUrl);
          setFromBlob(blob);
      } catch {
          // Cache Storage lỗi hoặc fetch lỗi - vẫn hiển thị được ảnh qua URL
          // ký sẵn, chỉ là lần này không cache lại.
          if (!cancelled) setObjectUrl(signedUrl);
      }
    })();

      return () => {
          cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, signedUrl]);

    // Revoke object URL cuối cùng khi component unmount hẳn.
    useEffect(() => {
        return () => {
            if (currentObjectUrlRef.current) {
                URL.revokeObjectURL(currentObjectUrlRef.current);
                currentObjectUrlRef.current = undefined;
            }
        };
    }, []);

    return objectUrl;
}