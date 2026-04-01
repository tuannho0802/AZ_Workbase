'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import Cookies from 'js-cookie';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser, setTokens } = useAuthStore();
  const { message } = App.useApp();

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true);
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
      
      router.push('/customers');
    } catch (error: any) {
      console.error('[LOGIN] Error:', error);
      const status = error.response?.status;
      if (status === 403) {
        message.error('Tài khoản của bạn đã bị khóa, vui lòng liên hệ Admin');
      } else if (status === 401) {
        message.error('Email hoặc mật khẩu không đúng');
      } else {
        message.error(error.response?.data?.message || 'Đăng nhập thất bại');
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
              size="large"
              block
            >
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
