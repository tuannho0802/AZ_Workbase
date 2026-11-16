import type { Viewport } from 'next';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import 'antd/dist/reset.css';
import 'flag-icons/css/flag-icons.min.css';
import './globals.css';
import { AntdAppProvider } from '@/components/common/AntdAppProvider';
import { BotIdClient } from 'botid/client';

// M0 (PLAN_MOBILE_SIDEBAR.md): viewport tường minh + `viewportFit: 'cover'` để dùng được safe-area
// (`env(safe-area-inset-*)`) trên thiết bị tai thỏ. KHÔNG đặt maximumScale/userScalable - giữ khả năng phóng to (a11y).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata = {
  title: 'AZWorkbase',
  description: 'Hệ thống quản lý khách hàng',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};

// FIX: thay thế Cloudflare Turnstile bằng Vercel BotID (mục "Chống bot spam
// đăng ký" - xem AuthService.register() ở BE để biết toàn bộ kiến trúc).
// Khai báo Ở ĐÂY (root layout, chạy trước khi bất kỳ trang con nào mount)
// route CẦN được BotID bảo vệ - route handler tương ứng phải gọi
// `checkBotId()` (xem `src/app/api/auth/register/route.ts`). Component này
// tự inject script, không render UI gì (khác hẳn `<TurnstileWidget>` cũ -
// không cần đặt trong form, không cần siteKey truyền vào).
const PROTECTED_ROUTES = [{ path: '/api/auth/register', method: 'POST' }];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body suppressHydrationWarning>
        <BotIdClient protect={PROTECTED_ROUTES} />
        <ConfigProvider
          locale={viVN}
          theme={{
            token: {
              colorPrimary: '#1890ff',
              borderRadius: 6,
            },
          }}
        >
          <AntdAppProvider>
            {children}
          </AntdAppProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}