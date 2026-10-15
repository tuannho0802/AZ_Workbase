'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, App, Alert } from 'antd';
import { isAxiosError } from 'axios';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { formatCountdown, useCountdown } from '@/lib/hooks/useCountdown';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  // Giây còn bị khoá đăng nhập (từ 429 `retryAfterSeconds`) - đồng hồ đếm ngược + khoá nút Đăng nhập tới khi hết.
  const [lockSeconds, setLockSeconds] = useState(0);
  const [ipBanned, setIpBanned] = useState(false);
  const lockRemaining = useCountdown(lockSeconds, () => setLockSeconds(0));
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const { message } = App.useApp();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
    setIpBanned(false);
    try {
      console.log('[LOGIN] Attempting login...');
      const response = await authApi.login(values);
      
      console.log('[LOGIN] Response received:', {
        hasAccessToken: !!response.accessToken,
        hasRefreshToken: !!response.refreshToken,
        hasUser: !!response.user,
        userRole: response.user?.role,
      });

      // ✅ CRITICAL: Phải gọi CẢ 2 setters
      setUser(response.user);
      setTokens(response.accessToken, response.refreshToken);
      
      // Verify tokens đã lưu
      const currentState = useAuthStore.getState();
      console.log('[LOGIN] State after setTokens:', {
        hasAccessToken: !!currentState.accessToken,
        hasRefreshToken: !!currentState.refreshToken,
        isAuthenticated: currentState.isAuthenticated,
      });

      message.success('Đăng nhập thành công!');
      
      // Delay 500ms để đảm bảo cookie được ghi
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // P6: tài khoản bị buộc đổi mật khẩu (mới tạo/bị reset/hết hạn) -> sang trang đổi, không vào dashboard.
      router.push(response.user?.mustChangePassword ? '/change-password-required' : '/');
    } catch (error) {
      console.error('[LOGIN] Error:', error);
      const status = isAxiosError(error) ? error.response?.status : undefined;
      // ⚠️ 403 giờ có 3 trường hợp khác nhau: tài khoản bị khóa, đang chờ
      // duyệt (self-register), hoặc bị từ chối - xem AuthService.login() BE.
      // Thay vì chỉ hiện toast chung chung, điều hướng sang trang trạng thái
      // riêng, hiển thị ĐÚNG NGUYÊN VĂN message thật từ backend cho từng case.
      const bannedData = isAxiosError(error) ? (error.response?.data as { code?: string } | undefined) : undefined;
      if (status === 403 && bannedData?.code === 'IP_BANNED') {
        // P3.7: IP bị Admin chặn chủ động — ở lại trang đăng nhập, hiện Alert cố định (không có đồng hồ đếm ngược).
        setIpBanned(true);
      } else if (status === 403) {
        const backendMessage = getApiErrorMessage(error, 'Tài khoản của bạn hiện chưa thể đăng nhập.');
        router.push(`/account-status?message=${encodeURIComponent(backendMessage)}`);
      } else if (status === 429) {
        // Khoá đăng nhập tạm thời (LOGIN_LOCKED theo tài khoản hoặc IP_LOCKED theo IP; ngưỡng lấy từ security_config): interceptor axios ĐÃ toast message thật từ backend -
        // không toast lại ở đây để tránh 2 toast giống hệt nhau. Chỉ bật đồng hồ đếm ngược.
        const data = isAxiosError(error) ? (error.response?.data as { retryAfterSeconds?: number } | undefined) : undefined;
        if (typeof data?.retryAfterSeconds === 'number' && data.retryAfterSeconds > 0) {
          setLockSeconds(data.retryAfterSeconds);
        }
      } else if (status === 401) {
        // Chỉ hiển thị message thật khi backend báo sai mật khẩu kèm số lần còn lại; các case 401 khác giữ thông
        // báo chung (không lộ "tài khoản có tồn tại hay không").
        const data = isAxiosError(error) ? (error.response?.data as { code?: string; message?: string } | undefined) : undefined;
        message.error(
          data?.code === 'WRONG_PASSWORD' && data.message ? data.message : 'Email hoặc mật khẩu không đúng',
        );
      } else {
        message.error(getApiErrorMessage(error, 'Đăng nhập thất bại'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">AZWorkbase</h1>
          <p className="text-gray-500">Đăng nhập vào hệ thống</p>
        </div>

        {ipBanned && (
          <Alert
            type="error"
            showIcon
            className="mb-4"
            title="Địa chỉ mạng của bạn đã bị chặn. Vui lòng liên hệ quản trị viên."
          />
        )}

        {lockRemaining > 0 && (
          <Alert
            type="error"
            showIcon
            className="mb-4"
            title={`Đăng nhập bị khoá tạm thời. Thử lại sau ${formatCountdown(lockRemaining)}`}
          />
        )}

        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
        >
          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập email!' },
              { type: 'email', message: 'Email không hợp lệ!' },
            ]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="admin@azworkbase.com"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Mật khẩu"
            name="password"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu!' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Mật khẩu"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              disabled={lockRemaining > 0}
              size="large"
              block
            >
              Đăng nhập
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link href="/register">Chưa có tài khoản? Đăng ký ngay</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}