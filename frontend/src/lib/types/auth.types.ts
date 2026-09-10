export interface LoginDto {
  email: string;
  password: string;
}

// Khớp đúng RegisterDto ở BE - CỐ TÌNH không có role/isActive/approvalStatus,
// người đăng ký không được tự chọn quyền cho mình (xem register.dto.ts BE).
export interface RegisterDto {
  name: string;
  email: string;
  password: string;
  phone?: string;
  departmentId?: number;
  // Honeypot - PHẢI luôn rỗng khi gửi từ người dùng thật, field bị ẩn hoàn toàn khỏi UI.
  // (Chống bot spam đăng ký - lớp "human challenge" giờ là Vercel BotID ở
  // route `/api/auth/register`, không còn field token nào cần gửi kèm từ
  // form nữa - khác Cloudflare Turnstile cũ.)
  website?: string;
}

export interface RegisterResponse {
  message: string;
  userId: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'assistant' | 'employee';
  isActive: boolean;
  // ⚠️ MỚI (migration AddIsRootAdminToUsers1781000000000) - CHỈ true khi
  // đây là Root Admin thật (có thể có NHIỀU root admin). Dùng để: hiện
  // toggle "Root Admin" ở trang /users, ẩn nút "Xoá" với record isRootAdmin.
  // KHÔNG dùng field này để tự gate quyền ở FE thay cho `useMyPermissions()`
  // - chỉ BE (PermissionGuard) là nguồn chặn thật sự.
  isRootAdmin?: boolean;
  department?: {
    id: number;
    name: string;
  };
  // ⚠️ MỚI - đối xứng `department` ở trên (rà soát BE Position). Hiện KHÔNG
  // trả kèm trong response login/`GET /users/me` refresh định kỳ (những nơi
  // set `useAuthStore().user`) - CHỈ dùng field này khi đọc từ
  // `usersApi.getMe()`/`getUserDetail()` (kiểu `UserDetail`), không phải từ
  // authStore. Khai ở đây để type nhất quán nếu sau này cũng merge vào
  // authStore giống `isRootAdmin`.
  position?: {
    id: number;
    name: string;
  } | null;
  // Presigned GET URL (TTL 1h, ký sẵn ở BE - KHÔNG PHẢI object key) - null
  // nếu chưa từng upload avatar. Có thể null/undefined tuỳ endpoint trả về.
  avatarUrl?: string | null;
  // Key thô ổn định (không đổi giữa các lần ký lại avatarUrl) - dùng làm
  // cache key cho useCachedImage(), KHÔNG dùng để hiển thị trực tiếp.
  avatarKey?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}