'use client';

import React from 'react';
import { Table, Tag, Typography, Space, Empty, Card, Badge, Divider, Alert } from 'antd';
import { ArrowRightOutlined, InfoCircleOutlined, PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface AuditDiffViewerProps {
  oldData: any;
  newData: any;
  action: string;
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

const STATUS_MAP: Record<string, string> = {
  pending: 'Chờ xử lý',
  potential: 'Tiềm năng',
  closed: 'Đã chốt',
  lost: 'Đã mất',
  inactive: 'Không hoạt động',
};

export const AuditDiffViewer: React.FC<AuditDiffViewerProps> = ({ oldData, newData, action }) => {
  const isCreate = action.includes('CREATE');
  const isDelete = action.includes('DELETE');
  const isUpdate = action.includes('UPDATE') || (oldData && newData);

  // Helper to format values
  const formatValue = (val: any, key: string) => {
    if (val === null || val === undefined || val === '') return <Text type="secondary" italic>Trống</Text>;

    if (key === 'status') {
      return <Tag color="blue">{STATUS_MAP[val] || val}</Tag>;
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
      label: FIELD_LABELS[key] || key,
      old: oldVal,
      new: newVal,
    };
  }).filter(Boolean);

  if (diffs.length === 0) {
    if (action === 'USER_LOGIN') return <Alert message="Đăng nhập thành công" type="info" showIcon />;
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
