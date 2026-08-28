'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Avatar, Dropdown, Button, Tag } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { getVisibleNavItems, NAV_ITEMS } from '@/lib/nav-config';
import { useSidebarBadgeCounts } from '@/lib/hooks/useSidebarBadgeCounts';
import { CountBadge } from '@/components/common/CountBadge';
import Cookies from 'js-cookie';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import Image from 'next/image';
import logo from '../../app/logo.png';

dayjs.locale('vi');

const { Header, Content, Sider, Footer } = Layout;

// Nhãn + icon hiển thị ở Header ứng với từng `selectedKey` - TÁI SỬ DỤNG
// đúng dữ liệu đã khai báo ở nav-config.tsx (1 nguồn duy nhất với Sidebar/
// Trang chủ, xem giải thích ở đầu file đó) thay vì viết lại 1 bảng riêng dễ
// lệch theo thời gian. Chỉ thêm key 'home' (mục Trang chủ gắn cứng ở Sider,
// không qua nav-config).
const PAGE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  home: { label: 'Trang chủ', icon: <HomeOutlined /> },
  ...Object.fromEntries(NAV_ITEMS.map((item) => [item.key, { label: item.label, icon: item.icon }])),
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Quản trị viên',
  assistant: 'Trợ lý',
  manager: 'Quản lý',
  employee: 'Nhân viên',
};
const ROLE_COLOR: Record<string, string> = {
  admin: 'gold',
  assistant: 'purple',
  manager: 'blue',
  employee: 'default',
};

/** Logo dùng chung cho Header và Footer - điểm nhận diện xuyên suốt. Dùng
 * `next/image` với import tĩnh (KHÔNG phải `<img src="../../.../logo.png">`
 * - đó là path hệ thống file, trình duyệt không hiểu; import tĩnh để
 * Next.js tự resolve đúng URL đã build/tối ưu). Logo gốc là PNG nền trong
 * suốt 1254x1254 (vuông) - không cần khung nền/gradient bao quanh nữa, chỉ
 * cần khung bo góc nhẹ để không bị "trôi nổi" giữa nền trắng của Header. */
function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <Image src={logo} alt="AZWorkbase" width={size} height={size} style={{ objectFit: 'contain' }} priority />
    </div>
  );
}

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
  const [todayLabel, setTodayLabel] = useState('');

  // Tính ngày ở client sau khi mount (KHÔNG tính ngay lúc render) để tránh
  // hydration mismatch giữa server render và client - giờ hệ thống server
  // (Vercel, có thể không phải GMT+7) và giờ trình duyệt người dùng có thể
  // lệch nhau đúng lúc gần nửa đêm, khiến chuỗi ngày server render ra khác
  // với client, React sẽ cảnh báo/ghi đè hydration.
  useEffect(() => {
    const label = dayjs().format('dddd, DD/MM/YYYY');
    setTodayLabel(label.charAt(0).toUpperCase() + label.slice(1));
  }, []);

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
        <Header
          // ⚠️ Bug đã fix trước đó: AntD Layout.Header mặc định nền TỐI
          // (#001529) dù Sider để theme="dark" - Header không tự ăn theo.
          // CSS AntD tự inject (@ant-design/cssinjs) có thể nạp SAU Tailwind
          // trong <head>, cùng độ ưu tiên -> nạp sau thắng -> nền vẫn tối,
          // chữ không set màu riêng nên mặc định đen -> chữ đen trên nền
          // tối. Dùng inline `style` để CHẮC CHẮN thắng mọi CSS khác.
          style={{
            background: '#fff',
            paddingInline: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #eef0f2',
            boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#f0f7ff',
                color: '#1890ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              {PAGE_META[selectedKey]?.icon ?? <HomeOutlined />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, color: '#94a3b8', textTransform: 'uppercase' }}>
                AZWorkbase
              </span>
              <span style={{ fontSize: 17, fontWeight: 600, color: '#0f172a' }}>
                {PAGE_META[selectedKey]?.label ?? 'Trang chủ'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {todayLabel && (
              <span style={{ fontSize: 13, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarOutlined />
                {todayLabel}
              </span>
            )}
            <div style={{ width: 1, height: 28, background: '#eef0f2' }} />
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <Avatar
                  icon={<UserOutlined />}
                  style={{ background: 'linear-gradient(135deg, #1890ff 0%, #0a3d91 100%)' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{user?.name}</span>
                  <Tag
                    color={ROLE_COLOR[user?.role ?? ''] ?? 'default'}
                    style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 6px' }}
                  >
                    {ROLE_LABEL[user?.role ?? ''] ?? user?.role}
                  </Tag>
                </div>
              </div>
            </Dropdown>
          </div>
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

        <Footer
          style={{
            background: '#fafbfc',
            borderTop: '1px solid #eef0f2',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BrandMark size={30} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>AZWorkbase</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                Hệ thống quản lý dữ liệu Marketing &amp; Khách hàng
              </span>
            </div>
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            © {new Date().getFullYear()} AZWorkbase — Lưu hành nội bộ
          </span>
        </Footer>
      </Layout>
    </Layout>
  );
}