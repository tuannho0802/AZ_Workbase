'use client';

import { useEffect, useRef, useState } from 'react';

const CACHE_NAME = 'az-workbase-image-cache-v1';
// Prefix giả (không thật sự fetch được) - chỉ dùng làm Request key trong
// Cache Storage, KHÔNG liên quan tới B2/domain thật nào.
const CACHE_KEY_PREFIX = 'https://az-workbase.local/cached-image/';

/**
 * Hiển thị 1 ảnh (avatar, ảnh đính kèm...) chỉ tải bytes THẬT SỰ ĐÚNG 1 LẦN,
 * sau đó phục vụ lại từ Cache Storage của trình duyệt cho MỌI lần render
 * tiếp theo - kể cả khi backend trả về `signedUrl` MỚI (query string HMAC +
 * timestamp đổi mỗi lần ký, xem `UsersService.signAvatarUrl`).
 *
 * ⚠️ Lý do KHÔNG dùng thẳng `<img src={signedUrl}>`: HTTP cache của trình
 * duyệt cache theo URL. Presigned GET URL đổi mỗi lần BE ký lại -> browser
 * coi là ảnh khác -> tải lại toàn bộ bytes từ B2 mỗi lần list/API refetch,
 * dù object trên B2 không hề đổi. Đây là nguyên nhân chính gây tốn bandwidth
 * (xem thảo luận + PLAN_AVATAR_LEAVE_ATTACHMENT_BACKBLAZE_B2.md mục 6.1).
 *
 * Cách fix: cache theo `cacheKey` ỔN ĐỊNH (object key thô trên B2, ví dụ
 * `avatarKey` - KHÔNG đổi trừ khi ảnh thật sự đổi), KHÔNG cache theo
 * `signedUrl`. `signedUrl` chỉ được dùng để fetch THẬT đúng 1 lần lúc cache
 * miss (lần đầu tiên, hoặc khi `cacheKey` đổi vì ảnh đã đổi thật).
 *
 * @param cacheKey  Object key ổn định trên B2 (vd `avatarKey`). `null`/`undefined`
 *                  nếu chưa có ảnh nào - hook trả về `undefined` ngay, không cache/fetch gì.
 * @param signedUrl Presigned GET URL hiện tại (đổi mỗi lần BE ký lại) - chỉ dùng để
 *                  fetch khi cache miss, KHÔNG dùng làm cache-key.
 * @returns         `blob:` object URL sẵn sàng gán thẳng vào `<img src>`/antd `Avatar src`,
 *                  hoặc `undefined` khi chưa có ảnh/đang tải lần đầu.
 */
export function useCachedImage(
    cacheKey: string | null | undefined,
    signedUrl: string | null | undefined,
): string | undefined {
    const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);

    // Giữ signedUrl MỚI NHẤT qua ref, KHÔNG đưa vào dependency array của
    // useEffect bên dưới - signedUrl đổi mỗi lần API trả về (ký lại), nếu để
    // làm dependency thì effect chạy lại liên tục mỗi lần list refetch dù đã
    // có cache, gây flicker + gọi cache.match() thừa. Chỉ cacheKey đổi (ảnh
    // THẬT SỰ đổi) mới cần chạy lại toàn bộ luồng.
    const signedUrlRef = useRef(signedUrl);
    signedUrlRef.current = signedUrl;

    // Cờ phụ để bắt đúng 1 trường hợp: lần đầu mount, cacheKey đã có nhưng
    // signedUrl chưa kịp có (đang loading bất đồng bộ) - khi signedUrl xuất
    // hiện sau đó, cần trigger lại DÙ cacheKey không đổi. Chuyển signedUrl
    // thành boolean để không bị vấn đề "đổi liên tục mỗi lần ký lại" như trên.
    const hasSignedUrl = Boolean(signedUrl);

    useEffect(() => {
        let cancelled = false;
        let createdUrl: string | undefined;

        async function load() {
            if (!cacheKey) {
                setObjectUrl(undefined);
                return;
            }

            if (typeof window === 'undefined' || !('caches' in window)) {
                // Môi trường không hỗ trợ Cache Storage API (SSR, trình duyệt cũ) -
                // fallback dùng thẳng signedUrl, mất lợi ích cache nhưng vẫn hiển thị được.
                setObjectUrl(signedUrlRef.current ?? undefined);
                return;
            }

            try {
                const cache = await caches.open(CACHE_NAME);
                const requestKey = CACHE_KEY_PREFIX + encodeURIComponent(cacheKey);
                const cached = await cache.match(requestKey);

                if (cached) {
                    const blob = await cached.blob();
                    if (cancelled) return;
                    createdUrl = URL.createObjectURL(blob);
                    setObjectUrl(createdUrl);
                    return;
                }

                // Cache miss - chưa có gì để fetch (signedUrl chưa sẵn sàng) -> chờ
                // lần re-run kế tiếp khi `hasSignedUrl` chuyển true.
                const urlToFetch = signedUrlRef.current;
                if (!urlToFetch) {
                    setObjectUrl(undefined);
                    return;
                }

                const res = await fetch(urlToFetch);
                if (!res.ok) throw new Error(`Tải ảnh thất bại (HTTP ${res.status})`);
                const blob = await res.blob();
                if (cancelled) return;

                // Lưu vào cache theo `cacheKey` ỔN ĐỊNH - KHÔNG lưu theo signedUrl -
                // đây chính là điểm mấu chốt để lần sau (kể cả sau khi signedUrl đã
                // đổi vì hết hạn/ký lại) vẫn cache HIT thay vì tải lại từ B2.
                await cache.put(requestKey, new Response(blob, { headers: res.headers }));

                createdUrl = URL.createObjectURL(blob);
                setObjectUrl(createdUrl);
            } catch {
                // Lỗi cache/fetch (vd offline, quota storage đầy) - fallback dùng
                // thẳng signedUrl, không chặn hiển thị ảnh chỉ vì cache lỗi.
                if (!cancelled) setObjectUrl(signedUrlRef.current ?? undefined);
            }
        }

        load();

        return () => {
            cancelled = true;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cacheKey, hasSignedUrl]);

    return objectUrl;
}