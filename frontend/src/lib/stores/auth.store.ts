import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import Cookies from 'js-cookie';
import { User } from '../types/auth.types';
import axiosInstance from '../api/axios-instance';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => Promise<void>;
  logoutLocal: () => void;
  setHydrated: (state: boolean) => void;
}

// ⚠️ FIX BUG THẬT (2026-09-25) - Root cause của "429/CORS chỉ 1 profile Chrome
// đang đăng nhập lâu, phải login lại thì 429, chỉ hết khi F12 > Application >
// Cookies > xoá tay `auth-storage`" (KHÔNG phải do Vercel Firewall/BotID chặn
// IP như Gemini đoán - đã kiểm chứng: `POST /auth/login` và `/auth/refresh`
// KHÔNG hề gắn `ThrottlerGuard`/`@Throttle` ở BE, xem auth.controller.ts +
// app.module.ts - BE không tự trả 429 cho 2 route này):
//
// Trước đây TOÀN BỘ state (bao gồm `user` object có `avatarUrl` - URL
// Presigned S3/B2 dài ~300-600+ ký tự kèm chữ ký SigV4 - cộng với
// accessToken + refreshToken JWT) được `persist` ghi vào 1 COOKIE duy nhất
// (`cookieStorage` cũ, qua js-cookie). Cookie có trần cứng ~4096 byte theo
// RFC 6265 - trình duyệt ÂM THẦM TỪ CHỐI ghi đè khi giá trị mới vượt
// ngưỡng này (không throw lỗi). Sau JSON.stringify() + encodeURIComponent()
// 2 lớp (encode cả URL chữ ký S3 vốn đã có &, =, % bên trong), tổng kích
// thước dễ vượt 4KB, đặc biệt khi avatarUrl vừa được ký lại dài hơn hoặc
// sau nhiều vòng Refresh Token Rotation.
//
// Hệ quả: cookie bị "đóng băng" ở giá trị CŨ (access/refresh token cũ, có
// thể đã bị BE thu hồi do rotation) trong khi RAM (React state) của tab
// đang mở vẫn có token mới -> tab đó nhìn có vẻ bình thường. Nhưng mở tab
// mới / reload / máy khác đọc lại đúng cookie đã "đóng băng" đó -> rơi vào
// vòng: refresh bằng token cũ đã revoke -> thất bại -> logoutLocal ->
// redirect /login liên tục theo mọi query polling (badge count 60s, thông
// báo 60s, avatar 8 phút - mỗi cái tự thử refresh 1 lần khi 401) trong 1
// phiên dài -> dồn lại thành lượng request refresh thất bại lặp lại bất
// thường, khớp với hiện tượng bị challenge/429 chỉ ở đúng 1 profile (đúng
// profile có cookie hỏng) mà ẩn danh/profile khác (cookie sạch) không bị.
// Đây cũng lý giải vì sao "Clear cache" thường không ăn thua (thường không
// đụng tới cookie theo domain nếu người dùng chỉ xoá cache tài nguyên) còn
// xoá TAY đúng cookie `auth-storage` thì luôn thành công (ghi đè bằng thao
// tác xoá không bị giới hạn kích thước như ghi mới).
//
// FIX: tách 2 lớp lưu trữ:
//  1. Payload ĐẦY ĐỦ (token, user, avatarUrl...) -> chuyển sang
//     `localStorage` (không đi kèm HTTP header, giới hạn ~5-10MB, không
//     bao giờ chạm trần 4KB).
//  2. `proxy.ts` (Edge Middleware) không đọc được `localStorage` -> vẫn cần
//     1 cookie riêng cho việc gate trang, nhưng CHỈ chứa 1 cờ boolean nhỏ
//     (`azw-session=1`), không chứa token/user -> không bao giờ phình to.
// Có migrate 1 lần từ cookie `auth-storage` cũ (nếu trình duyệt còn) sang
// localStorage ngay bên dưới, để user đang đăng nhập KHÔNG bị văng ra
// ngoài ngay sau lần deploy fix này.
const SESSION_COOKIE_NAME = 'azw-session';
const LEGACY_COOKIE_NAME = 'auth-storage';

const setSessionCookie = (active: boolean) => {
  if (typeof window === 'undefined') return;
  if (active) {
    Cookies.set(SESSION_COOKIE_NAME, '1', { expires: 7, path: '/', sameSite: 'Lax' });
  } else {
    Cookies.remove(SESSION_COOKIE_NAME, { path: '/' });
  }
};

// Đọc + dọn cookie cũ (nếu có) để migrate 1 lần - CHỈ chạy phía client.
// Dọn ngay trong lúc đọc vì đây chính là cookie có nguy cơ vượt 4KB - không
// giữ lại, tránh lặp lại đúng bug này nếu sau này lỡ có chỗ khác ghi thêm.
const readLegacyCookiePayload = (): Partial<AuthState> | null => {
  if (typeof window === 'undefined') return null;
  const raw = Cookies.get(LEGACY_COOKIE_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return parsed?.state ?? null;
  } catch {
    return null;
  } finally {
    Cookies.remove(LEGACY_COOKIE_NAME, { path: '/' });
  }
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isHydrated: false,

      setUser: (user) => {
        set({ user, isAuthenticated: true });
        setSessionCookie(true);
      },
      
      setTokens: (accessToken, refreshToken) => {
        set({ 
          accessToken, 
          refreshToken,
          isAuthenticated: true,
        });
        setSessionCookie(true);
      },

      logout: async () => {
        try {
          await axiosInstance.post('/auth/logout');
        } catch (e) {
          // Silent catch
        } finally {
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
          });
          setSessionCookie(false);
        }
      },

      logoutLocal: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
        setSessionCookie(false);
      },

      setHydrated: (state) => {
        set({ isHydrated: state });
      },
    }),
    {
      name: 'auth-storage', // key trong localStorage - chỉ trùng tên, KHÔNG còn liên quan gì tới cookie `auth-storage` cũ (đã chuyển sang localStorage).
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state, error) => {
        if (!state) return;
        if (error) {
          // localStorage lỗi/hỏng (hiếm) - coi như chưa đăng nhập, không
          // crash cả app.
          state.setHydrated(true);
          return;
        }
        if (!state.isAuthenticated) {
          // localStorage chưa có gì (browser lần đầu chạy code mới) - thử
          // migrate 1 lần từ cookie cũ để không ép user đăng nhập lại.
          const legacy = readLegacyCookiePayload();
          if (legacy?.isAuthenticated && legacy.accessToken && legacy.refreshToken) {
            useAuthStore.setState({
              user: legacy.user ?? null,
              accessToken: legacy.accessToken,
              refreshToken: legacy.refreshToken,
              isAuthenticated: true,
            });
            setSessionCookie(true);
          }
        } else {
          // Đã có sẵn trong localStorage - đảm bảo cookie đánh dấu cho
          // proxy.ts luôn đồng bộ (vd cookie đánh dấu hết hạn 7 ngày trong
          // khi localStorage vẫn còn - gia hạn lại).
          setSessionCookie(true);
        }
        state.setHydrated(true);
      },
    }
  )
);
