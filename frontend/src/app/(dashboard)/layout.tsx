'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Avatar, Dropdown } from 'antd';
import { LogoutOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import Cookies from 'js-cookie';

const { Header, Content, Sider } = Layout;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isHydrated, logout } = useAuthStore();
  const [selectedKey, setSelectedKey] = useState('customers');

  useEffect(() => {
    let newKey = 'customers'; // default
    
    if (pathname.includes('/users')) {
      newKey = 'users';
    } else if (pathname.includes('/customers')) {
      newKey = 'customers';
    }
    
    setSelectedKey(newKey);
    console.log('[SIDEBAR] Path:', pathname, '→ Key:', newKey);
  }, [pathname]); // ← selectedKey KHÔNG được trong deps (gây loop)

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      console.log('[Layout] Not authenticated after hydration -> Redirecting to /login');
      // Force a clean redirect to clear any bad state
      window.location.href = '/login?from=' + encodeURIComponent(window.location.pathname);
    }
  }, [isAuthenticated, isHydrated]);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  // HYDRATION SHIELD: Wait for Zustand to load from cookies
  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        <div className="mt-4 text-gray-600 font-medium">
          {!isHydrated ? 'Đang đồng bộ dữ liệu...' : 'Đang chuyển hướng...'}
        </div>
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={250}>
        <div className="p-4 text-white text-xl font-bold">
          AZWorkbase
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={[
            {
              key: 'customers',
              icon: <TeamOutlined />,
              label: 'Khách hàng',
              onClick: () => router.push('/customers'),
            },
            ...(user?.role === 'admin' || user?.role === 'manager' ? [{
              key: 'users',
              icon: <UserOutlined />,
              label: 'Nhân viên',
              onClick: () => router.push('/users'),
            }] : []),
          ]}
        />
      </Sider>

      <Layout>
        <Header className="bg-white px-6 flex justify-between items-center">
          <div className="text-lg font-semibold">Quản lý khách hàng</div>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Đăng xuất',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <div className="flex items-center gap-2 cursor-pointer">
              <Avatar icon={<UserOutlined />} />
              <span>{user?.name}</span>
              <span className="text-gray-500 text-sm">({user?.role})</span>
            </div>
          </Dropdown>
        </Header>

        <Content className="m-6">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
