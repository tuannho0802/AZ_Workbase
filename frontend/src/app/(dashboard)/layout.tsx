'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Avatar, Dropdown, Button } from 'antd';
import { 
  LogoutOutlined, 
  UserOutlined, 
  TeamOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SwapOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
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
  const [collapsed, setCollapsed] = useState(false);

  // Load sidebar state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebar_collapsed');
    if (savedState !== null) {
      setCollapsed(savedState === 'true');
    }
  }, []);

  const handleToggleSidebar = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem('sidebar_collapsed', String(newState));
  };

  useEffect(() => {
    let newKey = 'customers'; // default
    
    if (pathname.includes('/users')) {
      newKey = 'users';
    } else if (pathname.includes('/audit-logs')) {
      newKey = 'audit-logs';
    } else if (pathname.includes('/chia-data')) {
      newKey = 'chia-data';
    } else if (pathname.includes('/customers')) {
      newKey = 'customers';
    } else if (pathname.includes('/nghi-phep')) {
      newKey = 'nghi-phep';
    } else if (pathname.includes('/duyet-phep')) {
      newKey = 'duyet-phep';
    }
    
    setSelectedKey(newKey);
  }, [pathname]);

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
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
      <Sider 
        theme="dark" 
        collapsible 
        collapsed={collapsed} 
        onCollapse={setCollapsed}
        width={220}
        collapsedWidth={64}
        trigger={null}
      >
        <div className="p-4 flex items-center justify-between">
          {!collapsed && (
            <div className="text-white text-xl font-bold truncate">
              AZWorkbase
            </div>
          )}
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={handleToggleSidebar}
            style={{ color: 'white', marginLeft: collapsed ? 'auto' : 0, marginRight: collapsed ? 'auto' : 0 }}
          />
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
            {
              key: 'chia-data',
              icon: <SwapOutlined />,
              label: 'Chia Data',
              onClick: () => router.push('/chia-data'),
            },
            {
              key: 'nghi-phep',
              icon: <CalendarOutlined />,
              label: 'Nghỉ phép',
              onClick: () => router.push('/nghi-phep'),
            },
            ...(['admin', 'manager', 'assistant'].includes(user?.role || '') ? [{
              key: 'duyet-phep',
              icon: <CheckCircleOutlined />,
              label: 'Duyệt phép',
              onClick: () => router.push('/duyet-phep'),
            }] : []),
            ...(['admin', 'manager'].includes(user?.role || '') ? [{
              key: 'audit-logs',
              icon: <FileTextOutlined />,
              label: 'Nhật ký hệ thống',
              onClick: () => router.push('/audit-logs'),
            }] : []),
            ...(['admin'].includes(user?.role || '') ? [{
              key: 'users',
              icon: <UserOutlined />,
              label: 'Nhân viên',
              onClick: () => router.push('/users'),
            }] : []),
          ]}
        />
      </Sider>

      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        <Header className="bg-white px-6 flex justify-between items-center shadow-sm">
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

        <Content 
          className="m-6 overflow-auto" 
          style={{ 
            background: '#fff', 
            borderRadius: '8px',
            minHeight: '280px'
          }}
        >
          <div style={{ padding: '24px' }}>
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
