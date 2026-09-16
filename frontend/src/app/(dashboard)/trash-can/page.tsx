'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Card, Button, Space, Tag, App, Popconfirm, Input, Typography, Pagination, Badge, Grid, Tooltip, Select, DatePicker, Avatar
} from 'antd';
import {
  UndoOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined, UserOutlined
} from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useRouter } from 'next/navigation';
import { customersApi } from '@/lib/api/customers.api';
import { usersApi } from '@/lib/api/users.api';
import { Customer } from '@/lib/types/customer.types';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { SourceTag } from '@/components/customers/SourceTag';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

const { Text } = Typography;

// ── Mobile Card ──────────────────────────────────────────────────────────────
function TrashMobileCard({
  record,
  index,
  page,
  pageSize,
  onRestore,
  onHardDelete,
  canHardDelete,
  getRoleColor,
  getRoleName,
}: {
  record: Customer;
  index: number;
  page: number;
  pageSize: number;
  onRestore: (id: number) => void;
  onHardDelete: (id: number) => void;
    canHardDelete: boolean;
    getRoleColor: (code?: string | null) => string;
    getRoleName: (code?: string) => string;
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
        {record.source ? <SourceTag source={record.source} /> : <Text type="secondary">-</Text>}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', marginBottom: 4 }}>
        <span>Người xóa:</span>
        {record.deletedBy ? (
          <UserMiniCard
            name={record.deletedBy.name}
            role={record.deletedBy.role}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
          />
        ) : (
          <Text type="secondary">—</Text>
        )}
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

        {canHardDelete && (
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
        )}
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

  // Filter bổ sung (trước đây chỉ có Search) - SERVER-SIDE vì thùng rác có
  // thể chứa rất nhiều bản ghi cũ theo thời gian, giống `/customers` chứ
  // không phải danh mục nhỏ (khác các trang Batch B).
  const [filterSource, setFilterSource] = useState<string | undefined>();
  const [filterSalesUserId, setFilterSalesUserId] = useState<number | undefined>();
  // ⚠️ MỚI (yêu cầu người dùng): filter "Người xóa" - lọc theo AI đã bấm
  // xóa mềm (`customer.deletedById`, xem CustomersService.getTrash()).
  const [filterDeletedById, setFilterDeletedById] = useState<number | undefined>();
  const [deletedRange, setDeletedRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const { sources: mediaSources } = useMediaSources(false);
  // Danh sách Sales cho dropdown - tái dùng API `/users/all` đã có sẵn
  // (dùng chung ở customers/page.tsx), KHÔNG suy từ dữ liệu trang hiện tại
  // (chỉ 20 dòng/trang, sẽ đổi liên tục theo trang - trải nghiệm tệ). Dùng
  // CHUNG danh sách này cho cả filter "Sales phụ trách" LẪN "Người xóa" -
  // ai cũng có thể là người bấm xóa, không riêng gì Sales.
  const [salesOptions, setSalesOptions] = useState<{ id: number; name: string; role?: string }[]>([]);
  useEffect(() => {
    usersApi.getAllForSelect().then(setSalesOptions).catch(() => { });
  }, []);
  // ⚠️ MỚI (yêu cầu người dùng - "dropdown chưa dùng Color tag đúng"): tô
  // màu Tag vai trò trong dropdown "Sales phụ trách"/"Người xóa" đúng theo
  // màu Admin đã cấu hình ở /phan-quyen, cùng pattern với SalesUserSelect.tsx/
  // UserMiniCard.tsx (thay vì Select trơn chỉ hiện tên như trước).
  const { getRoleColor } = useRoleColorMap();
  const { roleColors: allRoles } = useRoleColors();
  const roleNameMap = useMemo(() => new Map(allRoles.map(r => [r.code, r.name])), [allRoles]);
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');

  const { message } = App.useApp();
  const { user } = useAuthStore();
  const router = useRouter();
  // ⚠️ FIX BUG THẬT (rà soát permission): trước đây gate cứng
  // `user.role !== 'admin'` ở cả 3 chỗ (redirect, fetch guard, render guard)
  // - trang này thực ra được BE bảo vệ bởi `customers.trash_manage` (xem
  // @RequirePermission('customers.trash_manage') ở customers.controller.ts,
  // GET trash + restore), KHÔNG khoá cứng theo role. Nếu Admin cấp quyền
  // này cho role khác qua trang Phân quyền, role đó vẫn bị chặn nhầm ở FE
  // dù BE đã cho phép.
  //
  // ⚠️ FIX BUG THẬT #2 (phát hiện khi audit lại sau migration
  // `SplitCustomersHardDeletePermission`): endpoint hard-delete
  // (`DELETE /customers/trash/:id/hard-delete`) đã tách sang permission
  // RIÊNG `customers.hard_delete` (khác `customers.trash_manage`, xem
  // `customers.controller.ts`) - nhưng nút "Xóa vĩnh viễn" ở trang này
  // trước đó vẫn hiện cho BẤT KỲ ai vào được trang (chỉ cần
  // `customers.trash_manage`), không check riêng `customers.hard_delete`.
  // Hậu quả: 1 role chỉ được cấp "xem/khôi phục thùng rác" (an toàn) vẫn
  // thấy nút xoá vĩnh viễn, bấm vào mới bị BE 403 - vi phạm nguyên tắc "BE
  // 403 thì FE phải tự ẩn UI trước". Sửa: thêm `canHardDelete` riêng, ẩn
  // hẳn nút/Popconfirm xoá vĩnh viễn (cả mobile card lẫn desktop table)
  // nếu không có quyền này.
  const { can, isLoading: permissionsLoading } = useMyPermissions();
  const canAccessTrash = can('customers.trash_manage');
  const canHardDelete = can('customers.hard_delete');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!permissionsLoading && user && !canAccessTrash) {
      message.error('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [user, canAccessTrash, permissionsLoading, router, message]);

  const fetchTrash = useCallback(async () => {
    if (!user || !canAccessTrash) return;
    setLoading(true);
    try {
      const res = await customersApi.getTrash({
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        source: filterSource,
        salesUserId: filterSalesUserId,
        deletedById: filterDeletedById,
        dateFrom: deletedRange?.[0] ? deletedRange[0].startOf('day').toISOString() : undefined,
        dateTo: deletedRange?.[1] ? deletedRange[1].endOf('day').toISOString() : undefined,
      });
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch {
      message.error('Lấy danh sách thùng rác thất bại');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, filterSource, filterSalesUserId, filterDeletedById, deletedRange, user, canAccessTrash, message]);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  // Reset về trang 1 khi đổi filter (tránh đứng ở trang trống nếu tập kết
  // quả mới có ít trang hơn trang đang đứng).
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterSource, filterSalesUserId, filterDeletedById, deletedRange]);

  const handleResetFilters = () => {
    setSearch('');
    setFilterSource(undefined);
    setFilterSalesUserId(undefined);
    setFilterDeletedById(undefined);
    setDeletedRange(null);
    setPage(1);
  };

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
      // ⚠️ FIX BUG THẬT: cột này trước đây KHÔNG khai width - dưới
      // table-layout:fixed (CSS .customer-table), cột không khai width sẽ
      // bị co gần bằng 0 khi các cột % khác giành hết chỗ trên container
      // hẹp (laptop nhỏ), giống hệt bug checkbox đã fix ở customers/page.tsx.
      // Khai width cố định + bật `scroll.x` ở <Table> bên dưới để không bị
      // crop tên khách hàng.
      width: isLaptop ? 160 : 190,
      onCell: () => ({ className: 'col-name' }),
      render: (text: string) => <Text strong style={{ color: '#1890ff' }}>{text}</Text>,
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
      width: isLaptop ? 100 : 115,
      render: (val: string) => val || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SĐT</span>,
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: isLaptop ? 80 : 90,
      render: (val: string) => val ? <SourceTag source={val} /> : '-',
    },
    {
      title: 'Sales phụ trách',
      key: 'salesUser',
      width: isLaptop ? 140 : 160,
      render: (_: any, record: Customer) => record.salesUser?.name || '-',
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: isLaptop ? 100 : 110,
      render: (val: string) => dayjs(val).format('DD/MM/YYYY'),
    },
    {
      title: 'Ngày xóa',
      dataIndex: 'deletedAt',
      key: 'deletedAt',
      width: isLaptop ? 130 : 145,
      render: (val: string) => dayjs(val).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Người xóa',
      key: 'deletedBy',
      width: isLaptop ? 200 : 230,
      render: (_: any, record: Customer) =>
        record.deletedBy ? (
          <UserMiniCard
            name={record.deletedBy.name}
            role={record.deletedBy.role}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
          />
        ) : (
          <Text type="secondary">—</Text>
        ),
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

          {canHardDelete && (
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
          )}
        </Space>
      ),
    },
  ];

  if (permissionsLoading) return null;
  if (user && !canAccessTrash) return null;

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
          <Space wrap>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Tìm tên, SĐT..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
            <Select
              placeholder="Nguồn"
              value={filterSource}
              onChange={setFilterSource}
              allowClear
              style={{ width: 140 }}
              options={mediaSources.map(s => ({ value: s.name, label: <SourceTag source={s.name} /> }))}
            />
            <Select
              placeholder="Sales phụ trách"
              value={filterSalesUserId}
              onChange={setFilterSalesUserId}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              options={salesOptions.map(u => ({ value: u.id, label: u.name, user: u }))}
              optionRender={(option) => {
                const u = (option.data as { user: { name: string; role?: string } }).user;
                return (
                  <Space align="center" size={6}>
                    <Avatar size={20} icon={<UserOutlined />} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
                      {u.name?.[0]?.toUpperCase()}
                    </Avatar>
                    <Text style={{ fontSize: 13 }}>{u.name}</Text>
                    {u.role && (
                      <Tag color={getRoleColor(u.role)} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                        {getRoleName(u.role)}
                      </Tag>
                    )}
                  </Space>
                );
              }}
            />
            <Select
              placeholder="Người xóa"
              value={filterDeletedById}
              onChange={setFilterDeletedById}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              options={salesOptions.map(u => ({ value: u.id, label: u.name, user: u }))}
              optionRender={(option) => {
                const u = (option.data as { user: { name: string; role?: string } }).user;
                return (
                  <Space align="center" size={6}>
                    <Avatar size={20} icon={<UserOutlined />} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
                      {u.name?.[0]?.toUpperCase()}
                    </Avatar>
                    <Text style={{ fontSize: 13 }}>{u.name}</Text>
                    {u.role && (
                      <Tag color={getRoleColor(u.role)} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                        {getRoleName(u.role)}
                      </Tag>
                    )}
                  </Space>
                );
              }}
            />
            <RangePicker
              placeholder={['Xóa từ', 'Xóa đến']}
              value={deletedRange}
              onChange={v => setDeletedRange(v as [Dayjs | null, Dayjs | null] | null)}
              format="DD/MM/YYYY"
              style={{ width: 240 }}
            />
            <Button onClick={handleResetFilters}>Xóa bộ lọc</Button>
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
                  canHardDelete={canHardDelete}
                  getRoleColor={getRoleColor}
                  getRoleName={getRoleName}
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
              // Xem chú thích chi tiết ở customers/page.tsx: bật scroll ngang
              // để không bị crop chữ khi container hẹp (laptop nhỏ) thay vì
              // để table-layout:fixed bóp nhỏ các cột.
              scroll={{ x: 'max-content' }}
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