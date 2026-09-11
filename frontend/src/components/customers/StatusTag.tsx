'use client';

import { Tag } from 'antd';
import { useMemo } from 'react';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';

interface StatusTagProps {
  code?: string | null;
  fallback?: React.ReactNode;
}

/**
 * Tag hiển thị trạng thái khách hàng, tô đúng màu + tên đã cấu hình ở
 * /quan-ly-status-khach.
 *
 * ⚠️ Trước đây MỌI nơi hiển thị trạng thái (customers/page.tsx
 * `renderStatusTag`, CustomerStatusSelect.tsx `STATUS_CONFIG`,
 * CustomerForm.tsx dropdown) đều tự hardcode 1 bảng
 * closed/pending/potential/lost/inactive riêng - không đồng bộ với bảng
 * `customer_statuses` (đã thay ENUM cứng từ migration
 * CreateCustomerStatuses1781400000000), và KHÔNG hề biết tới trạng thái mới
 * (account_opened/callback_later/nurturing_group/ib) hay trạng thái tuỳ
 * chỉnh admin tự thêm sau này. Component này lấy TẤT CẢ trạng thái từ
 * `/customer-statuses` (kể cả đã bị xoá không còn trong danh sách - xem
 * fallback bên dưới) làm 1 nguồn duy nhất, mirror đúng pattern
 * `SourceTag.tsx`.
 *
 * `code` có thể không khớp dòng nào trong `customer_statuses` (dữ liệu cũ từ
 * trước khi 1 trạng thái tuỳ chỉnh bị xoá KHÔNG kèm fallback - trước khi có
 * cơ chế bắt buộc chọn fallback khi xoá - hoặc dữ liệu import lỗi) - vẫn
 * hiện đúng `code` gốc dạng Tag mặc định thay vì trống trơn, để không che
 * giấu dữ liệu bất thường.
 */
export const StatusTag = ({ code, fallback = null }: StatusTagProps) => {
  const { statuses } = useCustomerStatuses();
  const infoMap = useMemo(
    () => new Map(statuses.map((s) => [s.code, { color: s.color, name: s.name }])),
    [statuses],
  );

  if (!code) return <>{fallback}</>;

  const info = infoMap.get(code);
  return <Tag color={info?.color}>{info?.name ?? code}</Tag>;
};
