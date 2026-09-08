'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { Table, Card, Tag, App, Button, Space, Typography, Tooltip, Divider, Collapse, Pagination, Grid, Popconfirm, Select } from 'antd';
import { UploadOutlined, UsergroupAddOutlined, ReloadOutlined, PlusOutlined, InfoCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { customersApi } from '@/lib/api/customers.api';
import { Customer, CustomerStats, RecentNote } from '@/lib/types/customer.types';
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
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDepartments } from '@/lib/hooks/useDepartments';
import dayjs from 'dayjs';
import { CustomerFilters } from '@/components/customers/CustomerFilters';
import { SourceTag } from '@/components/customers/SourceTag';

const { Text } = Typography;

const renderStatusTag = (status: string) => {
  const config: Record<string, { color: string; text: string }> = {
    closed: { color: 'success', text: 'Đã chốt' },
    pending: { color: 'warning', text: 'Chờ xử lý' },
    potential: { color: 'processing', text: 'Tiềm năng' },
    lost: { color: 'error', text: 'Mất' },
    inactive: { color: 'default', text: 'Ngừng chăm sóc' },
  };
  const { color, text } = config[status] || { color: 'default', text: status };
  return <Tag color={color}>{text}</Tag>;
};

const renderSalesTag = (record: any) => {
  const primarySales = record.salesUser;
  const allAssignees = record.activeAssignees || [];
  const sharedSales = allAssignees.filter((a: any) => a.id !== primarySales?.id);
  
  if (!primarySales && sharedSales.length === 0) {
    return <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa gán</span>;
  }

  return (
    <Space size={[0, 4]} align="center" wrap>
      {primarySales ? <Tag color="blue" title="Sales phụ trách chính">{primarySales.name}</Tag> : <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa có Primary</span>}
      {sharedSales.length > 0 && (
        <Tooltip title={`Sales được chia:\n${sharedSales.map((a: any) => a.name).join(', ')}`}>
          <Tag color="cyan">+{sharedSales.length}</Tag>
        </Tooltip>
      )}
    </Space>
  );
};

const renderMarketingTag = (record: any) => {
  const marketingUser = record.marketingUser;
  if (!marketingUser) {
    return <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa gán</span>;
  }
  return <Tag color="purple" title="Marketing phụ trách">{marketingUser.name}</Tag>;
};

// Cùng pattern hiển thị với renderSalesTag: nhóm ĐẦU TIÊN hiện tên thật,
// các nhóm còn lại gộp thành "+N", hover xem đủ tên qua Tooltip - áp dụng
// cho "Đã joined nhóm" y hệt "Sales chính/phụ" theo đúng yêu cầu, thay vì
// chỉ hiện số lượng trần trụi như trước.
const renderJoinedGroupsTag = (record: any) => {
  const groups: Array<{ id: number; name: string }> = record.joinedGroups || [];

  if (groups.length === 0) {
    return <Tag color="default">Chưa join</Tag>;
  }

  const [first, ...rest] = groups;

  return (
    <Space size={[0, 4]} align="center" wrap>
      <Tag color="green" title="Nhóm đã join">{first.name}</Tag>
      {rest.length > 0 && (
        <Tooltip title={`Nhóm khác đã join:\n${rest.map((g) => g.name).join(', ')}`}>
          <Tag color="cyan">+{rest.length}</Tag>
        </Tooltip>
      )}
    </Space>
  );
};

// Cột "Ghi chú gần nhất": `record.recentNotes` do BE trả sẵn (tối đa 5,
// mới nhất trước - batch fetch trong findAll(), không N+1). `count` là số
// lượng note (3 hoặc 5) NGƯỜI DÙNG chọn hiển thị trong tooltip - cắt bớt ở
// FE từ mảng tối đa 5 note đã có sẵn, KHÔNG gọi lại API khi đổi lựa chọn.
// Ô hiển thị trong bảng chỉ show note MỚI NHẤT (dạng "Tên: Nội dung
// (ngày/tháng/năm)"), cắt ngắn bằng CSS ellipsis nếu quá dài; hover vào để
// xem đủ `count` note gần nhất qua Tooltip.
const formatRecentNoteLine = (note: RecentNote) =>
  `${note.createdByName || 'Không xác định'}: ${note.note} (${dayjs(note.createdAt).format('D/M/YY')})`;

