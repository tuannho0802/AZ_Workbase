'use client';

import { useEffect, useState } from 'react';
import { Select, Tag, App } from 'antd';
import { customersApi } from '@/lib/api/customers.api';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';

interface Props {
  customerId: number;
  status: string;
  // ⚠️ Gate quyền: TRUYỀN VÀO từ nơi gọi (customers/page.tsx đã có sẵn
  // `can('customers.edit')` - đúng permission PATCH /customers/:id đòi hỏi,
  // xem CustomerInfoTab.tsx dùng cùng permission cho nút "Chỉnh sửa"). Không
  // tự gọi useMyPermissions() lại ở đây để tránh 2 nguồn sự thật lệch nhau.
  // Không có quyền -> chỉ render Tag tĩnh y hệt `<StatusTag />`.
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

  // ⚠️ Đồng bộ với `/quan-ly-status-khach` (thay ENUM cứng cũ, xem migration
  // CreateCustomerStatuses1781400000000) - trước đây dropdown này tự hardcode
  // 5 giá trị cố định, không biết tới trạng thái mới hay trạng thái tuỳ
  // chỉnh admin tự thêm sau này (mirror đúng cách `SourceTag`/`StatusTag`
  // lấy dữ liệu động thay vì bảng màu tĩnh).
  const { statuses } = useCustomerStatuses();
  const statusOptions = statuses.map((s) => ({
    value: s.code,
    label: (
      <Tag color={s.color} style={{ marginInlineEnd: 0 }}>
        {s.name}
      </Tag>
    ),
  }));
  // Nếu customer đang có 1 `status` không còn khớp dòng nào trong
  // customer_statuses (dữ liệu cũ từ trước khi có cơ chế bắt buộc fallback
  // khi xoá) - vẫn thêm vào options dạng disabled để Select không hiện trống
  // trơn, đúng tinh thần "Đã khoá" của `sourceOptions` ở CustomerForm.tsx.
  if (status && !statuses.some((s) => s.code === status)) {
    statusOptions.push({
      value: status,
      label: (
        <Tag color="default" style={{ marginInlineEnd: 0 }}>
          {status} (không xác định)
        </Tag>
      ),
    });
  }

  // Đồng bộ lại nếu prop đổi từ ngoài (vd sau khi refetch danh sách do lọc/
  // phân trang) - tránh Select "đứng hình" giá trị cũ.
  useEffect(() => {
    setValue(status);
  }, [status]);

  if (!canEdit) {
    const info = statuses.find((s) => s.code === status);
    return <Tag color={info?.color}>{info?.name ?? status}</Tag>;
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
        options={statusOptions}
      />
    </div>
  );
};