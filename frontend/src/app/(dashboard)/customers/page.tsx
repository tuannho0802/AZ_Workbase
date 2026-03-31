'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Tag, App, Button, Space, Row, Col } from 'antd';
import { UploadOutlined, UsergroupAddOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { customersApi } from '@/lib/api/customers.api';
import { Customer, CustomerStats } from '@/lib/types/customer.types';
import { useAuthStore } from '@/lib/stores/auth.store';
import { ImportExcelModal } from '@/components/customers/ImportExcelModal';
import { BulkAssignModal } from '@/components/customers/BulkAssignModal';
import { StatsCards } from '@/components/customers/StatsCards';
import { CustomerDetailDrawer } from '@/components/customers/CustomerDetailDrawer';
import dayjs from 'dayjs';

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
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
        // search: ... (will add filter later if needed)
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

  const columns: ColumnsType<Customer> = [
    {
      title: 'STT',
      key: 'index',
      width: 60,
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Ngày nhập',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Họ tên',
      dataIndex: 'name',
      key: 'name',
      width: 180,
    },
    {
      title: 'Số điện thoại',
      dataIndex: 'phone',
      key: 'phone',
      width: 130,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      render: (email) => email || '-',
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: 110,
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
      title: 'Sales',
      dataIndex: ['salesUser', 'name'],
      key: 'salesUser',
      width: 150,
      render: (val) => val || '-',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const config: Record<string, { color: string; text: string }> = {
          closed: { color: 'success', text: 'Đã chốt' },
          pending: { color: 'warning', text: 'Chờ xử lý' },
          potential: { color: 'processing', text: 'Tiềm năng' },
          lost: { color: 'error', text: 'Mất' },
        };
        const { color, text } = config[status] || { color: 'default', text: status };
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Phòng ban',
      dataIndex: ['department', 'name'],
      key: 'department',
      width: 130,
      render: (val) => val || '-',
    },
  ];

  const renderToolbar = () => (
    <Space>
      <Button icon={<ReloadOutlined />} onClick={() => { fetchCustomers(); fetchStats(); }}>
        Làm mới
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
    <StatsCards stats={stats} loading={statsLoading} />
    
    <Card title="Danh sách khách hàng" extra={renderToolbar()}>
      <Table
        rowSelection={canAssign ? rowSelection : undefined}
        columns={columns}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
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
    />

    <ImportExcelModal
      open={isImportOpen}
      onClose={() => setIsImportOpen(false)}
      onSuccess={() => fetchCustomers()}
    />

    <BulkAssignModal
      open={isAssignOpen}
      selectedIds={selectedRowKeys as number[]}
      onClose={() => setIsAssignOpen(false)}
      onSuccess={() => {
        setSelectedRowKeys([]);
        fetchCustomers();
      }}
    />
    </>
  );
}
