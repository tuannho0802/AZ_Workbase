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
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';

const { Title, Paragraph, Text } = Typography;

// Site key CÔNG KHAI (khác secret key ở BE, an toàn khi lộ ra Frontend - đây
// là cách Cloudflare Turnstile hoạt động, giống reCAPTCHA site key). Nếu
// chưa cấu hình (vd môi trường dev chưa có key thật từ Cloudflare Dashboard),
// component TurnstileWidget không render - form gửi kèm 1 token giả cố định
// để không chặn hẳn luồng dev local; BE tự "PASS" xác minh khi thiếu
// TURNSTILE_SECRET_KEY (xem TurnstileService) nên 2 bên khớp nhau.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const DEV_BYPASS_TOKEN = 'local-dev-bypass-not-verified';

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
  const [turnstileToken, setTurnstileToken] = useState('');
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
    // Turnstile bắt buộc phải có token (thật hoặc bypass dev) trước khi gửi
    // - chặn sớm ở Frontend để không tốn round-trip nếu người dùng bỏ qua
    // widget (vd JS bị chặn 1 phần). BE vẫn tự kiểm tra lại, đây chỉ là UX.
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      message.error('Vui lòng hoàn tất xác minh "Tôi không phải rô bốt" trước khi đăng ký.');
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.register({
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        departmentId: values.departmentId,
        turnstileToken: TURNSTILE_SITE_KEY ? turnstileToken : DEV_BYPASS_TOKEN,
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

          {TURNSTILE_SITE_KEY ? (
            <Form.Item style={{ marginBottom: 12 }}>
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken('')}
                onError={() => setTurnstileToken('')}
              />
            </Form.Item>
          ) : (
            <Form.Item style={{ marginBottom: 12 }}>
              <Text type="warning" style={{ fontSize: 12 }}>
                ⚠️ Turnstile site key chưa được cấu hình (NEXT_PUBLIC_TURNSTILE_SITE_KEY) - bỏ qua
                bước xác minh, chỉ nên xảy ra ở môi trường dev.
              </Text>
            </Form.Item>
          )}

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