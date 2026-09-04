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
  BarChartOutlined,
  CrownOutlined,
} from '@ant-design/icons';

export interface NavItem {
  key: string;
  label: string;
  /** Mô tả ngắn 1 dòng - chỉ dùng cho card ở trang chủ, sidebar không cần. */
  description: string;
  icon: ReactNode;
  path: string;
  /** null = mọi role đã đăng nhập đều thấy. BỎ QUA nếu `permission` có giá
   * trị (xem giải thích ở `permission` bên dưới). */
  roles: string[] | null;
  /**
   * ⚠️ Permission key ĐỘNG (vd "roles.view") - nếu có giá trị, mục này ẨN/HIỆN
   * theo permission THẬT của role hiện tại (gọi `GET /roles/my-permissions`,
   * xem `useMyPermissions.ts`), KHÔNG dùng field `roles` tĩnh phía trên nữa.
   * Đây là cách "API và UI đồng bộ": khi Admin đổi ma trận quyền ở trang
   * Phân quyền, mục nav này tự ẩn/hiện theo, không cần sửa code/deploy lại.
   *
   * CHỈ dùng field này cho mục nào ĐÃ thật sự được BE enforce qua
   * `@RequirePermission()` (xem PermissionGuard) - nếu chỉ đổi FE mà BE vẫn
   * chặn theo `@Roles()` enum cũ thì UI và API sẽ LỆCH NHAU (đúng thứ dự án
   * này đang cố tránh) - lúc đó vẫn phải dùng `roles` tĩnh như cũ.
   *
   * Có thể truyền 1 MẢNG permission key thay vì 1 chuỗi - dùng khi trang
   * đích thật sự chấp nhận "CÓ ÍT NHẤT 1 TRONG NHIỀU quyền" (OR), ví dụ
   * `/duyet-phep` cho vào được nếu có `leave_requests.view` HOẶC
   * `leave_requests.approve` (xem chính logic trong `duyet-phep/page.tsx` -
   * `if (!canView && !canApprove) { ... redirect }`). Nếu chỉ kiểm tra 1
   * trong 2 key đó ở đây, role chỉ có ĐÚNG quyền còn lại sẽ bị ẩn nhầm menu
   * dù trang thực sự cho họ vào (bug đã tìm thấy + sửa khi rà soát 2026-09 -
   * đối chiếu với `useSidebarBadgeCounts.ts` cũng dùng `leave_requests.approve`
   * cho đúng badge này, xác nhận `.view` một mình không đủ).
   */
  permission?: string | string[];
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
    // ⚠️ FIX BUG THẬT (rà soát permission 2026-09): trước đây `roles: null`
    // không kiểm tra gì - nhưng GET /customers đã khớp
    // @RequirePermission('customers.view') từ lâu. Nếu Admin thu hồi
    // customers.view khỏi 1 role, sidebar vẫn hiện mục này -> bấm vào dính
    // 403 (đúng loại bug đang rà soát: UI không theo kịp permission BE).
    roles: null,
    permission: 'customers.view',
  },
  {
    key: 'chia-data',
    label: 'Chia Data',
    description: 'Gán khách hàng cho sales phụ trách',
    icon: <SwapOutlined />,
    path: '/chia-data',
    // ⚠️ FIX BUG THẬT (rà soát permission 2026-09): cùng lý do ở mục
    // 'customers' phía trên - GET /customers/unassigned và
    // /customers/assigned đều khớp @RequirePermission('customers.view').
    roles: null,
    permission: 'customers.view',
  },
  {
    key: 'nghi-phep',
    label: 'Nghỉ phép',
    description: 'Gửi và theo dõi đơn xin nghỉ phép',
    icon: <CalendarOutlined />,
    path: '/nghi-phep',
    roles: null,
    permission: 'leave_requests.request',
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
    key: 'reports',
    label: 'Báo cáo doanh số',
    description: 'Doanh thu và data khách hàng theo Cá nhân/Phòng ban/Tổng tất cả',
    icon: <BarChartOutlined />,
    path: '/reports',
    // Khớp @RequirePermission('reports.view') ở reports.controller.ts (rà
    // soát permission UI - trước đây để `roles: null` với lý do "mở cho mọi
    // role", nhưng giờ BE dùng permission động nên Admin có thể thu hồi
    // quyền này cho 1 role bất kỳ qua trang Phân quyền - phải theo dõi đúng).
    roles: null,
    permission: 'reports.view',
  },
  {
    key: 'duyet-phep',
    label: 'Duyệt phép',
    description: 'Duyệt/từ chối đơn nghỉ phép của nhân viên',
    icon: <CheckCircleOutlined />,
    path: '/duyet-phep',
    // ⚠️ FIX BUG THẬT (rà soát permission 2026-09): trang này cho vào nếu
    // có leave_requests.view HOẶC leave_requests.approve (xem chính logic
    // trong duyet-phep/page.tsx: `if (!canView && !canApprove) redirect`) -
    // trước đây chỉ check `.view`, khiến 1 role CHỈ có `.approve` (không có
    // `.view`) bị ẩn nhầm khỏi sidebar dù trang thực sự cho vào được. Khớp
    // đúng `useSidebarBadgeCounts.ts` (dùng `.approve` cho badge số đơn chờ
    // duyệt của mục này) - xác nhận `.approve` cũng là quyền hợp lệ ở đây.
    roles: null,
    permission: ['leave_requests.view', 'leave_requests.approve'],
  },
  {
    key: 'audit-logs',
    label: 'Nhật ký hệ thống',
    description: 'Lịch sử thao tác toàn hệ thống',
    icon: <FileTextOutlined />,
    path: '/audit-logs',
    // Khớp @RequirePermission('audit.view') ở audit.controller.ts (rà soát
    // permission UI - trước đây `roles: ['admin','assistant']` tĩnh, BE đã
    // migrate hoàn toàn sang permission động từ lâu, nav-config quên theo).
    roles: null,
    permission: 'audit.view',
  },
  {
    key: 'users',
    label: 'Nhân viên',
    description: 'Quản lý tài khoản, duyệt đăng ký mới',
    icon: <UserOutlined />,
    path: '/users',
    // Khớp @RequirePermission('users.view') ở users.controller.ts.
    roles: null,
    permission: 'users.view',
  },
  {
    key: 'trash-can',
    label: 'Thùng rác',
    description: 'Khôi phục hoặc xoá vĩnh viễn khách hàng đã xoá',
    icon: <DeleteOutlined />,
    path: '/trash-can',
    // Khớp @RequirePermission('customers.trash_manage') ở customers.controller.ts
    // (3 endpoint GET trash/restore/hard-delete) - đổi từ `roles: ['admin']`
    // tĩnh sang permission động (rà soát permission UI).
    roles: null,
    permission: 'customers.trash_manage',
  },
  {
    key: 'nguon-media',
    label: 'Quản lý nguồn',
    description: 'Danh sách nguồn khách hàng (Facebook, TikTok...)',
    icon: <TagsOutlined />,
    path: '/nguon-media',
    // Khớp @RequirePermission('media_sources.view') ở media-sources.controller.ts.
    roles: null,
    permission: 'media_sources.view',
  },
  {
    key: 'nhom-lien-ket',
    label: 'Quản lý nhóm liên kết',
    description: 'Category và nhóm Zalo/FB/Threads...',
    icon: <ApartmentOutlined />,
    path: '/nhom-lien-ket',
    // Khớp @RequirePermission('link_groups.view') ở link-categories.controller.ts
    // + link-groups.controller.ts.
    roles: null,
    permission: 'link_groups.view',
  },
  {
    key: 'attendance-device',
    label: 'Máy chấm công',
    description: 'Mapping nhân viên, bảng chấm công, log',
    icon: <ClockCircleOutlined />,
    path: '/attendance-device',
    roles: null,
    permission: 'attendance.view',
  },
  {
    key: 'invalid-data-report',
    label: 'Báo cáo data lỗi',
    description: 'Khách hàng bị nhập liệu sai/thiếu thông tin',
    icon: <WarningOutlined />,
    path: '/customers/reports/invalid-data',
    // Khớp @RequirePermission('customers.invalid_report') ở customers.controller.ts.
    roles: null,
    permission: 'customers.invalid_report',
  },
  {
    key: 'phan-quyen',
    label: 'Phân quyền',
    description: 'Tạo Role tuỳ chỉnh, chỉnh ma trận quyền theo permission',
    icon: <CrownOutlined />,
    path: '/phan-quyen',
    // ⚠️ Mục DUY NHẤT dùng `permission` động thay vì `roles` tĩnh - đây
    // CHÍNH LÀ mục "Admin tự tuỳ chỉnh phân quyền" nên tự nó cũng phải tuân
    // thủ đúng nguyên tắc mà nó quản lý: hiện/ẩn theo permission THẬT
    // (`roles.view`) do PermissionGuard enforce ở BE (roles.controller.ts),
    // không hardcode danh sách role ở đây. Nếu sau này Admin gán "roles.view"
    // cho 1 role tuỳ chỉnh, mục này tự hiện ra - không cần sửa code.
    roles: null,
    permission: 'roles.view',
  },
];

/**
 * @param role role hiện tại (dùng cho các mục CHƯA migrate, field `roles` tĩnh).
 * @param can hàm kiểm tra permission động từ `useMyPermissions()` - dùng cho
 * các mục ĐÃ khai báo `permission` (xem giải thích ở field đó). Optional để
 * không phá vỡ chỗ gọi cũ chưa kịp truyền vào - khi đó mục nào có
 * `permission` sẽ mặc định ẨN (an toàn - "không biết thì không hiện", tránh
 * lộ mục ra trong lúc `useMyPermissions()` đang loading).
 */
export const getVisibleNavItems = (
  role: string | undefined,
  can?: (permissionKey: string) => boolean,
) =>
  NAV_ITEMS.filter((item) => {
    if (!item.permission) return !item.roles || item.roles.includes(role || '');
    const keys = Array.isArray(item.permission) ? item.permission : [item.permission];
    // OR: chỉ cần CÓ ÍT NHẤT 1 trong các key - khớp đúng cách trang đích tự
    // kiểm tra quyền vào trang (xem giải thích ở field `permission` trên).
    return keys.some((key) => !!can?.(key));
  });