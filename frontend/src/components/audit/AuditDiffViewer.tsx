'use client';

import React from 'react';
import { Table, Tag, Typography, Space, Empty, Alert } from 'antd';
import { ArrowRightOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { StatusTag } from '@/components/customers/StatusTag';

const { Text } = Typography;

interface AuditDiffViewerProps {
  oldData: any;
  newData: any;
  action: string;
  /**
   * Phase 7 (`AZ-Workbase Skills/PLAN_PERIODIC_TASKS_MODULE.md` mục 2.6):
   * bổ sung nhãn tiếng Việt cho field của module khác (vd "Công việc định
   * kỳ") mà KHÔNG cần sửa `FIELD_LABELS` gốc (vốn chỉ dành cho Customer/User/
   * Deposit) - merge đè lên `FIELD_LABELS`, field trùng key sẽ ưu tiên giá
   * trị truyền vào đây. Optional, mặc định không đổi hành vi cũ.
   */
  extraFieldLabels?: Record<string, string>;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Họ và tên',
  phone: 'Số điện thoại',
  email: 'Email',
  status: 'Trạng thái',
  source: 'Nguồn',
  note: 'Ghi chú',
  broker: 'Môi giới',
  campaign: 'Chiến dịch',
  salesUserId: 'Nhân viên sales',
  sales_user_id: 'Nhân viên sales',
  departmentId: 'Phòng ban',
  department_id: 'Phòng ban',
  amount: 'Số tiền nạp',
  type: 'Loại tiền',
  brokerId: 'ID Môi giới',
  role: 'Quyền hạn',
  isActive: 'Trạng thái hoạt động',
  password: 'Mật khẩu',
  closedDate: 'Ngày chốt',
  inputDate: 'Ngày nhập',
};

export const AuditDiffViewer: React.FC<AuditDiffViewerProps> = ({
  oldData,
  newData,
  action,
  extraFieldLabels,
}) => {
  // Case-insensitive: audit chung dùng action UPPER_SNAKE ('CREATE_CUSTOMER'),
  // Phase 7 (Công việc định kỳ) dùng lower_snake ('created') - so khớp không
  // phân biệt hoa/thường để cả 2 hệ action đều nhận đúng nhãn cột icon.
  const actionUpper = action.toUpperCase();
  const isCreate = actionUpper.includes('CREATE');
  const isDelete = actionUpper.includes('DELETE');
  const isUpdate = actionUpper.includes('UPDATE') || (oldData && newData);
  const fieldLabels = extraFieldLabels ? { ...FIELD_LABELS, ...extraFieldLabels } : FIELD_LABELS;

  // Helper to format values
  const formatValue = (val: any, key: string) => {
    if (val === null || val === undefined || val === '') return <Text type="secondary" italic>Trống</Text>;

    if (key === 'status') {
      // ⚠️ FIX BUG THẬT (báo lỗi "Objects are not valid as a React child"
      // khi mở diff của Công việc định kỳ): field `status` có 2 DẠNG khác
      // nhau tuỳ module, generic diff viewer này không biết trước:
      //   - Customer: `status` là STRING code, đồng bộ /quan-ly-status-khach
      //     (migration CreateCustomerStatuses1781400000000) → dùng StatusTag
      //     (tự fetch màu/tên từ `/customer-statuses`).
      //   - Công việc định kỳ: `status` là OBJECT nguyên vẹn từ quan hệ
      //     `PeriodicTaskStatus` (id/code/name/color/...), KHÔNG phải string
      //     - trước đây code cũ luôn coi `val` là string rồi truyền thẳng
      //     vào `StatusTag({ code })`, StatusTag không tìm thấy trong map
      //     (key tra cứu là string, `val` lại là cả object) nên fallback
      //     render RAW OBJECT ra JSX → React crash. Tự nhận diện dạng object
      //     và đọc thẳng `.name`/`.color` có sẵn (không cần gọi API status
      //     nào khác - object đã đủ thông tin để hiển thị).
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        const statusObj = val as { name?: string; code?: string; color?: string };
        return <Tag color={statusObj.color}>{statusObj.name ?? statusObj.code ?? 'Trạng thái'}</Tag>;
      }
      return <StatusTag code={val} />;
    }

    if (key === 'isActive') {
      return val ? <Tag color="success">Hoạt động</Tag> : <Tag color="error">Khóa</Tag>;
    }

    if (key === 'amount') {
      return <Text strong style={{ color: '#52c41a' }}>+${Number(val).toLocaleString()}</Text>;
    }

    if (key === 'deposits' && Array.isArray(val)) {
      return <Text type="secondary">{val.length} giao dịch nạp tiền</Text>;
    }

    if (typeof val === 'object') {
      return <Text type="secondary">Dữ liệu phức hợp</Text>;
    }

    return String(val);
  };

  // Extract and filter keys
  const getRelevantKeys = () => {
    const keys = new Set([
      ...Object.keys(oldData || {}),
      ...Object.keys(newData || {})
    ]);

    const ignoreKeys = [
      'id', 'createdAt', 'updatedAt', 'deletedAt', 'userId',
      'updatedById', 'createdById', 'updatedBy_OLD', 'createdBy_OLD',
      'hashedRefreshToken', 'user', 'targetCustomer'
    ];

    return Array.from(keys).filter(k => !ignoreKeys.includes(k));
  };

  const keys = getRelevantKeys();
  const diffs = keys.map(key => {
    const oldVal = oldData?.[key];
    const newVal = newData?.[key];

    // Skip if same
    if (JSON.stringify(oldVal) === JSON.stringify(newVal) && isUpdate) return null;

    return {
      key,
      label: fieldLabels[key] || key,
      old: oldVal,
      new: newVal,
    };
  }).filter(Boolean);

  if (diffs.length === 0) {
    if (action === 'USER_LOGIN') return <Alert title="Đăng nhập thành công" type="info" showIcon />;
    return <Empty description="Dữ liệu chính không thay đổi (có thể chỉ cập nhật quan hệ ẩn)" />;
  }

  const columns = [
    {
      title: 'Trường thông tin',
      dataIndex: 'label',
      key: 'label',
      width: '35%',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: isCreate ? 'Giá trị mới' : isDelete ? 'Giá trị cũ' : 'Nội dung thay đổi',
      key: 'change',
      render: (_: any, record: any) => {
        if (isCreate) {
          return <Space><PlusOutlined style={{ color: '#52c41a' }} /> {formatValue(record.new, record.key)}</Space>;
        }
        if (isDelete) {
          return <Space><DeleteOutlined style={{ color: '#f5222d' }} /> {formatValue(record.old, record.key)}</Space>;
        }

        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: '#8c8c8c', textDecoration: 'line-through', fontSize: '12px' }}>
              {formatValue(record.old, record.key)}
            </span>
            <ArrowRightOutlined style={{ color: '#bfbfbf', fontSize: '10px' }} />
            <Text strong style={{ background: '#f6ffed', padding: '1px 4px', borderRadius: '4px', border: '1px solid #b7eb8f' }}>
              {formatValue(record.new, record.key)}
            </Text>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ marginTop: 8 }}>
      <Table
        dataSource={diffs as any}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        rowKey="key"
        className="audit-diff-table"
      />
    </div>
  );
};