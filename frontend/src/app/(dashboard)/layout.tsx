'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const { user, isAuthenticated, logout } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    Cookies.remove('auth-storage');
    router.push('/login');
  };

  if (!isAuthenticated) {
    return null;
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
          defaultSelectedKeys={['customers']}
          items={[
            {
              key: 'customers',
              icon: <TeamOutlined />,
              label: 'Khách hàng',
              onClick: () => router.push('/customers'),
            },
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
