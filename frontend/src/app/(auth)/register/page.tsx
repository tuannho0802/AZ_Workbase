'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, Select, App, Typography } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { authApi } from '@/lib/api/auth.api';
import { departmentsApi } from '@/lib/api/departments.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Title, Paragraph } = Typography;

interface RegisterFormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone?: string;
  departmentId?: number;
  // Honeypot - KHÔNG hiển thị cho người dùng, field ẩn hoàn toàn (xem JSX
  // bên dưới). Người dùng thật không bao giờ chạm tới field này.
  website?: string;
}

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<RegisterFormValues>();

  // Danh sách phòng ban CÔNG KHAI - dùng đúng route /departments/public
  // (không cần token), khác với departmentsApi.getAll() dùng cho màn quản trị.
  const { data: departments = [], isLoading: loadingDepartments } = useQuery({
    queryKey: ['departments-public'],
    queryFn: departmentsApi.getPublic,
    staleTime: 5 * 60 * 1000,
  });

  const onFinish = async (values: RegisterFormValues) => {
    setLoading(true);
    try {
      const res = await authApi.register({
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        departmentId: values.departmentId,
        website: values.website, // honeypot - luôn rỗng với người dùng thật
      });
      // Không có token trả về (đúng thiết kế BE - tài khoản đang chờ duyệt),
      // nên chuyển sang trang thông báo trạng thái thay vì vào thẳng hệ thống.
      router.push(`/account-status?message=${encodeURIComponent(res.message)}`);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Đăng ký thất bại'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-8">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <Title level={3} style={{ marginBottom: 4 }}>
            Đăng ký tài khoản
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>
            Tài khoản sẽ ở trạng thái <strong>chờ duyệt</strong> cho tới khi Admin/Assistant
            xác nhận.
          </Paragraph>
        </div>

        <Form form={form} name="register" onFinish={onFinish} autoComplete="off" layout="vertical">
          {/* ── Honeypot chống bot: ẩn hoàn toàn khỏi người dùng thật (kể cả
              screen reader qua aria-hidden), nhưng bot điền form tự động
              (thường quét toàn bộ input trong DOM, không phân biệt hiển thị
              hay không) vẫn "thấy" và điền vào. Có giá trị = chắc chắn bot,
              xem AuthService.register(). Đặt tên field như thật ("website")
              để bot không đoán được đây là bẫy. */}
          <div
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', top: '-9999px', height: 0, width: 0, overflow: 'hidden' }}
          >
            <Form.Item name="website" label="Website">
              <Input tabIndex={-1} autoComplete="off" />
            </Form.Item>
          </div>

          <Form.Item
            label="Họ và tên"
            name="name"
            rules={[
              { required: true, message: 'Vui lòng nhập họ tên!' },
              { min: 2, message: 'Họ tên phải có ít nhất 2 ký tự' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="Nguyễn Văn A" size="large" />
          </Form.Item>

          <Form.Item
            label="Email"
            name="email"
            rules={[
              { required: true, message: 'Vui lòng nhập email!' },
              { type: 'email', message: 'Email không hợp lệ!' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="ban@example.com" size="large" />
          </Form.Item>

          <Form.Item
            label="Số điện thoại"
            name="phone"
            rules={[
              {
                pattern: /^(09|08|07|03|05)[0-9]{8}$/,
                message: 'Số điện thoại không hợp lệ (vd 0912345678)',
              },
            ]}
          >
            <Input prefix={<PhoneOutlined />} placeholder="0912345678 (không bắt buộc)" size="large" />
          </Form.Item>

          <Form.Item label="Phòng ban" name="departmentId">
            <Select
              placeholder="Chọn phòng ban (không bắt buộc)"
              size="large"
              allowClear
              loading={loadingDepartments}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>

          <Form.Item
            label="Mật khẩu"
            name="password"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu!' },
              { min: 8, message: 'Mật khẩu phải có ít nhất 8 ký tự' },
              {
                pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/,
                message: 'Mật khẩu phải có chữ hoa, chữ thường, số và ký tự đặc biệt (@$!%*?&)',
              },
            ]}
            hasFeedback
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Ít nhất 8 ký tự" size="large" />
          </Form.Item>

          <Form.Item
            label="Xác nhận mật khẩu"
            name="confirmPassword"
            dependencies={['password']}
            hasFeedback
            rules={[
              { required: true, message: 'Vui lòng xác nhận mật khẩu!' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Nhập lại mật khẩu" size="large" />
          </Form.Item>

          {/* Không còn widget hiển thị nào ở đây - lớp chống bot "human
              challenge" giờ là Vercel BotID, chạy ẩn hoàn toàn ở tầng route
              `/api/auth/register` (xem `<BotIdClient>` ở layout gốc +
              `AuthService.register()` BE), không cần UI/token nào trong
              form nữa (khác Cloudflare Turnstile cũ). */}

          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} size="large" block>
              Đăng ký
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link href="/login">Đã có tài khoản? Đăng nhập</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}