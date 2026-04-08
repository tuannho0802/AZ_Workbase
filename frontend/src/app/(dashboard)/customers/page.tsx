'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Tag, App, Button, Space, Row, Col, Typography, Tooltip, Input, Select, DatePicker } from 'antd';
import { UploadOutlined, UsergroupAddOutlined, ReloadOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
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
import { useDebounce } from '@/lib/hooks/useDebounce';
import { usersApi } from '@/lib/api/users.api';
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

  // Search & Filter States
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 500);
  const [source, setSource] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [salesUserId, setSalesUserId] = useState<number | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // States for interactive stats
  const [modalType, setModalType] = useState<'today' | 'status' | 'deposit' | null>(null);
  const { data: todayData, isLoading: todayLoading } = useCustomersToday(modalType === 'today');
  const { data: statusData, isLoading: statusLoadingDetailed } = useCustomersByStatus(modalType === 'status');
  const { data: depositData, isLoading: depositLoadingdetailed } = useAllDepositsStats(modalType === 'deposit');

  const [salesUsers, setSalesUsers] = useState<{ id: number; name: string }[]>([]);

  const fetchSalesUsers = async () => {
    try {
      const users = await usersApi.getAllForSelect();
      setSalesUsers(users);
    } catch (error) {
      console.error('Fetch sales users error:', error);
    }
  };

  useEffect(() => {
    fetchSalesUsers();
  }, []);

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
        search: debouncedSearch,
        source,
        status,
        salesUserId,
        sortBy,
        sortOrder,
        dateFrom: dateRange?.[0]?.startOf('day').toISOString(),
        dateTo: dateRange?.[1]?.endOf('day').toISOString(),
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
  }, [page, pageSize, debouncedSearch, source, status, salesUserId, dateRange, sortBy, sortOrder]);

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
      key: 'stt',
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

  const renderFilters = () => (
    <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
      <Space wrap>
        <Input
          placeholder="Tìm kiếm theo tên, SĐT, UTM..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{ width: 300 }}
        />
        <Select
          placeholder="Nguồn"
          allowClear
          style={{ width: 140 }}
          value={source}
          onChange={setSource}
          options={[
            { value: 'Facebook', label: 'Facebook' },
            { value: 'TikTok', label: 'TikTok' },
            { value: 'Google', label: 'Google' },
            { value: 'Instagram', label: 'Instagram' },
            { value: 'LinkedIn', label: 'LinkedIn' },
            { value: 'Other', label: 'Khác' },
          ]}
        />
        <Select
          placeholder="Trạng thái"
          allowClear
          style={{ width: 140 }}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: 'Chờ xử lý' },
            { value: 'potential', label: 'Tiềm năng' },
            { value: 'closed', label: 'Đã chốt' },
            { value: 'lost', label: 'Mất' },
            { value: 'inactive', label: 'Ngừng chăm sóc' },
          ]}
        />
        <Select
          placeholder="Sales"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 160 }}
          value={salesUserId}
          onChange={setSalesUserId}
          options={salesUsers.map(u => ({ value: u.id, label: u.name }))}
        />
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(dates) => setDateRange(dates as any)}
          placeholder={['Từ ngày', 'Đến ngày']}
          style={{ width: 260 }}
        />
      </Space>
    </Space>
  );

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Customer> | SorterResult<Customer>[]
  ) => {
    // Pagination
    if (pagination.current) setPage(pagination.current);
    if (pagination.pageSize) setPageSize(pagination.pageSize);

    // Sorting
    const sorterResult = Array.isArray(sorter) ? sorter[0] : sorter;
    if (sorterResult.field) {
      setSortBy(sorterResult.field as string);
      setSortOrder(sorterResult.order === 'ascend' ? 'ASC' : 'DESC');
    }
  };

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
      {renderFilters()}
      <Table
        rowSelection={canAssign ? rowSelection : undefined}
        columns={columns.map(col => ({
          ...col,
          sorter: ['name', 'phone', 'status', 'inputDate', 'createdAt'].includes(col.key as string) ? true : false,
          sortOrder: sortBy === col.key ? (sortOrder === 'ASC' ? 'ascend' : 'descend') : null,
        }))}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        size="middle"
        bordered
        onChange={handleTableChange}
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
