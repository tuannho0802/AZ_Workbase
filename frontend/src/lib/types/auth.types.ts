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
  department?: {
    id: number;
    name: string;
  };
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}