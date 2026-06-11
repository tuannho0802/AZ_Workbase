'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table, Card, Button, Space, Tag, App, Popconfirm, Input, Typography, Pagination, Row, Col, Badge
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
  onRestore,
  onHardDelete,
}: {
  record: Customer;
  onRestore: (id: number) => void;
  onHardDelete: (id: number) => void;
}) {
  return (
    <Card
      size="small"
      variant="outlined"
      style={{ marginBottom: 10 }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <Text strong style={{ fontSize: 14, color: '#ff4d4f' }}>{record.name}</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <PhoneOutlined style={{ fontSize: 11, color: '#8c8c8c' }} />
            <Text style={{ fontSize: 12, color: '#8c8c8c' }}>{record.phone || 'Chưa có SĐT'}</Text>
          </div>
        </div>
        {record.source && <Tag color="blue">{record.source}</Tag>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, fontSize: 12, color: '#595959' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <TeamOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
          <Text style={{ fontSize: 12 }}>
            Sales: {record.salesUser ? <Text strong>{record.salesUser.name}</Text> : <Text italic type="secondary">Chưa gán</Text>}
          </Text>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <CalendarOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
          <Text style={{ fontSize: 12 }}>
            Đã xóa: <Text type="danger">{record.deletedAt ? dayjs(record.deletedAt).format('DD/MM/YYYY HH:mm') : '—'}</Text>
          </Text>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
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
          description="Hành động này KHÔNG THỂ hoàn tác. Toàn bộ dữ liệu sẽ mất."
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function TrashCanPage() {
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
      width: 50,
      align: 'center' as const,
      render: (_: any, __: any, index: number) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Tên KH',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
      width: '11%',
      render: (val: string) => val || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SĐT</span>,
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: '8%',
      render: (val: string) => val ? <Tag color="blue">{val}</Tag> : '-',
    },
    {
      title: 'Sales phụ trách',
      key: 'salesUser',
      width: '15%',
      render: (_: any, record: Customer) => record.salesUser?.name || '-',
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: '10%',
      render: (val: string) => dayjs(val).format('DD/MM/YYYY'),
    },
    {
      title: 'Ngày xóa',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      width: '10%',
      render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 200,
      render: (_: any, record: Customer) => (
        <Space size={8}>
          <Popconfirm
            title="Khôi phục khách hàng này?"
            onConfirm={() => handleRestore(record.id)}
            okText="Khôi phục"
            cancelText="Hủy"
          >
            <Button type="primary" size="small" icon={<UndoOutlined />}>
              Khôi phục
            </Button>
          </Popconfirm>

          <Popconfirm
            title="Xóa vĩnh viễn?"
            description="Hành động này KHÔNG THỂ hoàn tác. Toàn bộ dữ liệu sẽ mất."
            onConfirm={() => handleHardDelete(record.id)}
            okText="Xóa vĩnh viễn"
            okButtonProps={{ danger: true }}
            cancelText="Hủy"
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              Xóa vĩnh viễn
            </Button>
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
              data.map(record => (
                <TrashMobileCard
                  key={record.id}
                  record={record}
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
