import { useState } from 'react';
import { Popover, Select, Button, Badge, Space, Tag, Avatar } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { useAssignmentGroupUsers } from '@/lib/hooks/useAssignmentGroups';
import { AssignmentGroupUser } from '@/lib/api/assignment-groups.api';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { SourceTag } from '@/components/customers/SourceTag';

/**
 * customer-quick-filter.tsx - MỚI (2026-09-16, yêu cầu chủ dự án qua ảnh chụp
 * "Chưa gắn Khách hàng nào"): ô tìm Khách hàng để gắn vào Task (Tạo/Sửa ở
 * `cong-viec-dinh-ky/page.tsx`, Liên kết ở `TaskLinksModal.tsx`) trước đây
 * CHỈ search theo tên/SĐT (`useCustomers({ search })`) - khó tìm khi công ty
 * có nhiều Khách hàng trùng tên/chưa nhớ SĐT. Thêm bộ lọc nhanh THEO ĐÚNG 3
 * tiêu chí hay dùng nhất ở trang `/customers` (Nguồn, Trạng thái, Sales phụ
 * trách - xem `CustomerFilters.tsx`), dạng nút phễu + Popover để KHÔNG chiếm
 * thêm hàng ngang nào trong Form (2 nơi dùng đều là Form.Item hẹp, không có
 * chỗ cho 1 hàng `Row/Col` đầy đủ như trang Customer).
 *
 * CỐ Ý bỏ Marketing/Người nhập Data/Ngày/Đã joined nhóm (có ở
 * `CustomerFilters.tsx`) - đây là chọn nhanh 1 Khách hàng để gắn Task, không
 * phải trang quản lý Data đầy đủ; 3 tiêu chí này đủ thu hẹp danh sách mà
 * không làm Popover quá dài. Có thể mở rộng thêm sau nếu chủ dự án yêu cầu.
 */
export interface CustomerQuickFilters {
  source?: string;
  status?: string;
  salesUserId?: number;
}

export const EMPTY_CUSTOMER_QUICK_FILTERS: CustomerQuickFilters = {};

export function countActiveCustomerQuickFilters(f: CustomerQuickFilters): number {
  return [f.source, f.status, f.salesUserId].filter((v) => v !== undefined && v !== null).length;
}

interface CustomerQuickFilterButtonProps {
  value: CustomerQuickFilters;
  onChange: (next: CustomerQuickFilters) => void;
}

export function CustomerQuickFilterButton({ value, onChange }: CustomerQuickFilterButtonProps) {
  const [open, setOpen] = useState(false);
  // 3 nguồn dữ liệu ĐỘNG giống hệt `CustomerFilters.tsx` (không hardcode enum
  // cứng) - Nguồn/Trạng thái do Admin tự cấu hình qua `/nguon-media` và
  // `/quan-ly-status-khach`, danh sách Sales lấy qua "Quản lý phụ trách"
  // (Assignment Group `sales`) thay vì dò tên phòng ban.
  const { sources } = useMediaSources(false);
  const { statuses } = useCustomerStatuses();
  const { users: salesUsers } = useAssignmentGroupUsers('sales');

  // Avatar + Tag Vai trò/Phòng ban/Vị trí cho dropdown "Sales phụ trách" -
  // MỚI (2026-09-16, yêu cầu chủ dự án qua ảnh chụp "Lọc Khách hàng"): trước
  // đây hiện tên trơn, không đồng bộ với các dropdown chọn User khác trong
  // app (`renderUserOption` ở `cong-viec-dinh-ky/page.tsx`,
  // `BulkAssignModal.tsx`...). `AssignmentGroupUser` đã có sẵn
  // role/department/position kèm color từ BE (xem JSDoc
  // `assignment-groups.api.ts`), chỉ thiếu phần vẽ Tag màu ở đây.
  const { getRoleColor } = useRoleColorMap();
  const { roleColors: allRoles } = useRoleColors();
  const roleNameMap = new Map(allRoles.map((r) => [r.code, r.name]));
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');
  const userTagStyle = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 } as const;
  const renderSalesUserOption = (option: { data: { user: AssignmentGroupUser } }) => {
    const u = option.data.user;
    return (
      <Space size={4} align="center">
        <Avatar size={20} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
          {u.name?.[0]?.toUpperCase()}
        </Avatar>
        <span style={{ fontSize: 13 }}>{u.name}</span>
        {u.role && (
          <Tag style={userTagStyle} color={getRoleColor(u.role)}>
            {getRoleName(u.role)}
          </Tag>
        )}
        {u.department?.name && (
          <Tag style={userTagStyle} color={resolveEntityColor(u.department.color)}>
            {u.department.name}
          </Tag>
        )}
        {u.position?.name && (
          <Tag style={userTagStyle} color={resolveEntityColor(u.position.color)}>
            {u.position.name}
          </Tag>
        )}
      </Space>
    );
  };

  const activeCount = countActiveCustomerQuickFilters(value);

  const content = (
    <Space orientation="vertical" size={10} style={{ width: 240 }}>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4, color: 'rgba(0,0,0,0.65)' }}>Nguồn</div>
        <Select
          allowClear
          style={{ width: '100%' }}
          placeholder="Tất cả nguồn"
          value={value.source}
          onChange={(v) => onChange({ ...value, source: v })}
          options={sources.map((s) => ({ value: s.name, label: <SourceTag source={s.name} /> }))}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4, color: 'rgba(0,0,0,0.65)' }}>Trạng thái</div>
        <Select
          allowClear
          style={{ width: '100%' }}
          placeholder="Tất cả trạng thái"
          value={value.status}
          onChange={(v) => onChange({ ...value, status: v })}
          options={statuses
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => ({
              value: s.code,
              label: (
                <Tag color={s.color} style={{ marginInlineEnd: 0 }}>
                  {s.name}
                </Tag>
              ),
            }))}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4, color: 'rgba(0,0,0,0.65)' }}>Sales phụ trách</div>
        <Select
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          style={{ width: '100%' }}
          placeholder="Tất cả Sales"
          value={value.salesUserId}
          onChange={(v) => onChange({ ...value, salesUserId: v })}
          optionLabelProp="label"
          optionRender={renderSalesUserOption}
          popupMatchSelectWidth={false}
          options={salesUsers.map((u) => ({ value: u.id, label: u.name, user: u }))}
        />
      </div>
      {activeCount > 0 && (
        <Button size="small" block onClick={() => onChange({ ...EMPTY_CUSTOMER_QUICK_FILTERS })}>
          Xoá bộ lọc ({activeCount})
        </Button>
      )}
    </Space>
  );

  return (
    <Popover
      content={content}
      title="Lọc Khách hàng"
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
    >
      <Badge dot={activeCount > 0} offset={[-4, 4]}>
        <Button icon={<FilterOutlined />} title="Lọc Khách hàng theo Nguồn/Trạng thái/Sales" />
      </Badge>
    </Popover>
  );
}