import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import ChangePasswordRequiredPage from './page';
import { authApi } from '@/lib/api/auth.api';

const replace = vi.fn();
const setUser = vi.fn();
const storeState = {
  user: { id: 1, email: 'a@b.c', name: 'A', role: 'employee', isActive: true, mustChangePassword: true } as Record<string, unknown> | null,
  isAuthenticated: true,
  isHydrated: true,
  setUser,
  logout: vi.fn(),
};

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('@/lib/stores/auth.store', () => ({ useAuthStore: () => storeState }));
vi.mock('@/lib/api/auth.api', () => ({ authApi: { changePasswordRequired: vi.fn() } }));

const renderPage = () =>
  render(
    <App>
      <ChangePasswordRequiredPage />
    </App>,
  );

const fill = (cur: string, next: string, again: string) => {
  fireEvent.change(screen.getByLabelText('Mật khẩu được cấp'), { target: { value: cur } });
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), { target: { value: again } });
  fireEvent.click(screen.getByRole('button', { name: /Đổi mật khẩu/ }));
};

describe('ChangePasswordRequiredPage (P6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.user = { id: 1, email: 'a@b.c', name: 'A', role: 'employee', isActive: true, mustChangePassword: true };
  });

  it('hiện đủ 3 trường', () => {
    renderPage();
    expect(screen.getByLabelText('Mật khẩu được cấp')).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu mới')).toBeInTheDocument();
    expect(screen.getByLabelText('Nhập lại mật khẩu mới')).toBeInTheDocument();
  });

  it('mật khẩu mới 7 ký tự bị chặn ở FE, KHÔNG gọi API', async () => {
    renderPage();
    fill('Cap@1234', 'Abcd@12', 'Abcd@12');
    expect(await screen.findByText(/ít nhất 8 ký tự/)).toBeInTheDocument();
    expect(authApi.changePasswordRequired).not.toHaveBeenCalled();
  });

  it('nhập lại không khớp -> báo lỗi, KHÔNG gọi API', async () => {
    renderPage();
    fill('Cap@1234', 'Moi@12345', 'Khac@12345');
    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument();
    expect(authApi.changePasswordRequired).not.toHaveBeenCalled();
  });

  it('mật khẩu mới trùng mật khẩu được cấp -> báo lỗi, KHÔNG gọi API', async () => {
    renderPage();
    fill('Cap@12345', 'Cap@12345', 'Cap@12345');
    expect(await screen.findByText('Mật khẩu mới phải khác mật khẩu được cấp')).toBeInTheDocument();
    expect(authApi.changePasswordRequired).not.toHaveBeenCalled();
  });

  it('hợp lệ -> gọi API, gỡ cờ trong store, chuyển về trang chính', async () => {
    vi.mocked(authApi.changePasswordRequired).mockResolvedValue({ success: true, message: 'ok' });
    renderPage();
    fill('Cap@12345', 'Moi@12345', 'Moi@12345');
    await waitFor(() =>
      expect(authApi.changePasswordRequired).toHaveBeenCalledWith({
        currentPassword: 'Cap@12345',
        newPassword: 'Moi@12345',
        confirmNewPassword: 'Moi@12345',
      }),
    );
    await waitFor(() => expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ mustChangePassword: false })));
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('API lỗi -> ở lại trang, không chuyển hướng, không gỡ cờ', async () => {
    vi.mocked(authApi.changePasswordRequired).mockRejectedValue(new Error('401'));
    renderPage();
    fill('Sai@12345', 'Moi@12345', 'Moi@12345');
    await waitFor(() => expect(authApi.changePasswordRequired).toHaveBeenCalled());
    expect(setUser).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalledWith('/');
  });

  it('không bị buộc đổi (vào thẳng bằng URL) -> chuyển về /', async () => {
    storeState.user = { id: 1, email: 'a@b.c', name: 'A', role: 'employee', isActive: true, mustChangePassword: false };
    renderPage();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });
});
