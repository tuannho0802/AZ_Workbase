import type { ReactNode } from 'react';
import {
  TeamOutlined,
  SwapOutlined,
  CalendarOutlined,
  ProfileOutlined,
  UsergroupAddOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  UserOutlined,
  DeleteOutlined,
  TagsOutlined,
  ApartmentOutlined,
  ClockCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';

export interface NavItem {
  key: string;
  label: string;
  /** Mô tả ngắn 1 dòng - chỉ dùng cho card ở trang chủ, sidebar không cần. */
  description: string;
  icon: ReactNode;
  path: string;
  /** null = mọi role đã đăng nhập đều thấy. */
  roles: string[] | null;
}

/**
 * Nguồn cấu hình điều hướng DUY NHẤT cho cả Sidebar (layout.tsx) và trang
 * chủ (/). Trước đây sidebar tự định nghĩa role-gate rải rác từng mục ngay
 * trong layout.tsx - đúng kiểu chỗ dễ bị lệch khi thêm trang chủ cũng cần
 * hiện lại y hệt danh sách đó (xem PERMISSIONS.md - dự án đã dính bug lệch
 * FE/BE nhiều lần vì copy-paste điều kiện role ở nhiều nơi). Định nghĩa 1
 * lần ở đây, cả 2 nơi cùng filter theo `roles` - đảm bảo "sidebar có gì thì
 * trang chủ có đó" luôn đúng, không cần nhớ sửa 2 chỗ.
 *
 * Role-gate ở đây CHỈ để ẩn UI cho gọn mắt (UX) - chặn thật sự luôn nằm ở
 * BE (xem PERMISSIONS.md mục 1, nguyên tắc kỹ thuật #1).
 */
export const NAV_ITEMS: NavItem[] = [
  {
    key: 'customers',
    label: 'Khách hàng',
    description: 'Xem và quản lý danh sách khách hàng',
    icon: <TeamOutlined />,
    path: '/customers',
    roles: null,
  },
  {
    key: 'chia-data',
    label: 'Chia Data',
    description: 'Gán khách hàng cho sales phụ trách',
    icon: <SwapOutlined />,
    path: '/chia-data',
    roles: null,
  },
  {
    key: 'nghi-phep',
    label: 'Nghỉ phép',
    description: 'Gửi và theo dõi đơn xin nghỉ phép',
    icon: <CalendarOutlined />,
    path: '/nghi-phep',
    roles: null,
  },
  {
    key: 'profile',
    label: 'Profile',
    description: 'Fanpage/Group phụ trách của bản thân',
    icon: <ProfileOutlined />,
    path: '/profile',
    roles: null,
  },
  {
    key: 'nhom-toi-quan-ly',
    label: 'Nhóm tôi quản lý',
    description: 'Các nhóm liên kết bạn là quản lý chính/phụ',
    icon: <UsergroupAddOutlined />,
    path: '/nhom-toi-quan-ly',
    roles: null,
  },
  {
    key: 'duyet-phep',
    label: 'Duyệt phép',
    description: 'Duyệt/từ chối đơn nghỉ phép của nhân viên',
    icon: <CheckCircleOutlined />,
    path: '/duyet-phep',
    roles: ['admin', 'manager', 'assistant'],
  },
  {
    key: 'audit-logs',
    label: 'Nhật ký hệ thống',
    description: 'Lịch sử thao tác toàn hệ thống',
    icon: <FileTextOutlined />,
    path: '/audit-logs',
    roles: ['admin', 'assistant'],
  },
  {
    key: 'users',
    label: 'Nhân viên',
    description: 'Quản lý tài khoản, duyệt đăng ký mới',
    icon: <UserOutlined />,
    path: '/users',
    roles: ['admin', 'assistant', 'manager'],
  },
  {
    key: 'trash-can',
    label: 'Thùng rác',
    description: 'Khôi phục hoặc xoá vĩnh viễn khách hàng đã xoá',
    icon: <DeleteOutlined />,
    path: '/trash-can',
    roles: ['admin'],
  },
  {
    key: 'nguon-media',
    label: 'Quản lý nguồn',
    description: 'Danh sách nguồn khách hàng (Facebook, TikTok...)',
    icon: <TagsOutlined />,
    path: '/nguon-media',
    roles: ['admin', 'assistant'],
  },
  {
    key: 'nhom-lien-ket',
    label: 'Quản lý nhóm liên kết',
    description: 'Category và nhóm Zalo/FB/Threads...',
    icon: <ApartmentOutlined />,
    path: '/nhom-lien-ket',
    roles: ['admin', 'assistant'],
  },
  {
    key: 'attendance-device',
    label: 'Máy chấm công',
    description: 'Mapping nhân viên, bảng chấm công, log',
    icon: <ClockCircleOutlined />,
    path: '/attendance-device',
    roles: ['admin', 'assistant', 'manager'],
  },
  {
    key: 'invalid-data-report',
    label: 'Báo cáo data lỗi',
    description: 'Khách hàng bị nhập liệu sai/thiếu thông tin',
    icon: <WarningOutlined />,
    path: '/customers/reports/invalid-data',
    roles: ['admin'],
  },
];

export const getVisibleNavItems = (role: string | undefined) =>
  NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role || ''));