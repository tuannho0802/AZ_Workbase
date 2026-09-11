'use client';

import { useEffect, useState } from 'react';
import { Select, Tag, App } from 'antd';
import { customersApi } from '@/lib/api/customers.api';

// ⚠️ MỚI (yêu cầu: bấm đổi Trạng thái ngay trong bảng, không cần mở
// Sửa/Drawer) - dùng LẠI đúng 1 bảng màu/nhãn với `renderStatusTag()` ở
// customers/page.tsx (giữ đồng bộ, không tạo thêm 1 nguồn dữ liệu enum
// riêng) và đúng danh sách 5 giá trị `CreateCustomerDto.status`
// (`@IsEnum(['closed','pending','potential','lost','inactive'])`).
const STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  closed: { color: 'success', text: 'Đã chốt' },
  pending: { color: 'warning', text: 'Chờ xử lý' },
  potential: { color: 'processing', text: 'Tiềm năng' },
  lost: { color: 'error', text: 'Mất' },
  inactive: { color: 'default', text: 'Ngừng chăm sóc' },
};

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
  value,
  label: <Tag color={cfg.color} style={{ marginInlineEnd: 0 }}>{cfg.text}</Tag>,
}));

interface Props {
  customerId: number;
  status: string;
  // ⚠️ Gate quyền: TRUYỀN VÀO từ nơi gọi (customers/page.tsx đã có sẵn
  // `can('customers.edit')` - đúng permission PATCH /customers/:id đòi hỏi,
  // xem CustomerInfoTab.tsx dùng cùng permission cho nút "Chỉnh sửa"). Không
  // tự gọi useMyPermissions() lại ở đây để tránh 2 nguồn sự thật lệch nhau.
  // Không có quyền -> chỉ render Tag tĩnh y hệt `renderStatusTag()` cũ.
  canEdit: boolean;
  // Callback tuỳ chọn sau khi lưu thành công (vd refetch danh sách để đồng
  // bộ Ghi chú/Audit ở cột khác) - không bắt buộc vì component đã tự
  // optimistic-update UI của chính nó.
  onSaved?: (newStatus: string) => void;
}

export const CustomerStatusSelect = ({ customerId, status, canEdit, onSaved }: Props) => {
  const { message } = App.useApp();
  const [value, setValue] = useState(status);
  const [saving, setSaving] = useState(false);

  // Đồng bộ lại nếu prop đổi từ ngoài (vd sau khi refetch danh sách do lọc/
  // phân trang) - tránh Select "đứng hình" giá trị cũ.
  useEffect(() => {
    setValue(status);
  }, [status]);

  if (!canEdit) {
    const { color, text } = STATUS_CONFIG[status] || { color: 'default', text: status };
    return <Tag color={color}>{text}</Tag>;
  }

  const handleChange = async (newStatus: string) => {
    const previous = value;
    setValue(newStatus); // optimistic update - đổi ngay không chờ API
    setSaving(true);
    try {
      await customersApi.updateCustomer(customerId, { status: newStatus });
      message.success('Đã cập nhật trạng thái');
      onSaved?.(newStatus);
    } catch (err: any) {
      setValue(previous); // rollback nếu BE từ chối (vd hết quyền/hết scope)
      message.error(err?.response?.data?.message || 'Cập nhật trạng thái thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    // ⚠️ stopPropagation - bảng có `onRow.onClick` mở Drawer chi tiết. Dropdown
    // của Select render qua portal (document.body) nên click bên trong vẫn
    // "bubble" theo CÂY REACT (không phải cây DOM) tới `onRow`, nếu không chặn
    // ở đây thì bấm chọn option trong dropdown SẼ vô tình mở luôn Drawer.
    <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <Select
        value={value}
        size="small"
        variant="borderless"
        loading={saving}
        disabled={saving}
        style={{ width: '100%', minWidth: 110 }}
        popupMatchSelectWidth={false}
        onChange={handleChange}
        options={STATUS_OPTIONS}
      />
    </div>
  );
};
