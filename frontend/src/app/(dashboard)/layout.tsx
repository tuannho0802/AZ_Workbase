'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Avatar, Dropdown, Button } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { getVisibleNavItems } from '@/lib/nav-config';
import { useSidebarBadgeCounts } from '@/lib/hooks/useSidebarBadgeCounts';
import { CountBadge } from '@/components/common/CountBadge';
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
  const badgeCounts = useSidebarBadgeCounts(user?.role);

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

    if (pathname === '/') {
      // Trang chủ mới - phải check TRƯỚC mọi nhánh includes() bên dưới vì
      // '/' không match includes() của bất kỳ path con nào, nhưng cũng
      // không được rơi vào default 'customers' (sẽ sáng nhầm menu).
      newKey = 'home';
    } else if (pathname.includes('/users')) {
      newKey = 'users';
    } else if (pathname.includes('/profile')) {
      newKey = 'profile';
    } else if (pathname.includes('/audit-logs')) {
      newKey = 'audit-logs';
    } else if (pathname.includes('/chia-data')) {
      newKey = 'chia-data';
    } else if (pathname.includes('/customers/reports/invalid-data')) {
      // Check TRƯỚC nhánh '/customers' bên dưới, vì
      // '/customers/reports/invalid-data' cũng match '/customers' ->
      // nếu để sau, menu sẽ luôn highlight nhầm mục "Khách hàng".
      newKey = 'invalid-data-report';
    } else if (pathname.includes('/customers')) {
      newKey = 'customers';
    } else if (pathname.includes('/nghi-phep')) {
      newKey = 'nghi-phep';
    } else if (pathname.includes('/duyet-phep')) {
      newKey = 'duyet-phep';
    } else if (pathname.includes('/trash-can')) {
      newKey = 'trash-can';
    } else if (pathname.includes('/nguon-media')) {
      // Thiếu nhánh này khiến pathname rơi qua hết mọi else-if rồi giữ
      // nguyên default 'customers' -> sidebar luôn sáng nhầm "Khách hàng"
      // dù đang đứng ở trang /nguon-media (đúng bug trong ảnh bạn gửi).
      newKey = 'nguon-media';
    } else if (pathname.includes('/nhom-toi-quan-ly')) {
      // Check TRƯỚC '/nhom-lien-ket' bên dưới, vì '/nhom-toi-quan-ly' không
      // chứa '/nhom-lien-ket' nên thứ tự không bắt buộc, nhưng đặt cùng chỗ
      // cho dễ theo dõi 2 route liên quan nhau.
      newKey = 'nhom-toi-quan-ly';
    } else if (pathname.includes('/nhom-lien-ket')) {
      newKey = 'nhom-lien-ket';
    } else if (pathname.includes('/attendance-device')) {
      newKey = 'attendance-device';
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
              key: 'home',
              icon: <HomeOutlined />,
              label: 'Trang chủ',
              onClick: () => router.push('/'),
            },
            // Toàn bộ mục còn lại lấy từ nav-config.tsx - CÙNG 1 nguồn với
            // trang chủ (/) - sửa role-gate hay thêm/bớt mục chỉ cần sửa 1
            // chỗ duy nhất, không lệch giữa sidebar và trang chủ.
            ...getVisibleNavItems(user?.role).map((item) => ({
              key: item.key,
              icon: item.icon,
              label: (
                <CountBadge count={badgeCounts[item.key]}>
                  {item.label}
                </CountBadge>
              ),
              onClick: () => router.push(item.path),
            })),
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