const renderRecentNotesCell = (record: Customer, count: number) => {
  const allNotes = record.recentNotes || [];
  if (allNotes.length === 0) {
    return <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa có ghi chú</span>;
  }

  const visibleNotes = allNotes.slice(0, count);
  const latestLine = formatRecentNoteLine(visibleNotes[0]);

  const tooltipContent = (
    <div style={{ minWidth: 220, maxWidth: 320 }}>
      {visibleNotes.map((n, idx) => (
        <div key={n.id} style={idx < visibleNotes.length - 1 ? { marginBottom: 8 } : undefined}>
          <strong>{n.createdByName || 'Không xác định'}:</strong> {n.note}
          <br />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
            {dayjs(n.createdAt).format('HH:mm DD/MM/YYYY')}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} mouseEnterDelay={0.3}>
      <div
        style={{
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'help',
          fontSize: 12,
        }}
      >
        {latestLine}
      </div>
    </Tooltip>
  );
};

const CustomerMobileCard = ({ 
  record, 
  index, 
  page, 
  pageSize, 
  onRowClick,
  canDelete,
  onDelete
}: { 
  record: Customer; 
  index: number; 
  page: number; 
  pageSize: number; 
  onRowClick: (id: number) => void; 
  canDelete: boolean;
  onDelete: (id: number) => void;
}) => {
  return (
  <Card
    size="small"
    variant="outlined"
    style={{ marginBottom: 8, cursor: 'pointer' }}
    onClick={() => onRowClick(record.id)}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <Space size={4}>
        <Text type="secondary" style={{ fontSize: 11 }}>#{(page - 1) * pageSize + index + 1}</Text>
        <Text strong style={{ color: '#1890ff' }}>{record.name}</Text>
      </Space>
      {renderStatusTag(record.status)}
    </div>
    <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 12, color: '#555' }}>
      <span>📞 {record.phone || 'Chưa có SĐT'}</span>
      <span>📅 {dayjs(record.inputDate).format('DD/MM/YY')}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <Space size={4} wrap>
        <SourceTag source={record.source} />
        {renderSalesTag(record)}
        {renderMarketingTag(record)}
      </Space>
    </div>
    {record.campaign && (
      <div style={{ marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 11 }} ellipsis={{ tooltip: record.campaign }}>UTM: {record.campaign}</Text>
      </div>
    )}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
      <div>
        {canDelete && (
          <Popconfirm
            title="Xóa khách hàng"
            description="Bạn có chắc chắn muốn xóa khách hàng này?"
            onConfirm={(e) => {
              e?.stopPropagation();
              onDelete(record.id);
            }}
            onCancel={(e) => e?.stopPropagation()}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => e.stopPropagation()}
              size="small"
              title="Xóa khách hàng"
            />
          </Popconfirm>
        )}
      </div>
      <Text strong style={{ color: Number(record.totalDeposit30Days) > 0 ? '#52c41a' : '#bfbfbf', fontSize: 13 }}>
        ${(Number(record.totalDeposit30Days) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </Text>
    </div>
  </Card>
)};

const { useBreakpoint } = Grid;

// ⚠️ Đổi tên function chính từ export default -> nội bộ, để bọc Suspense bên
// ngoài (bắt buộc với useSearchParams() trong Next.js App Router, nếu không
// `next build` sẽ báo lỗi "useSearchParams() should be wrapped in a suspense
// boundary" và build production trên Vercel sẽ fail).
function CustomersPageContent() {
  const screens = useBreakpoint();
  const isLaptop = !!(screens.md && !screens.xl); // 768px - 1279px

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const { message } = App.useApp();
  
  const { user } = useAuthStore();
  const { can } = useMyPermissions();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  // ── FIX BUG THẬT: mở drawer chi tiết khi được điều hướng từ trang khác ──
  // (vd /chia-data -> router.push(`/customers?id=${record.id}`)) - trước đây
  // trang này hoàn toàn KHÔNG đọc query param `id`, nên người dùng bấm vào
  // tên khách hàng ở /chia-data chỉ bị đưa về danh sách trống trơn, không hề
  // thấy drawer/tab "Gán data" + nút Sửa/Thu hồi nào - đây chính là lý do
  // "UI chưa có nút để thao tác" dù code các nút đó đã viết xong và đúng.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam) {
      const parsedId = Number(idParam);
      if (!Number.isNaN(parsedId)) {
        setSelectedCustomerId(parsedId);
      }
      // Xoá param khỏi URL sau khi đã dùng xong - tránh việc bấm "Làm mới"
      // trang hoặc back/forward lại tự mở nhầm đúng khách hàng đó lần nữa.
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Search & Filter States
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 500);
  const [source, setSource] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [salesUserId, setSalesUserId] = useState<number | undefined>(undefined);
  const [marketingUserId, setMarketingUserId] = useState<number | undefined>(undefined);
  // "Người nhập Data" - tách riêng khỏi marketingUserId vì người nhập data
  // thực tế có thể ở phòng ban khác Marketing (xem CustomerFilters.tsx).
  const [creatorId, setCreatorId] = useState<number | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState<dayjs.Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<dayjs.Dayjs | null>(null);
  const [joinedGroups, setJoinedGroups] = useState<'joined' | 'not_joined' | undefined>(undefined);
  // Số ghi chú gần nhất hiển thị trong tooltip cột "Ghi chú gần nhất" - BE
  // luôn trả tối đa 5 (MAX_RECENT_NOTES ở customers.service.ts), FE cho
  // người dùng CHỌN xem 3 hay 5 trong số đó (cắt bớt ở đây, không gọi lại
  // API khi đổi lựa chọn này).
  const [recentNotesCount, setRecentNotesCount] = useState<3 | 5>(3);
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
    marketingUserId,
    creatorId,
    sortField,
    sortOrder,
    dateFrom: dateFrom?.format('YYYY-MM-DD'),
    dateTo: dateTo?.format('YYYY-MM-DD'),
    joinedGroups,
  });

  const customers = customersResponse?.data || [];
  const total = customersResponse?.total || 0;

  // Danh sách TOÀN BỘ user (không lọc role/phòng ban) - lấy 1 lần, sau đó
  // lọc CLIENT-SIDE thành 2 danh sách riêng theo ĐÚNG phòng ban (Kinh doanh
  // / Marketing), thay vì gọi 2 API riêng - endpoint GET /users/all vốn đã
  // trả kèm quan hệ `department` cho mỗi user (users.service.ts
  // findEmployees(), relations: ['department']), đủ dữ liệu để lọc mà
  // không cần thêm/sửa gì ở Backend.
  const [salesUsers, setSalesUsers] = useState<
    { id: number; name: string; department?: { id: number; name: string } | null }[]
  >([]);

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

  // Danh sách "Người nhập Data" cho dropdown filter - CHỈ user đã từng tạo
  // >=1 khách hàng (BE lọc sẵn qua GET /customers/creators), KHÔNG lọc theo
  // phòng ban vì người nhập data thực tế có thể ở phòng ban bất kỳ, khác
  // hẳn Marketing/Sales.
  const [creatorUsers, setCreatorUsers] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    customersApi
      .getCreators()
      .then(setCreatorUsers)
      .catch((error) => console.error('Fetch creators error:', error));
  }, []);

  // Tra đúng phòng "Kinh doanh"/"Marketing" theo TÊN (không hardcode ID, vì
  // ID phòng ban khác nhau giữa các môi trường/instance) - so khớp không
  // phân biệt hoa/thường, chỉ cần TÊN có chứa từ khoá tương ứng (khớp cách
  // đặt tên phổ biến đã thấy trong hệ thống: "Phòng Kinh Doanh", "Phòng
  // Marketing"). Nếu sau này đổi tên phòng ban thành thứ không chứa 2 từ
  // khoá này, dropdown tương ứng sẽ rỗng - CHỦ ĐỘNG chấp nhận đánh đổi này
  // để không phải hardcode ID; admin có thể đổi tên phòng ban cho khớp lại.
  const { departments } = useDepartments();
  const salesDept = useMemo(
    () => (departments || []).find((d: any) => d.name?.toLowerCase().includes('kinh doanh')),
    [departments],
  );
  const marketingDept = useMemo(
    () => (departments || []).find((d: any) => d.name?.toLowerCase().includes('marketing')),
    [departments],
  );

  const salesUsersInDept = useMemo(
    () => salesUsers.filter((u) => salesDept && u.department?.id === salesDept.id),
    [salesUsers, salesDept],
  );
  const marketingUsersInDept = useMemo(
    () => salesUsers.filter((u) => marketingDept && u.department?.id === marketingDept.id),
    [salesUsers, marketingDept],
  );

  // ⚠️ FIX BUG THẬT (rà soát UI Permission): trước đây liệt kê cứng
  // ['admin','manager','assistant'] - lệch hẳn với BE (đã dùng
  // @RequirePermission('customers.import')/('customers.assign') từ lâu).
  // Nếu Admin đổi ma trận quyền qua trang "Phân quyền" (vd rút quyền
  // customers.assign khỏi Manager, hoặc cấp cho 1 role tuỳ chỉnh mới), 2
  // nút này vẫn hiện/ẩn sai cho tới khi có người nhớ sửa lại danh sách cứng
  // ở đây - đúng loại lỗi "UI và API lệch nhau" đã cảnh báo ở nav-config.tsx.
  const canImport = can('customers.import');
  const canAssign = can('customers.assign');
  const canDeleteCustomer = can('customers.delete');
  // ⚠️ FIX BUG THẬT: bị bỏ sót so với canImport/canAssign/canDeleteCustomer
  // ngay bên cạnh - nút "+ Thêm khách hàng" trước đây hiện KHÔNG ĐIỀU KIỆN,
  // không hề gọi can('customers.create'). BE đã đòi đúng permission này ở
  // POST /customers từ migration 1778900000000-SplitCustomersManagePermission.ts.
  const canCreate = can('customers.create');

  const rowSelection = {
    selectedRowKeys,
    onChange: (newKeys: React.Key[]) => setSelectedRowKeys(newKeys),
    preserveSelectedRowKeys: true,
    // ⚠️ FIX bug checkbox bị đè/cắt ở cột đầu bảng: globals.css ép
    // `table-layout: fixed !important` cho .customer-table - dưới layout
    // fixed, CỘT NÀO KHÔNG khai báo width sẽ bị co gần bằng 0 nếu tổng các
    // cột còn lại (STT 48px + 9 cột %  + Thao tác 60-70px) đã gần lấp đầy
    // 100%. Cột checkbox do antd tự chèn thêm (rowSelection) vốn không có
    // width khai báo -> đúng nguyên nhân checkbox bị bóp méo/chồng lên
    // nhau trong ảnh. Khai báo cứng columnWidth để nó luôn có chỗ đứng
    // riêng, không bị các cột khác giành mất.
    columnWidth: 38,
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

  const handleDeleteCustomer = async (id: number) => {
    try {
      await customersApi.deleteCustomer(id);
      message.success('Đã xóa khách hàng');
      refetchCustomers();
      fetchStats();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Lỗi khi xóa khách hàng');
    }
  };

  const renderAuditTrail = (record: Customer) => {
    console.log('Tooltip record:', record);
    console.log('Tooltip updatedBy:', record.updatedBy);
    const creatorName = record.createdBy?.fullName || record.createdBy?.name || 'Không xác định';
    const updaterName = record.updatedBy?.fullName || record.updatedBy?.name;
    const createdAt = record.createdAt ? dayjs(record.createdAt).format('HH:mm DD/MM/YYYY') : '—';
    const updatedAt = record.updatedAt ? dayjs(record.updatedAt).format('HH:mm DD/MM/YYYY') : null;

    return (
      <div style={{ minWidth: 200, padding: '4px' }}>
        <div>
          <strong>Tạo bởi:</strong> {creatorName}
          <br />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
            {createdAt}
          </span>
        </div>
        <Divider style={{ margin: '8px 0', borderColor: 'rgba(255,255,255,0.2)' }} />
        {record.updatedBy ? (
          <div>
            <strong>Sửa cuối:</strong> {updaterName}
            <br />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>
              {updatedAt}
            </span>
          </div>
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>Chưa có chỉnh sửa</div>
        )}
      </div>
    );
  };

  const columns: ColumnsType<Customer> = useMemo(() => [
    {
      title: 'STT',
      key: 'stt',
      width: 36,
      align: 'center',
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Ngày nhập',
      dataIndex: 'inputDate',
      key: 'inputDate',
      width: isLaptop ? '7%' : '8%',
      render: (date) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Họ và tên',
      dataIndex: 'name',
      key: 'name',
      width: isLaptop ? '14%' : '16%',
      onCell: () => ({ className: 'col-name' }),
      render: (text, record) => (
        <Space size={4}>
          <Text strong style={{ color: '#1890ff' }}>{text}</Text>
          <Tooltip title={renderAuditTrail(record)} mouseEnterDelay={0.3}>
            <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: '12px' }} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'SĐT',
      dataIndex: 'phone',
      key: 'phone',
      width: isLaptop ? '8%' : '9%',
      render: (val) => val ? val : <span style={{ color: '#aaa', fontStyle: 'italic' }}>Chưa có SDT</span>,
    },
    {
      title: 'Nguồn',
      dataIndex: 'source',
      key: 'source',
      width: isLaptop ? '6%' : '7%',
      render: (source) => <SourceTag source={source} />,
    },
    {
      title: 'UTM',
      dataIndex: 'campaign',
      key: 'campaign',
      width: isLaptop ? '7%' : '8%',
      ellipsis: { showTitle: true },
    },
    {
      title: 'Sales (Chính + Phụ)',
      key: 'salesUser',
      width: isLaptop ? '11%' : '13%',
      render: (_, record: any) => renderSalesTag(record),
    },
    {
      title: 'Marketing',
      key: 'marketingUser',
      width: isLaptop ? '8%' : '9%',
      render: (_, record: any) => renderMarketingTag(record),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: isLaptop ? '8%' : '9%',
      render: (status) => renderStatusTag(status),
    },
    {
      title: 'Đã joined nhóm',
      key: 'joinedGroups',
      width: isLaptop ? '7%' : '8%',
      align: 'center',
      render: (_: any, record: any) => renderJoinedGroupsTag(record),
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
      width: isLaptop ? '9%' : '10%',
      align: 'right',
      render: (val) => (
        <Tooltip title="Tổng tiền nạp dựa trên khoảng ngày">
          <Text strong style={{ color: Number(val) > 0 ? '#52c41a' : '#bfbfbf' }}>
            ${(Number(val) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: 'Ghi chú gần nhất',
      key: 'recentNotes',
      width: isLaptop ? '11%' : '13%',
      render: (_, record: Customer) => renderRecentNotesCell(record, recentNotesCount),
    },
    // Cột "Thao tác" (nút Xoá) - BỎ HẲN cả cột khi không có quyền
    // `customers.delete`, thay vì để cột rỗng (mỗi ô render `null`) như
    // trước - đỡ tốn 1 cột trống vô nghĩa trên bảng, đúng yêu cầu UI.
    ...(canDeleteCustomer
      ? [
          {
            title: 'Thao tác',
            key: 'action',
            width: isLaptop ? 60 : 70,
            align: 'center' as const,
            render: (_: any, record: Customer) => (
              <Popconfirm
                title="Xóa khách hàng"
                description="Bạn có chắc muốn xóa?"
                onConfirm={(e) => {
                  e?.stopPropagation();
                  handleDeleteCustomer(record.id);
                }}
                onCancel={(e) => e?.stopPropagation()}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(e) => e.stopPropagation()}
                  size="small"
                  title="Xóa khách hàng"
                />
              </Popconfirm>
            ),
          },
        ]
      : []),
  // ⚠️ FIX BUG THẬT: `canDeleteCustomer` trước đây KHÔNG nằm trong dependency
  // array dù đã được dùng trong nội dung cột - nếu quyền tải xong SAU lần
  // render đầu (permissions API luôn async), giá trị `false` ban đầu bị
  // "đông cứng" vĩnh viễn trong closure của useMemo, cột Thao tác/nút Xoá
  // sẽ không bao giờ hiện dù sau đó canDeleteCustomer đã thành true.
  ], [isLaptop, depositRangeForColumnLabel, page, pageSize, user, canDeleteCustomer, recentNotesCount]);

  // ⚠️ FIX BUG THẬT: nút "X" (clear) trên các Select (Sales/Marketing/Người
  // nhập Data/Nguồn/Trạng thái/Đã joined nhóm...) không tắt được filter,
  // phải F5 cả trang mới hết. Nguyên nhân: `antd Select allowClear` gọi
  // `onChange(undefined)` khi bấm X, CustomerFilters spread ra
  // `{ ...filters, salesUserId: undefined, page: 1 }` - object NÀY LUÔN có
  // key `salesUserId` (dù value là undefined). Check cũ `!== undefined` coi
  // "value undefined" giống hệt "key không đổi" nên bỏ qua, KHÔNG BAO GIỜ
  // set lại state về undefined được. Sửa bằng cách kiểm tra SỰ TỒN TẠI của
  // key (`in`) thay vì kiểm tra giá trị - CustomerFilters luôn gửi đủ toàn
  // bộ key mỗi lần đổi (spread từ `filters` hiện tại), nên cách này an toàn.
  const handleFiltersChange = (newFilters: any) => {
    if ('search' in newFilters) setSearchText(newFilters.search ?? '');
    if ('source' in newFilters) setSource(newFilters.source);
    if ('status' in newFilters) setStatus(newFilters.status);
    if ('salesUserId' in newFilters) setSalesUserId(newFilters.salesUserId);
    if ('marketingUserId' in newFilters) setMarketingUserId(newFilters.marketingUserId);
    if ('creatorId' in newFilters) setCreatorId(newFilters.creatorId);
    if ('dateFrom' in newFilters) setDateFrom(newFilters.dateFrom ? dayjs(newFilters.dateFrom) : null);
    if ('dateTo' in newFilters) setDateTo(newFilters.dateTo ? dayjs(newFilters.dateTo) : null);
    if ('joinedGroups' in newFilters) setJoinedGroups(newFilters.joinedGroups);
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
    <Space className="mobile-toolbar" size={isLaptop ? 4 : 8}>
      {!isMobile && (
        <Space size={4} title='Số ghi chú gần nhất hiển thị trong tooltip cột "Ghi chú gần nhất"'>
          {!isLaptop && <Text style={{ fontSize: 12, color: '#8c8c8c' }}>Ghi chú gần nhất:</Text>}
          <Select
            size="small"
            value={recentNotesCount}
            style={{ width: isLaptop ? 58 : 90 }}
            onChange={(val: 3 | 5) => setRecentNotesCount(val)}
            options={[
              { value: 3, label: isLaptop ? '3' : '3 gần nhất' },
              { value: 5, label: isLaptop ? '5' : '5 gần nhất' },
            ]}
          />
        </Space>
      )}
      <Button 
        icon={<ReloadOutlined />} 
        onClick={() => { refetchCustomers(); fetchStats(); }} 
        title="Làm mới"
        size={isLaptop ? 'small' : 'middle'}
      >
        {!isMobile && !isLaptop && 'Làm mới'}
      </Button>
      {canCreate && (
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => setIsCreateOpen(true)} 
          title="Thêm khách hàng"
          size={isLaptop ? 'small' : 'middle'}
        >
          {!isMobile && !isLaptop && 'Thêm khách hàng'}
        </Button>
      )}
      {canImport && (
        <Button 
          icon={<UploadOutlined />} 
          onClick={() => setIsImportOpen(true)} 
          title="Nhập Excel"
          size={isLaptop ? 'small' : 'middle'}
        >
          {!isMobile && !isLaptop && 'Nhập Excel'}
        </Button>
      )}
      {canAssign && selectedRowKeys.length > 0 && !isMobile && (
        <Button 
          type="primary" 
          icon={<UsergroupAddOutlined />} 
          onClick={() => setIsAssignOpen(true)}
          size={isLaptop ? 'small' : 'middle'}
        >
          {isLaptop ? `Gán (${selectedRowKeys.length})` : `Gán cho Sales (${selectedRowKeys.length})`}
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
      {isMobile ? (
        <Collapse 
          ghost 
          style={{ marginBottom: 12 }} 
          items={[
            { 
              key: '1', 
              label: '🔍 Bộ lọc & Tìm kiếm', 
              children: (
                <div style={{ marginTop: -8 }}>
                  <CustomerFilters
                    filters={{
                      search: searchText,
                      source,
                      status,
                      salesUserId,
                      marketingUserId,
                      creatorId,
                      dateFrom: dateFrom?.format('YYYY-MM-DD'),
                      dateTo: dateTo?.format('YYYY-MM-DD'),
                      joinedGroups,
                    }}
                    salesUsers={salesUsersInDept}
                    marketingUsers={marketingUsersInDept}
                    creatorUsers={creatorUsers}
                    onFiltersChange={handleFiltersChange}
                  />
                </div>
              )
            }
          ]} 
        />
      ) : (
        <CustomerFilters
          filters={{
            search: searchText,
            source,
            status,
            salesUserId,
                marketingUserId,
                creatorId,
            dateFrom: dateFrom?.format('YYYY-MM-DD'),
            dateTo: dateTo?.format('YYYY-MM-DD'),
            joinedGroups,
          }}
              salesUsers={salesUsersInDept}
              marketingUsers={marketingUsersInDept}
              creatorUsers={creatorUsers}
          onFiltersChange={handleFiltersChange}
        />
      )}

      {isMobile ? (
        <div style={{ padding: '0 4px' }}>
          {customers.map((record, index) => (
            <CustomerMobileCard
              key={record.id}
              record={record}
              index={index}
              page={page}
              pageSize={pageSize}
              onRowClick={(id) => { setSelectedCustomerId(id); setIsDrawerOpen(true); }}
              canDelete={canDeleteCustomer}
              onDelete={handleDeleteCustomer}
            />
          ))}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            size="small"
            simple
            onChange={(p, ps) => { setPage(p); setPageSize(ps || pageSize); }}
            style={{ textAlign: 'center', marginTop: 12 }}
          />
        </div>
      ) : (
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
          size="small"
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
      )}
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

// Wrapper bắt buộc cho useSearchParams() trong Next.js App Router - nếu
// không có Suspense bọc ngoài, `next build` sẽ lỗi và chặn deploy Vercel.
export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersPageContent />
    </Suspense>
  );
}