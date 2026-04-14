'use client';

import { useEffect, useState, useMemo } from 'react';
import { Table, Card, Tag, App, Button, Space, Row, Col, Typography, Tooltip, Input, Select, DatePicker } from 'antd';
import { UploadOutlined, UsergroupAddOutlined, ReloadOutlined, PlusOutlined, SearchOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { customersApi } from '@/lib/api/customers.api';
import { Customer, CustomerStats } from '@/lib/types/customer.types';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/stores/auth.store';
import { ImportExcelModal } from '@/components/customers/ImportExcelModal';
import { BulkAssignModal } from '@/components/customers/BulkAssignModal';
import { CustomerForm } from '@/components/customers/CustomerForm';
import { StatsCards } from '@/components/customers/StatsCards';
import { CustomerDetailDrawer } from '@/components/customers/CustomerDetailDrawer';
import { StatModals } from '@/components/customers/StatModals';
import { useCustomersToday, useCustomersByStatus, useAllDepositsStats } from '@/lib/hooks/useCustomerStats';
import { useCustomers } from '@/lib/hooks/useCustomers';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { usersApi } from '@/lib/api/users.api';
import dayjs from 'dayjs';
import { CustomerFilters } from '@/components/customers/CustomerFilters';

const { Text } = Typography;

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  
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
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // States for interactive stats
  const [modalType, setModalType] = useState<'today' | 'status' | 'deposit' | null>(null);
  const [depositSortBy, setDepositSortBy] = useState<string>('depositDate');
  const [depositSortOrder, setDepositSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  
  // ✅ Labels for Deposit Column Header
  const depositRangeForColumnLabel = useMemo(() => {
    if (dateFrom && dateTo) {
      return `${dateFrom.format('DD/MM/YY')} → ${dateTo.format('DD/MM/YY')}`;
    }
    return '30 ngày gần nhất';
  }, [dateFrom, dateTo]);

  const { data: todayData, isLoading: todayLoading } = useCustomersToday(modalType === 'today');
  const { data: statusData, isLoading: statusLoadingDetailed } = useCustomersByStatus(modalType === 'status');
  const { data: depositData, isLoading: depositLoadingdetailed } = useAllDepositsStats(
    modalType === 'deposit',
    {
      startDate: dateRange?.[0]?.format('YYYY-MM-DD') || dateFrom?.format('YYYY-MM-DD') || undefined,
      endDate: dateRange?.[1]?.format('YYYY-MM-DD') || dateTo?.format('YYYY-MM-DD') || undefined,
      sortBy: depositSortBy,
      sortOrder: depositSortOrder,
    }
  );

  const { data: customersResponse, isLoading: loading, refetch: refetchCustomers } = useCustomers({
    page,
    limit: pageSize,
    search: debouncedSearch,
    source,
    status,
    salesUserId,
    sortField,
    sortOrder,
    dateFrom: dateFrom?.format('YYYY-MM-DD'),
    dateTo: dateTo?.format('YYYY-MM-DD'),
  });

  const customers = customersResponse?.data || [];
  const total = customersResponse?.total || 0;

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

  useEffect(() => {
    fetchStats();
  }, [page, pageSize, debouncedSearch, source, status, salesUserId, dateFrom, dateTo, sortField, sortOrder]);

  const handleDrawerUpdate = async () => {
    await refetchCustomers();
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

  const columns: ColumnsType<Customer> = useMemo(() => [
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
      render: (val) => val ? val : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SDT</span>,
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
      title: 'UTM',
      dataIndex: 'campaign',
      key: 'campaign',
      width: 120,
      ellipsis: { showTitle: true },
    },
    {
      title: 'Sales',
      dataIndex: 'activeAssignees',
      key: 'salesUser',
      width: 160,
      render: (_, record: any) => {
        // Fallback for 1:1 legacy if activeAssignees is not populated
        const assignees = record.activeAssignees?.length > 0 
          ? record.activeAssignees 
          : (record.salesUser ? [record.salesUser] : []);
        
        if (assignees.length === 0) {
          return <span style={{ color: '#bbb', fontStyle: 'italic' }}>Chưa gán</span>;
        }

        if (assignees.length === 1) {
          return <Tag color="blue">{assignees[0].name}</Tag>;
        }

        return (
          <Space size={[0, 4]} wrap>
            {assignees.slice(0, 2).map((a: any) => (
              <Tag color="blue" key={a.id}>{a.name}</Tag>
            ))}
            {assignees.length > 2 && (
              <Tooltip title={assignees.map((a: any) => a.name).join(', ')}>
                <Tag>+{assignees.length - 2}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
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
      title: () => (
        <div>
          <div>Nạp tiền</div>
          <div style={{ fontSize: '10px', color: '#8c8c8c', fontWeight: 'normal' }}>
            ({depositRangeForColumnLabel})
          </div>
        </div>
      ),
      dataIndex: 'totalDeposit30Days',
      key: 'totalDeposit30Days',
      width: 140,
      align: 'right',
      fixed: 'right',
      render: (val) => (
        <Tooltip title="Tổng tiền nạp dựa trên khoảng ngày">
          <Text strong style={{ color: Number(val) > 0 ? '#52c41a' : '#bfbfbf' }}>
            ${(Number(val) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
        </Tooltip>
      ),
    },
  ], [depositRangeForColumnLabel, page, pageSize]);

  const handleFiltersChange = (newFilters: any) => {
    if (newFilters.search !== undefined) setSearchText(newFilters.search);
    if (newFilters.source !== undefined) setSource(newFilters.source);
    if (newFilters.status !== undefined) setStatus(newFilters.status);
    if (newFilters.salesUserId !== undefined) setSalesUserId(newFilters.salesUserId);
    if (newFilters.dateFrom !== undefined) setDateFrom(newFilters.dateFrom ? dayjs(newFilters.dateFrom) : null);
    if (newFilters.dateTo !== undefined) setDateTo(newFilters.dateTo ? dayjs(newFilters.dateTo) : null);
    if (newFilters.page) setPage(newFilters.page);
  };

  const handleTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<Customer> | SorterResult<Customer>[]
  ) => {
    if (pagination.current) setPage(pagination.current);
    if (pagination.pageSize) setPageSize(pagination.pageSize);

    const sorterResult = Array.isArray(sorter) ? sorter[0] : sorter;
    
    if (sorterResult.field && sorterResult.order) {
      setSortField(sorterResult.field as string);
      setSortOrder(sorterResult.order === 'ascend' ? 'ASC' : 'DESC');
    } else {
      setSortField('createdAt');
      setSortOrder('DESC');
    }
  };

  const renderToolbar = () => (
    <Space>
      <Button icon={<ReloadOutlined />} onClick={() => { refetchCustomers(); fetchStats(); }}>
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
      <CustomerFilters
        filters={{
          search: searchText,
          source,
          status,
          salesUserId,
          dateFrom: dateFrom?.format('YYYY-MM-DD'),
          dateTo: dateTo?.format('YYYY-MM-DD'),
        }}
        salesUsers={salesUsers}
        onFiltersChange={handleFiltersChange}
      />
      <Table
        className="customer-table"
        rowSelection={canAssign ? rowSelection : undefined}
        columns={columns.map(col => ({
          ...col,
          sorter: ['name', 'phone', 'status', 'inputDate', 'createdAt', 'totalDeposit30Days'].includes(col.key as string),
          sortOrder: sortField === col.key ? (sortOrder === 'ASC' ? 'ascend' : 'descend') : null,
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
      onSuccess={() => refetchCustomers()}
    />

    <BulkAssignModal
      open={isAssignOpen}
      selectedRowKeys={selectedRowKeys}
      onClose={() => setIsAssignOpen(false)}
      onSuccess={() => {
        setSelectedRowKeys([]);
        refetchCustomers();
      }}
    />

    <CustomerForm
      open={isCreateOpen}
      onClose={() => setIsCreateOpen(false)}
      onSuccess={() => {
        refetchCustomers();
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
      depositDateRange={dateRange}
      onDepositDateRangeChange={setDateRange}
      depositSortBy={depositSortBy}
      depositSortOrder={depositSortOrder}
      onDepositSortChange={(field, order) => {
        setDepositSortBy(field);
        setDepositSortOrder(order);
      }}
    />
    </>
  );
}
