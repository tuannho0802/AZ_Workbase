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
