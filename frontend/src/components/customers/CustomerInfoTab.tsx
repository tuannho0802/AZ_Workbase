'use client';

import { Descriptions, Tag, Button, Typography } from 'antd';
import { CalendarOutlined, EditOutlined } from '@ant-design/icons';
import { Customer } from '@/lib/types/customer.types';
import dayjs from 'dayjs';

const { Text } = Typography;

interface Props {
  customer: Customer | null;
  onEdit: () => void;
}

export const CustomerInfoTab = ({ customer, onEdit }: Props) => {
  if (!customer) return null;

  return (
    <>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Button icon={<EditOutlined />} onClick={onEdit}>Chỉnh sửa</Button>
      </div>
      <Descriptions bordered column={1} size="small">
        <Descriptions.Item label="Họ tên">{customer.name}</Descriptions.Item>
        <Descriptions.Item label="Số điện thoại">{customer.phone}</Descriptions.Item>
        <Descriptions.Item label="Email">{customer.email || '-'}</Descriptions.Item>
        <Descriptions.Item label="Nguồn">
          <Tag color="blue">{customer.source}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Chiến dịch">{customer.campaign || '-'}</Descriptions.Item>
        <Descriptions.Item label="Sales phụ trách">{customer.salesUser?.name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Phòng ban">{customer.department?.name || '-'}</Descriptions.Item>
        <Descriptions.Item label="Broker">{customer.broker || '-'}</Descriptions.Item>
        <Descriptions.Item label="Ngày nhập data">
          <Text strong><CalendarOutlined /> {customer.inputDate ? dayjs(customer.inputDate).format('DD/MM/YYYY') : '-'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Ngày nhận KH">
          <Text type="secondary">{customer.assignedDate ? dayjs(customer.assignedDate).format('DD/MM/YYYY') : '-'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Ngày chốt">
          <Tag color="success">{customer.closedDate ? dayjs(customer.closedDate).format('DD/MM/YYYY') : '-'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Ghi chú hệ thống">{customer.note || '-'}</Descriptions.Item>
        <Descriptions.Item label="Ngày tạo hệ thống">
          <Text type="secondary">{dayjs(customer.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
        </Descriptions.Item>
      </Descriptions>
    </>
  );
};
