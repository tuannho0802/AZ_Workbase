'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, App, Alert } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { authApi } from '@/lib/api/auth.api';
import { useAuthStore } from '@/lib/stores/auth.store';
import { confirmPasswordRule, passwordPolicyRules, PASSWORD_POLICY_HINT } from '@/lib/utils/password-policy';

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

/**
 * P6: trang đổi mật khẩu BẮT BUỘC (3 trường). Nằm NGOÀI layout dashboard cố ý - dashboard gọi hàng loạt API
 * (quyền, badge, thông báo...) đều bị BE chặn 403 PASSWORD_CHANGE_REQUIRED khi cờ đang bật.
 * BE mới là nơi chặn thật; trang này chỉ là chỗ để người dùng thoát khỏi trạng thái bị chặn.
 */
export default function ChangePasswordRequiredPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { user, isAuthenticated, isHydrated, setUser, logout } = useAuthStore();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;
    if (!isAuthenticated) {
      window.location.href = '/login';
    } else if (user && !user.mustChangePassword) {
      // Không bị buộc đổi (vào thẳng bằng URL) -> về trang chính.
      router.replace('/');
    }
  }, [isHydrated, isAuthenticated, user, router]);

  const onFinish = async (values: FormValues) => {
    if (saving) return;
    setSaving(true);
    try {
      await authApi.changePasswordRequired(values);
      if (user) setUser({ ...user, mustChangePassword: false, passwordExpired: false });
      message.success('Đã đổi mật khẩu thành công');
      router.replace('/');
    } catch {
      // Interceptor axios đã toast message thật từ BE (400/401); giữ nguyên form để nhập lại.
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  if (!isHydrated || !isAuthenticated) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card title="Đổi mật khẩu để tiếp tục" style={{ width: '100%', maxWidth: 440 }}>
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title={user?.passwordExpired ? 'Mật khẩu của bạn đã hết hạn' : 'Bạn cần đổi mật khẩu được cấp'}
          description="Bạn chưa thể sử dụng hệ thống cho tới khi đặt mật khẩu mới. Các thiết bị khác đang đăng nhập sẽ bị đăng xuất."
        />
        <Form<FormValues> layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            name="currentPassword"
            label="Mật khẩu được cấp"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu được cấp' }]}
          >
            <Input.Password prefix={<LockOutlined />} size="large" autoFocus autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            rules={[
              ...passwordPolicyRules,
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('currentPassword') !== value) return Promise.resolve();
                  return Promise.reject(new Error('Mật khẩu mới phải khác mật khẩu được cấp'));
                },
              }),
            ]}
            extra={PASSWORD_POLICY_HINT}
          >
            <Input.Password prefix={<LockOutlined />} size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmNewPassword"
            label="Nhập lại mật khẩu mới"
            dependencies={['newPassword']}
            rules={[{ required: true, message: 'Vui lòng nhập lại mật khẩu mới' }, confirmPasswordRule('newPassword')]}
          >
            <Input.Password prefix={<LockOutlined />} size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={saving} disabled={saving}>
              Đổi mật khẩu
            </Button>
          </Form.Item>
          <Button type="link" block onClick={handleLogout}>
            Đăng xuất
          </Button>
        </Form>
      </Card>
    </div>
  );
}
