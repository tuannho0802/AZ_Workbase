export interface LoginDto {
  email: string;
  password: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'assistant' | 'employee';
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
