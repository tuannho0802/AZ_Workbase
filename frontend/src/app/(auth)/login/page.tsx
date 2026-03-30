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
      const response = await authApi.login(values);
      
      setUser(response.user);
      setTokens(response.accessToken, response.refreshToken);
      
      // Đồng bộ vào js-cookie để middleware SSR đọc được ngay
      Cookies.set('auth-storage', JSON.stringify({ state: { isAuthenticated: true, user: response.user } }), { expires: 7 });

      message.success('Đăng nhập thành công!');
      router.push('/customers');
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Đăng nhập thất bại');
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
