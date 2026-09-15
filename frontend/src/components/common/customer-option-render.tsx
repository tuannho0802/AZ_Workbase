import { Space, Tag } from 'antd';
import { Customer } from '@/lib/types/customer.types';

/**
 * customerPhoneDisplay - tránh hiện chữ "null"/"undefined" ra UI khi Customer
 * chưa có số điện thoại (dữ liệu cũ/nhập thiếu). Yêu cầu trực tiếp từ chủ dự
 * án (2026-09-15, dropdown chọn Customer ở module "Công việc định kỳ") - áp
 * dụng cho MỌI nơi hiển thị SĐT Customer dạng rút gọn (Select/label), không
 * riêng module này.
 */
export function customerPhoneDisplay(phone: string | null | undefined): string {
  return phone ? phone : 'Chưa có SĐT';
}

/**
 * customerPlainLabel - nhãn dạng "Tên - SĐT" dùng làm `label` PHẲNG (string)
 * của option Select - đây là text hiện trên chip đã chọn (mode="multiple")
 * và dùng để search/filter, KHÔNG gồm Người phụ trách chính (phần đó chỉ
 * hiện ở `renderCustomerOption` bên dưới, tránh chip quá dài khi chọn nhiều).
 */
export function customerPlainLabel(c: Customer): string {
  return `${c.name} - ${customerPhoneDisplay(c.phone)}`;
}

/**
 * renderCustomerOption - dùng cho prop `optionRender` của antd `Select` khi
 * `options` có thêm field `customer: Customer` (mirror đúng mẫu
 * `renderUserOption` ở `cong-viec-dinh-ky/page.tsx`). Hiện thêm Tag xanh
 * "PTC: <tên>" nếu Customer đã có `salesUser` (Người phụ trách chính) - mirror
 * đúng quy ước Tag "Primary Sales" nền xanh ở `SKILL_NEXTJS_FRONTEND.md`
 * mục 13.2.
 */
export function renderCustomerOption(option: { data: { customer: Customer } }) {
  const c = option.data.customer;
  return (
    <Space size={4} align="center">
      <span style={{ fontSize: 13 }}>{c.name}</span>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>- {customerPhoneDisplay(c.phone)}</span>
      {c.salesUser && (
        <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
          PTC: {c.salesUser.name}
        </Tag>
      )}
    </Space>
  );
}
