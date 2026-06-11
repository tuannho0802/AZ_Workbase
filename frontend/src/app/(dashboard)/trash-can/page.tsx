'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Space, Tag, App, Popconfirm, Input, Typography, Pagination, Row, Col, Badge, Grid, Tooltip
} from 'antd';
import {
  UndoOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined,
  UserOutlined, PhoneOutlined, CalendarOutlined, TeamOutlined
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useRouter } from 'next/navigation';
import { customersApi } from '@/lib/api/customers.api';
import { Customer } from '@/lib/types/customer.types';
import { useDebounce } from '@/lib/hooks/useDebounce';
import dayjs from 'dayjs';

const { Text } = Typography;

// ── Mobile Card ──────────────────────────────────────────────────────────────
function TrashMobileCard({
  record,
  index,
  page,
  pageSize,
  onRestore,
  onHardDelete,
}: {
  record: Customer;
  index: number;
  page: number;
  pageSize: number;
  onRestore: (id: number) => void;
  onHardDelete: (id: number) => void;
}) {
  return (
    <Card
      size="small"
      variant="outlined"
      style={{ marginBottom: 8 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 11 }}>#{(page - 1) * pageSize + index + 1}</Text>
          <Text strong style={{ color: '#ff4d4f' }}>{record.name}</Text>
        </Space>
        {record.source ? <Tag color="blue">{record.source}</Tag> : <Text type="secondary">-</Text>}
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 12, color: '#555' }}>
        <span>📞 {record.phone || 'Chưa có SĐT'}</span>
        <span>📅 {dayjs(record.createdAt).format('DD/MM/YY')}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Space size={4}>
          {record.salesUser ? <Tag color="blue">Sales: {record.salesUser.name}</Tag> : <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa có Sales</span>}
        </Space>
        <Text style={{ fontSize: 12 }}>
          Xóa: <Text type="danger">{record.deletedAt ? dayjs(record.deletedAt).format('DD/MM/YY HH:mm') : '—'}</Text>
        </Text>
      </div>
      
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Popconfirm
          title="Khôi phục khách hàng này?"
          onConfirm={() => onRestore(record.id)}
          okText="Khôi phục"
          cancelText="Hủy"
        >
          <Button type="primary" size="small" icon={<UndoOutlined />} style={{ flex: 1 }}>
            Khôi phục
          </Button>
        </Popconfirm>

        <Popconfirm
          title="Xóa vĩnh viễn?"
          description="Hành động này KHÔNG THỂ hoàn tác."
          onConfirm={() => onHardDelete(record.id)}
          okText="Xóa vĩnh viễn"
          okButtonProps={{ danger: true }}
          cancelText="Hủy"
        >
          <Button danger size="small" icon={<DeleteOutlined />} style={{ flex: 1 }}>
            Xóa vĩnh viễn
          </Button>
        </Popconfirm>
      </div>
    </Card>
  );
}

const { useBreakpoint } = Grid;

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TrashCanPage() {
  const screens = useBreakpoint();
  const isLaptop = !!(screens.md && !screens.xl); // 768px - 1279px

  const [isMobile, setIsMobile] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);

  const { message } = App.useApp();
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      message.error('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [user, router, message]);

  const fetchTrash = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    setLoading(true);
    try {
      const res = await customersApi.getTrash({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (error) {
      message.error('Lấy danh sách thùng rác thất bại');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, user, message]);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  const handleRestore = async (id: number) => {
    try {
      await customersApi.restoreCustomer(id);
      message.success('Khôi phục khách hàng thành công');
      fetchTrash();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Khôi phục thất bại');
    }
  };

  const handleHardDelete = async (id: number) => {
    try {
      await customersApi.hardDeleteCustomer(id);
      message.success('Đã xóa vĩnh viễn khách hàng');
      fetchTrash();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Xóa vĩnh viễn thất bại');
    }
  };

  const columns = [
    {
      title: 'STT',
      key: 'stt',
      width: 55,
      align: 'center' as const,
      render: (_: any, __: any, index: number) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Họ và tên',
      dataIndex: 'name',
      key: 'name',
      onCell: () => ({ className: 'col-name' }),
      render: (text: string) => <Text strong style={{ color: '#1890ff' }}>{text}</Text>,
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
      width: '15%',
      render: (val: string) => val || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SĐT</span>,
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: '12%',
      render: (val: string) => val ? <Tag color="blue">{val}</Tag> : '-',
    },
    {
      title: 'Sales phụ trách',
      key: 'salesUser',
      width: isLaptop ? '18%' : '20%',
      render: (_: any, record: Customer) => record.salesUser?.name || '-',
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: '12%',
      render: (val: string) => dayjs(val).format('DD/MM/YYYY'),
    },
    {
      title: 'Ngày xóa',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      width: '15%',
      render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: isLaptop ? 80 : 90,
      align: 'center' as const,
      render: (_: any, record: Customer) => (
        <Space size={0}>
          <Popconfirm
            title="Khôi phục khách hàng này?"
            onConfirm={() => handleRestore(record.id)}
            okText="Khôi phục"
            cancelText="Hủy"
          >
            <Tooltip title="Khôi phục">
              <Button type="text" style={{ color: '#1890ff' }} size="small" icon={<UndoOutlined />} />
            </Tooltip>
          </Popconfirm>

          <Popconfirm
            title="Xóa vĩnh viễn?"
            description="Hành động này KHÔNG THỂ hoàn tác."
            onConfirm={() => handleHardDelete(record.id)}
            okText="Xóa vĩnh viễn"
            okButtonProps={{ danger: true }}
            cancelText="Hủy"
          >
            <Tooltip title="Xóa vĩnh viễn">
              <Button type="text" danger size="small" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (user && user.role !== 'admin') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats Bar */}
      <Card variant="outlined" styles={{ body: { padding: '16px 20px' } }}>
        <Space size={16}>
          <Text style={{ fontSize: 16, fontWeight: 500 }}>📁 Thùng rác khách hàng</Text>
          <Badge count={total} overflowCount={9999} showZero color="#ff4d4f" style={{ fontSize: 13 }} />
        </Space>
      </Card>

      {/* Main Container */}
      <Card
        title="Danh sách đã xóa mềm"
        extra={
          <Space>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Tìm tên, SĐT..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: 220 }}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchTrash} loading={loading}>
              Làm mới
            </Button>
          </Space>
        }
      >
        {isMobile ? (
          <div>
            {data.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
                Thùng rác trống
              </div>
            ) : (
              data.map((record, index) => (
                <TrashMobileCard
                  key={record.id}
                  record={record}
                  index={index}
                  page={page}
                  pageSize={pageSize}
                  onRestore={handleRestore}
                  onHardDelete={handleHardDelete}
                />
              ))
            )}
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              size="small"
              simple
              onChange={p => setPage(p)}
              style={{ textAlign: 'center', marginTop: 12 }}
            />
          </div>
        ) : (
          <Table
            className="customer-table"
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{
              current: page,
              pageSize: pageSize,
              total: total,
              showSizeChanger: false,
              showTotal: t => `Tổng cộng ${t} khách hàng đã xóa`,
              onChange: p => setPage(p),
            }}
          />
        )}
      </Card>
    </div>
  );
}
