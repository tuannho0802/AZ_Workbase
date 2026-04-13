import React, { useState, useMemo } from 'react';
import { Modal, Table, Tabs, Tag, Typography, Tooltip, Divider, DatePicker, Space, Statistic } from 'antd';
import { Customer, Deposit } from '@/lib/types/customer.types';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { UserOutlined, CalendarOutlined, DollarOutlined, FilterOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text, Link } = Typography;
const { RangePicker } = DatePicker;

// Quick-select presets for RangePicker
const rangePresets: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: 'Hôm nay', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
  { label: '7 ngày qua', value: [dayjs().subtract(7, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: '30 ngày qua', value: [dayjs().subtract(30, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs().endOf('day')] },
];

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
  // Date range & Sort control — lifted to parent for query refetch
  depositDateRange: [Dayjs | null, Dayjs | null] | null;
  onDepositDateRangeChange: (dates: [Dayjs | null, Dayjs | null] | null) => void;
  depositSortBy?: string;
  depositSortOrder?: 'ASC' | 'DESC';
  onDepositSortChange?: (field: string, order: 'ASC' | 'DESC') => void;
}

export const StatModals: React.FC<StatModalsProps> = ({
  todayVisible, onTodayClose, todayData, todayLoading,
  statusVisible, onStatusClose, statusData, statusLoading,
  depositVisible, onDepositClose, depositData, depositLoading,
  depositDateRange, onDepositDateRangeChange,
  depositSortBy, depositSortOrder, onDepositSortChange
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

  // --- Deposit Table: Columns with server-side sorting ---
  const depositColumns: ColumnsType<Deposit> = [
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
      sorter: true,
      sortOrder: depositSortBy === 'amount' ? (depositSortOrder === 'ASC' ? 'ascend' : 'descend') : null,
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
      sorter: true,
      sortOrder: depositSortBy === 'depositDate' ? (depositSortOrder === 'ASC' ? 'ascend' : 'descend') : null,
      render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Sales',
      key: 'sales',
      render: (_: any, record: Deposit) => record.customer?.salesUser?.name?.trim() || record.customer?.salesUser?.email || 'N/A',
    },
    {
      title: 'Sàn',
      dataIndex: 'broker',
      key: 'broker',
      ellipsis: true,
      width: 100,
      render: (val: string) => val || <span style={{ color: '#ccc' }}>—</span>
    },
    {
      title: 'Ghi chú',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
      width: 150,
      render: (val: string) => val || <span style={{ color: '#ccc' }}>—</span>
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

  const handleDepositTableChange = (pagination: any, filters: any, sorter: any) => {
    if (onDepositSortChange && sorter.field) {
      const order = sorter.order === 'ascend' ? 'ASC' : 'DESC';
      onDepositSortChange(sorter.field, order);
    }
  };

  // --- Summary stats for the filtered deposit data ---
  const depositSummary = useMemo(() => {
    if (!depositData || depositData.length === 0) return { count: 0, totalAmount: 0 };
    return {
      count: depositData.length,
      totalAmount: depositData.reduce((sum, d) => sum + Number(d.amount), 0),
    };
  }, [depositData]);

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

      {/* Modal Tổng nạp — Enhanced with Date Filter & Sorting */}
      <Modal
        title={<span><DollarOutlined style={{ color: '#faad14', marginRight: 8 }} />Lịch sử nạp tiền hệ thống</span>}
        open={depositVisible}
        onCancel={onDepositClose}
        footer={null}
        width={1100}
        destroyOnHidden
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 16,
          background: '#fafafa',
          padding: '16px 24px',
          borderRadius: 12,
          border: '1px solid #f0f0f0'
        }}>
          <Space align="center" size="middle">
            <FilterOutlined style={{ color: '#8c8c8c' }} />
            <RangePicker
              presets={rangePresets}
              value={depositDateRange as [Dayjs, Dayjs] | null}
              onChange={(dates) => onDepositDateRangeChange(dates as [Dayjs | null, Dayjs | null] | null)}
              placeholder={['Từ ngày', 'Đến ngày']}
              style={{ width: 320 }}
              allowClear
            />
            {depositDateRange && (
              <Tag color="blue" closable onClose={() => onDepositDateRangeChange(null)} style={{ marginLeft: 8 }}>
                {dayjs(depositDateRange[0]).format('DD/MM/YYYY')} - {dayjs(depositDateRange[1]).format('DD/MM/YYYY')}
              </Tag>
            )}
          </Space>

          <Space size="large">
            <Statistic
              title={<span style={{ fontWeight: 500, color: '#8c8c8c' }}>Số giao dịch</span>}
              value={depositSummary.count}
              valueStyle={{ fontSize: 20, color: '#1890ff', fontWeight: 600 }}
              prefix={<UserOutlined style={{ fontSize: 16 }} />}
            />
            <Statistic
              title={<span style={{ fontWeight: 500, color: '#8c8c8c' }}>Tổng tiền nạp</span>}
              value={depositSummary.totalAmount}
              precision={2}
              prefix={<DollarOutlined style={{ fontSize: 16 }} />}
              suffix="USD"
              valueStyle={{ fontSize: 20, color: '#52c41a', fontWeight: 600 }}
            />
          </Space>
        </div>

        <Table
          dataSource={depositData}
          columns={depositColumns}
          loading={depositLoading}
          rowKey="id"
          onChange={handleDepositTableChange}
          pagination={{ 
            pageSize: 15, 
            showTotal: (t) => `Tổng ${t} giao dịch`,
            showSizeChanger: true,
            pageSizeOptions: ['15', '30', '50', '100']
          }}
          size="middle"
          scroll={{ x: 800 }}
          locale={{ 
            emptyText: (
              <div style={{ padding: 20 }}>
                <Text type="secondary">Không tìm thấy giao dịch nào trong khoảng thời gian này</Text>
                {depositDateRange && (
                  <div style={{ marginTop: 8 }}>
                    <Link 
                      onClick={() => onDepositDateRangeChange(null)}
                    >
                      Xóa bộ lọc ngày
                    </Link>
                  </div>
                )}
              </div>
            )
          }}
        />
      </Modal>
    </>
  );
};
