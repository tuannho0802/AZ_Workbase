'use client';

import type { CSSProperties } from 'react';
import { Avatar, Select, Space, Tag } from 'antd';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { resolveEntityColor } from '@/lib/utils/entityColor';

/** Shape tối thiểu của 1 user trong dropdown báo cáo (khớp `MarketingUserOption`, `GroupUserBrief`...). */
export interface ReportSelectableUser {
  id: number;
  name: string;
  role?: string | null;
  departmentName?: string | null;
  departmentColor?: string | null;
  positionName?: string | null;
  positionColor?: string | null;
}

const TAG_STYLE: CSSProperties = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };

/**
 * Avatar (màu theo VAI TRÒ) + tên + Tag Vai trò / Phòng ban / Vị trí - GIỐNG `renderUserOption` ở
 * `components/customers/CustomerFilters.tsx` (trang Khách hàng) để dropdown chọn nhân viên đồng bộ toàn hệ thống.
 * Màu Vai trò đọc qua `useRoleColorMap` (GET /roles/colors - không cần `roles.view`), màu Phòng ban/Vị trí lấy từ
 * chính dữ liệu BE trả về (`resolveEntityColor`, fallback CHỈ khi thiếu màu).
 */
export function ReportUserOption({ user }: { user: ReportSelectableUser }) {
  const { getRoleColor } = useRoleColorMap();
  const { roleColors } = useRoleColors();
  const roleName = user.role ? (roleColors.find((r) => r.code === user.role)?.name ?? user.role) : '';
  return (
    <Space size={4} align="center">
      <Avatar size={20} style={{ backgroundColor: getRoleColor(user.role), fontSize: 11, flexShrink: 0 }}>
        {user.name?.[0]?.toUpperCase()}
      </Avatar>
      <span style={{ fontSize: 13 }}>{user.name}</span>
      {user.role && <Tag style={TAG_STYLE} color={getRoleColor(user.role)}>{roleName}</Tag>}
      {user.departmentName && <Tag style={TAG_STYLE} color={resolveEntityColor(user.departmentColor)}>{user.departmentName}</Tag>}
      {user.positionName && <Tag style={TAG_STYLE} color={resolveEntityColor(user.positionColor)}>{user.positionName}</Tag>}
    </Space>
  );
}

interface ExtraOption {
  value: number;
  label: string;
}

interface UserSelectProps {
  users: ReportSelectableUser[];
  /** `null` = ép hiện placeholder (controlled) - dùng cho ô "chọn xong là mở modal" không giữ giá trị đã chọn. */
  value?: number | null;
  onChange?: (value: number | undefined) => void;
  placeholder?: string;
  style?: CSSProperties;
  allowClear?: boolean;
  /** Lựa chọn đặc biệt đứng đầu danh sách, vd `{ value: 0, label: '(Chưa gán Marketing)' }`. Hiện chữ thường (không Tag). */
  extraOptions?: ExtraOption[];
  size?: 'small' | 'middle' | 'large';
}

/**
 * Select chọn NHÂN VIÊN dùng chung cho mọi tab của trang /reports - chip đã chọn chỉ hiện tên (gọn), danh sách xổ ra
 * hiện đủ Tag. `popupMatchSelectWidth={false}` để dropdown giãn theo nội dung (Tag dài không bị cắt chữ).
 */
export function ReportUserSelect({ users, value, onChange, placeholder, style, allowClear = true, extraOptions = [], size }: UserSelectProps) {
  const options = [
    ...extraOptions.map((o) => ({ value: o.value, label: o.label, user: null as ReportSelectableUser | null })),
    ...users.map((u) => ({ value: u.id, label: u.name, user: u as ReportSelectableUser | null })),
  ];
  return (
    <Select<number>
      allowClear={allowClear}
      showSearch={{ optionFilterProp: 'label' }}
      size={size}
      style={{ width: '100%', ...style }}
      placeholder={placeholder}
      value={value as number | undefined}
      onChange={(v) => onChange?.(v)}
      optionLabelProp="label"
      popupMatchSelectWidth={false}
      options={options}
      optionRender={(option) => {
        const u = (option.data as { user: ReportSelectableUser | null }).user;
        return u ? <ReportUserOption user={u} /> : <span style={{ fontSize: 13 }}>{String(option.label)}</span>;
      }}
    />
  );
}

export interface ReportColorTagItem {
  id: number;
  name: string;
  color?: string | null;
}

/** Tên riêng cho chỗ dùng Phòng ban. */
export type ReportSelectableDepartment = ReportColorTagItem;

interface ColorTagSelectProps {
  items: ReportColorTagItem[];
  value?: number;
  onChange?: (value: number | undefined) => void;
  placeholder?: string;
  style?: CSSProperties;
}

/**
 * Select chọn 1 thực thể CÓ MÀU CẤU HÌNH (Phòng ban, Category nhóm...) - mỗi lựa chọn là Tag đúng màu, giống
 * Select Trạng thái/Nguồn ở trang Khách hàng. Tìm kiếm theo TÊN (label là JSX nên không dùng optionFilterProp).
 */
export function ReportColorTagSelect({ items, value, onChange, placeholder, style }: ColorTagSelectProps) {
  return (
    <Select<number>
      allowClear
      showSearch={{
        filterOption: (input, option) =>
          String((option as { name?: string } | undefined)?.name ?? '').toLowerCase().includes(input.toLowerCase()),
      }}
      style={{ width: 200, ...style }}
      placeholder={placeholder}
      value={value}
      onChange={(v) => onChange?.(v)}
      optionLabelProp="label"
      popupMatchSelectWidth={false}
      options={items.map((d) => ({
        value: d.id,
        name: d.name,
        label: <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>{d.name}</Tag>,
      }))}
    />
  );
}

interface DepartmentSelectProps extends Omit<ColorTagSelectProps, 'items'> {
  departments: ReportSelectableDepartment[];
}

/** Select chọn PHÒNG BAN - Tag đúng màu cấu hình ở /phong-ban. */
export function ReportDepartmentSelect({ departments, ...rest }: DepartmentSelectProps) {
  return <ReportColorTagSelect items={departments} {...rest} />;
}
