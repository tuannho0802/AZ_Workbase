import React from 'react';
import { Modal, Table, Tabs, Tag, Typography, Tooltip, Divider } from 'antd';
import { Customer, Deposit } from '@/lib/types/customer.types';
import dayjs from 'dayjs';
import { UserOutlined, CalendarOutlined, DollarOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface StatModalsProps {
  todayVisible: boolean;
  onTodayClose: () => void;
  todayData?: { todayList: Customer[]; historyList: Customer[] };
  todayLoading: boolean;

  statusVisible: boolean;
  onStatusClose: () => void;
  statusData?: { closed: Customer[]; notClosed: Customer[] };
  statusLoading: boolean;

  depositVisible: boolean;
  onDepositClose: () => void;
  depositData?: Deposit[];
  depositLoading: boolean;
}

export const StatModals: React.FC<StatModalsProps> = ({
  todayVisible, onTodayClose, todayData, todayLoading,
  statusVisible, onStatusClose, statusData, statusLoading,
  depositVisible, onDepositClose, depositData, depositLoading
}) => {

  const renderAuditTrail = (record: Customer | Deposit) => {
    const creator = (record as any).createdBy?.name?.trim() || (record as any).createdBy?.email || 'Hệ thống';
    const updater = (record as any).updatedBy?.name?.trim() || (record as any).updatedBy?.email;
    const createdAt = dayjs(record.createdAt).format('HH:mm DD/MM/YYYY');
    const updatedAt = (record as any).updatedAt ? dayjs((record as any).updatedAt).format('HH:mm DD/MM/YYYY') : null;

    return (
      <div>
        <div><Text type="secondary">Tạo bởi:</Text> {creator} ({createdAt})</div>
        {updater && <div><Text type="secondary">Sửa cuối:</Text> {updater} ({updatedAt})</div>}
      </div>
    );
  };

  const customerColumns = [
    {
      title: 'Họ và tên',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Customer) => (
        <Tooltip title={renderAuditTrail(record)}>
          <Text strong style={{ color: '#1890ff', cursor: 'help' }}>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Số điện thoại',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'Sales',
      dataIndex: 'salesUser',
      key: 'salesUser',
      render: (val: any) => val?.name?.trim() || val?.email || 'Chưa gán',
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'closed' ? 'success' : 'processing'}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
  ];

  const depositColumns = [
    {
      title: 'Khách hàng',
      dataIndex: 'customer',
      key: 'customer',
      render: (cust: any) => cust?.name || 'N/A',
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <Text strong type="success">
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}
        </Text>
      ),
    },
    {
      title: 'Ngày nạp',
      dataIndex: 'depositDate',
      key: 'depositDate',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Sales',
      key: 'sales',
      render: (_: any, record: Deposit) => record.customer?.salesUser?.name?.trim() || record.customer?.salesUser?.email || 'N/A',
    },
    {
      title: 'Người thực hiện',
      key: 'createdBy',
      render: (_: any, r: Deposit) => r.createdBy ? (
        <Tooltip title={`Ghi lúc: ${dayjs(r.createdAt).format('HH:mm DD/MM/YYYY')}`}>
          <span>{r.createdBy.name?.trim() || r.createdBy.email}</span>
        </Tooltip>
      ) : <span style={{ color: '#ccc' }}>—</span>
    },
  ];

  return (
    <>
      {/* Modal Khách mới hôm nay */}
      <Modal
        title={<span><CalendarOutlined style={{ color: '#1890ff', marginRight: 8 }} />Khách hàng mới hôm nay</span>}
        open={todayVisible}
        onCancel={onTodayClose}
        footer={null}
        width={900}
        destroyOnHidden
      >
        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          📅 Hôm nay ({todayData?.todayList?.length || 0} khách)
        </Typography.Title>
        <Table
          dataSource={todayData?.todayList}
          columns={customerColumns}
          loading={todayLoading}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: 'Chưa có khách mới hôm nay' }}
          style={{ marginBottom: 32 }}
        />

        <Divider />

        <Typography.Title level={5} style={{ marginBottom: 12 }}>
          🕐 Lịch sử nhập khách (50 gần nhất)
        </Typography.Title>
        <Table
          dataSource={todayData?.historyList}
          columns={customerColumns}
          loading={todayLoading}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, showTotal: (t) => `Tổng ${t} bản ghi` }}
          locale={{ emptyText: 'Không có dữ liệu lịch sử' }}
        />
      </Modal>

      {/* Modal Chốt thành công (Tabs) */}
      <Modal
        title={<span><UserOutlined style={{ color: '#52c41a', marginRight: 8 }} />Thống kê chốt khách</span>}
        open={statusVisible}
        onCancel={onStatusClose}
        footer={null}
        width={1000}
        destroyOnHidden
      >
        <Tabs
          defaultActiveKey="closed"
          items={[
            {
              key: 'closed',
              label: `Đã chốt (${statusData?.closed.length || 0})`,
              children: (
                <Table
                  dataSource={statusData?.closed}
                  columns={customerColumns}
                  loading={statusLoading}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                />
              ),
            },
            {
              key: 'notClosed',
              label: `Chưa chốt (${statusData?.notClosed.length || 0})`,
              children: (
                <Table
                  dataSource={statusData?.notClosed}
                  columns={customerColumns}
                  loading={statusLoading}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                />
              ),
            },
          ]}
        />
      </Modal>

      {/* Modal Tổng nạp */}
      <Modal
        title={<span><DollarOutlined style={{ color: '#faad14', marginRight: 8 }} />Lịch sử nạp tiền hệ thống</span>}
        open={depositVisible}
        onCancel={onDepositClose}
        footer={null}
        width={1000}
        destroyOnHidden
      >
        <Table
          dataSource={depositData}
          columns={depositColumns}
          loading={depositLoading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </>
  );
};
