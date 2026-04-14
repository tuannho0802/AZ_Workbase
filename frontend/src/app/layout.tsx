import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import 'antd/dist/reset.css';
import './globals.css';
import { AntdAppProvider } from '@/components/common/AntdAppProvider';

export const metadata = {
  title: 'AZWorkbase',
  description: 'Hệ thống quản lý khách hàng',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body suppressHydrationWarning>
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
