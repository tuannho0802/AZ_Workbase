'use client';

import { Descriptions, Tag, Button, Typography, Space } from 'antd';
import { CalendarOutlined, EditOutlined } from '@ant-design/icons';
import { Customer } from '@/lib/types/customer.types';
import { SourceTag } from './SourceTag';
import { StatusTag } from './StatusTag';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useMyHiddenElements } from '@/lib/hooks/useUiVisibility';
import { useRoleColorMap } from '@/lib/hooks/useRoleColorMap';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import dayjs from 'dayjs';

const { Text } = Typography;

interface Props {
  customer: Customer | null;
  onEdit: () => void;
}

export const CustomerInfoTab = ({ customer, onEdit }: Props) => {
  const { can } = useMyPermissions();
  // ⚠️ FIX BUG THẬT (rà soát màu Role 2026-09-10): Tag Role ở tab này trước
  // đây hardcode "blue"/"purple" (Sales/Marketing) và Tag Vị trí hardcode
  // "default" - comment cũ ngay phía trên đã CLAIM dùng đúng màu Admin cấu
  // hình ở /vi-tri nhưng code KHÔNG hề đọc `position.color` thật. Giờ đồng bộ
  // đúng pattern chuẩn của dự án (`resolveEntityColor`, xem entityColor.ts +
  // SalesUserSelect.tsx dropdown "Sales phụ trách").
  const { getRoleColor } = useRoleColorMap();
  // ⚠️ FIX BUG THẬT: nút "Chỉnh sửa" trước đây hiện KHÔNG ĐIỀU KIỆN, không
  // hề gọi can() - BE đã tách riêng `customers.edit` khỏi `customers.create`
  // (PATCH /customers/:id đòi @RequirePermission('customers.edit'), xem
  // migration 1778900000000-SplitCustomersManagePermission.ts) từ lâu,
  // nhưng nút này chưa bao giờ được nối vào. Hậu quả: Admin tắt hẳn quyền
  // `customers.edit` cho 1 role (hoặc override riêng cho 1 phòng ban qua
  // department_id override - xem PermissionsService) thì role/phòng ban đó
  // BẤM VẪN THẤY NÚT, chỉ khi bấm mới lộ 403 từ BE ("Không tìm thấy khách
  // hàng" - vì findOne() cũng lọc theo scope, làm người dùng tưởng lỗi dữ
  // liệu chứ không phải lỗi phân quyền) - đúng bug trong ảnh chụp màn hình.
  const canEdit = can('customers.edit');

  // ⚠️ FIX BUG THẬT (rà soát Vị trí 2026-09-11): tab "Chi tiết" ở đây CHƯA
  // BAO GIỜ gọi useMyHiddenElements('customers') - Admin cấu hình ẩn
  // field:sales_assignment/field:marketing_assignment/field:assigned_date/
  // field:closed_date cho 1 Position (vd "Content") qua /vi-tri KHÔNG có tác
  // dụng gì ở màn "Chi tiết khách hàng" này (khác với bảng danh sách ở
  // customers/page.tsx đã ẩn đúng cột Sales/Marketing). "Ghi chú hệ thống"
  // (customer.note) không có element_key riêng trong danh mục
  // (CUSTOMER_ELEMENT_KEYS) - gộp chung nhóm ẩn/hiện với field:closed_date
  // (nằm liền kề, cùng thuộc "thông tin chốt khách" - chung 1 trường dữ liệu
  // theo yêu cầu) thay vì thêm 1 element_key mới.
  const { hiddenKeys } = useMyHiddenElements('customers');
  const hideSales = hiddenKeys.includes('field:sales_assignment');
  const hideMarketing = hiddenKeys.includes('field:marketing_assignment');
  const hideAssignedDate = hiddenKeys.includes('field:assigned_date');
  const hideClosedDate = hiddenKeys.includes('field:closed_date');

  if (!customer) return null;

  return (
    <>
      {canEdit && (
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <Button icon={<EditOutlined />} onClick={onEdit}>Chỉnh sửa</Button>
        </div>
      )}
      <Descriptions bordered column={1} size="small">
        <Descriptions.Item label="Họ tên">{customer.name}</Descriptions.Item>
        <Descriptions.Item label="Số điện thoại">{customer.phone}</Descriptions.Item>
        <Descriptions.Item label="Email">{customer.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="Nguồn">
          <SourceTag source={customer.source} />
        </Descriptions.Item>
        <Descriptions.Item label="Trạng thái">
          <StatusTag code={customer.status} />
        </Descriptions.Item>
        <Descriptions.Item label="Chiến dịch">{customer.campaign || '-'}</Descriptions.Item>
        <Descriptions.Item label="Người tạo data">
          {customer.createdBy?.name || 'Hệ thống'}
        </Descriptions.Item>
        {!hideSales && (
          <Descriptions.Item label="Sales phụ trách chính">
            {customer.salesUser ? (
              <Space>
                <Text strong>{customer.salesUser.name}</Text>
                <Tag color={getRoleColor(customer.salesUser.role)}>{customer.salesUser.role?.toUpperCase()}</Tag>
                {/* ⚠️ MỚI - rà soát Vị trí: đối xứng Tag Role ở trên, chỉ hiện
                    khi có dữ liệu (không phải ai cũng được gán Vị trí). */}
                {customer.salesUser.position?.name && (
                  <Tag color={resolveEntityColor(customer.salesUser.position.color)}>{customer.salesUser.position.name}</Tag>
                )}
              </Space>
            ) : (
              <Text type="secondary" italic>Chưa phân công</Text>
            )}
          </Descriptions.Item>
        )}
        {!hideSales && (
          <Descriptions.Item label="Sales được chia">
            {(() => {
              const primaryId = customer.salesUser?.id;
              const shared = ((customer as any).activeAssignees || []).filter((a: any) => a.id !== primaryId);
              if (shared.length === 0) return <Text type="secondary">-</Text>;
              return (
                <Space orientation="vertical" size={2}>
                  {shared.map((user: any) => (
                    <Space key={user.id}>
                      <Text>{user.name}</Text>
                      <Tag color={getRoleColor(user.role)}>{user.role?.toUpperCase()}</Tag>
                      {user.position?.name && <Tag color={resolveEntityColor(user.position.color)}>{user.position.name}</Tag>}
                    </Space>
                  ))}
                </Space>
              );
            })()}
          </Descriptions.Item>
        )}
        {!hideMarketing && (
          <Descriptions.Item label="Marketing phụ trách">
            {customer.marketingUser ? (
              <Space>
                <Text strong>{customer.marketingUser.name}</Text>
                <Tag color={getRoleColor(customer.marketingUser.role)}>{customer.marketingUser.role?.toUpperCase()}</Tag>
                {customer.marketingUser.position?.name && (
                  <Tag color={resolveEntityColor(customer.marketingUser.position.color)}>{customer.marketingUser.position.name}</Tag>
                )}
              </Space>
            ) : (
              <Text type="secondary" italic>Chưa phân công</Text>
            )}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Broker">{customer.broker || '-'}</Descriptions.Item>
        <Descriptions.Item label="Ngày nhập data">
          <Text strong><CalendarOutlined /> {customer.inputDate ? dayjs(customer.inputDate).format('DD/MM/YYYY') : '-'}</Text>
        </Descriptions.Item>
        {!hideAssignedDate && (
          <Descriptions.Item label="Ngày nhận KH">
            <Text type="secondary">{customer.assignedDate ? dayjs(customer.assignedDate).format('DD/MM/YYYY') : '-'}</Text>
          </Descriptions.Item>
        )}
        {!hideClosedDate && (
          <Descriptions.Item label="Ngày chốt">
            <Tag color="success">{customer.closedDate ? dayjs(customer.closedDate).format('DD/MM/YYYY') : '-'}</Tag>
          </Descriptions.Item>
        )}
        {!hideClosedDate && (
          <Descriptions.Item label="Ghi chú hệ thống">{customer.note || '-'}</Descriptions.Item>
        )}
        <Descriptions.Item label="Ngày tạo hệ thống">
          <Text type="secondary">{dayjs(customer.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
        </Descriptions.Item>
      </Descriptions>
    </>
  );
};