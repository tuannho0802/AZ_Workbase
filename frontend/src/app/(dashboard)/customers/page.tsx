'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Tag, App, Button, Space, Row, Col, Typography, Tooltip } from 'antd';
import { UploadOutlined, UsergroupAddOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { customersApi } from '@/lib/api/customers.api';
import { Customer, CustomerStats } from '@/lib/types/customer.types';
import { useAuthStore } from '@/lib/stores/auth.store';
import { ImportExcelModal } from '@/components/customers/ImportExcelModal';
import { BulkAssignModal } from '@/components/customers/BulkAssignModal';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { StatsCards } from '@/components/customers/StatsCards';
import { CustomerDetailDrawer } from '@/components/customers/CustomerDetailDrawer';
import { StatModals } from '@/components/customers/StatModals';
import { useCustomersToday, useCustomersByStatus, useAllDepositsStats } from '@/lib/hooks/useCustomerStats';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { message } = App.useApp();
  
  const { user } = useAuthStore();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // States for interactive stats
  const [modalType, setModalType] = useState<'today' | 'status' | 'deposit' | null>(null);
  const { data: todayData, isLoading: todayLoading } = useCustomersToday(modalType === 'today');
  const { data: statusData, isLoading: statusLoadingDetailed } = useCustomersByStatus(modalType === 'status');
  const { data: depositData, isLoading: depositLoadingdetailed } = useAllDepositsStats(modalType === 'deposit');

  const canImport = ['admin', 'manager', 'assistant'].includes(user?.role || '');
  const canAssign = ['admin', 'manager'].includes(user?.role || '');

  const rowSelection = {
    selectedRowKeys,
    onChange: (newKeys: React.Key[]) => setSelectedRowKeys(newKeys),
    preserveSelectedRowKeys: true,
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const data = await customersApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Fetch stats error:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await customersApi.getCustomers({ 
        page, 
        limit: pageSize,
      });
      setCustomers(response.data);
      setTotal(response.total);
    } catch (error: any) {
      message.error('Không thể tải danh sách khách hàng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchStats();
  }, [page, pageSize]);

  // ✅ CRITICAL: Callback để reload table khi drawer thêm deposit/note
  const handleDrawerUpdate = async () => {
    console.log('[CUSTOMERS PAGE] Drawer updated, refetching...');
    await fetchCustomers();
    await fetchStats();
  };

  const renderAuditTrail = (record: Customer) => {
    const creator = (record as any).createdBy?.name || 'Hệ thống';
    const updater = (record as any).updatedBy?.name;
    const createdAt = dayjs(record.createdAt).format('HH:mm DD/MM/YYYY');
    const updatedAt = (record as any).updatedAt ? dayjs((record as any).updatedAt).format('HH:mm DD/MM/YYYY') : null;

    return (
      <div style={{ padding: '4px' }}>
        <div><Text type="secondary" style={{ color: 'rgba(255,255,255,0.65)' }}>Tạo bởi:</Text> <span style={{ color: '#fff' }}>{creator}</span></div>
        <div style={{ fontSize: '11px', marginBottom: 4 }}>{createdAt}</div>
        {updater && (
          <>
            <div><Text type="secondary" style={{ color: 'rgba(255,255,255,0.65)' }}>Sửa cuối:</Text> <span style={{ color: '#fff' }}>{updater}</span></div>
            <div style={{ fontSize: '11px' }}>{updatedAt}</div>
          </>
        )}
      </div>
    );
  };

  const columns: ColumnsType<Customer> = [
    {
      title: 'STT',
      key: 'index',
      width: 50,
      align: 'center',
      fixed: 'left',
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Ngày nhập',
      dataIndex: 'inputDate',
      key: 'inputDate',
      width: 110,
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Họ và tên',
      dataIndex: 'name',
      key: 'name',
      ellipsis: { showTitle: true },
      render: (text, record) => (
        <Tooltip title={renderAuditTrail(record)} mouseEnterDelay={0.5}>
          <Text strong style={{ color: '#1890ff', cursor: 'help' }}>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (source) => {
        const colors: Record<string, string> = {
          Facebook: 'blue',
          TikTok: 'magenta',
          Google: 'green',
          Instagram: 'purple',
        };
        return <Tag color={colors[source] || 'default'}>{source}</Tag>;
      },
    },
    {
      title: 'UTM (Campaign)',
      dataIndex: 'campaign',
      key: 'campaign',
      width: 120,
      ellipsis: { showTitle: true },
      render: (val) => val || <Text type="secondary">-</Text>,
    },
    {
      title: 'Sales',
      dataIndex: ['salesUser', 'name'],
      key: 'salesUser',
      width: 130,
      ellipsis: { showTitle: true },
      render: (_, record) => record.salesUser?.name ?? (
        <span style={{ color: '#bbb', fontStyle: 'italic' }}>Chưa gán</span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status) => {
        const config: Record<string, { color: string; text: string }> = {
          closed: { color: 'success', text: 'Đã chốt' },
          pending: { color: 'warning', text: 'Chờ xử lý' },
          potential: { color: 'processing', text: 'Tiềm năng' },
          lost: { color: 'error', text: 'Mất' },
          inactive: { color: 'default', text: 'Ngừng chăm sóc' },
        };
        const { color, text } = config[status] || { color: 'default', text: status };
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Nạp tiền (30 ngày)',
      dataIndex: 'totalDeposit30Days',
      key: 'totalDeposit30Days',
      width: 130,
      align: 'right',
      fixed: 'right',
      render: (val) => (
        <Text strong style={{ color: val > 0 ? '#52c41a' : '#bfbfbf' }}>
          ${(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </Text>
      ),
    },
  ];

  const renderToolbar = () => (
    <Space>
      <Button icon={<ReloadOutlined />} onClick={() => { fetchCustomers(); fetchStats(); }}>
        Làm mới
      </Button>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateOpen(true)}>
        Thêm khách hàng
      </Button>
      {canImport && (
        <Button icon={<UploadOutlined />} onClick={() => setIsImportOpen(true)}>
          Nhập Excel
        </Button>
      )}
      {canAssign && selectedRowKeys.length > 0 && (
        <Button 
          type="primary" 
          icon={<UsergroupAddOutlined />} 
          onClick={() => setIsAssignOpen(true)}
        >
          Gán cho Sales ({selectedRowKeys.length})
        </Button>
      )}
    </Space>
  );

  return (
    <>
    <StatsCards 
      stats={stats} 
      loading={statsLoading} 
      onCardClick={(type) => setModalType(type)}
    />
    
    <Card title="Danh sách khách hàng" extra={renderToolbar()}>
      <Table
        rowSelection={canAssign ? rowSelection : undefined}
        columns={columns}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        size="middle"
        bordered
        onRow={(record) => ({
          onClick: () => {
            setSelectedCustomerId(record.id);
            setIsDrawerOpen(true);
          },
          style: { cursor: 'pointer' }
        })}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (total) => `Tổng cộng ${total} khách hàng`,
          onChange: (newPage, newPageSize) => {
            setPage(newPage);
            setPageSize(newPageSize);
          },
        }}
      />
    </Card>

    <CustomerDetailDrawer
      open={isDrawerOpen}
      customerId={selectedCustomerId}
      onClose={() => setIsDrawerOpen(false)}
      onUpdate={handleDrawerUpdate}
    />

    <ImportExcelModal
      open={isImportOpen}
      onClose={() => setIsImportOpen(false)}
      onSuccess={() => fetchCustomers()}
    />

    <BulkAssignModal
      open={isAssignOpen}
      selectedRowKeys={selectedRowKeys}
      onClose={() => setIsAssignOpen(false)}
      onSuccess={() => {
        setSelectedRowKeys([]);
        fetchCustomers();
      }}
    />

    <CustomerForm
      open={isCreateOpen}
      onClose={() => setIsCreateOpen(false)}
      onSuccess={() => {
        fetchCustomers();
        fetchStats();
      }}
    />

    <StatModals
      todayVisible={modalType === 'today'}
      onTodayClose={() => setModalType(null)}
      todayData={todayData}
      todayLoading={todayLoading}

      statusVisible={modalType === 'status'}
      onStatusClose={() => setModalType(null)}
      statusData={statusData}
      statusLoading={statusLoadingDetailed}

      depositVisible={modalType === 'deposit'}
      onDepositClose={() => setModalType(null)}
      depositData={depositData}
      depositLoading={depositLoadingdetailed}
    />
    </>
  );
}
