'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { App, Table, Card, Typography, Select, Space, Button, Alert, Tag, Input, Tooltip, Avatar, DatePicker } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { customersApi } from '@/lib/api/customers.api';
import { Customer } from '@/lib/types/customer.types';
import dayjs, { Dayjs } from 'dayjs';
import { ReloadOutlined, WarningOutlined, ClearOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { StatusTag } from '@/components/customers/StatusTag';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
import { resolveEntityColor } from '@/lib/utils/entityColor';
// ⚠️ MỚI (yêu cầu người dùng: filter Sales/Marketing phụ trách) - dùng
// ĐÚNG nguồn danh sách user hợp lệ theo assignment-group ('sales'/
// 'marketing') y hệt pattern `/customers`, `CustomerForm.tsx` - KHÔNG tự
// gọi `/users` riêng (route đó đòi quyền khác, dễ 403 với role hẹp).
import { useAssignmentGroupUsers } from '@/lib/hooks/useAssignmentGroups';
import { linkGroupsApi, LinkGroup } from '@/lib/api/link-groups.api';

const { Title, Text } = Typography;

// Loại nào là 2 loại cảnh báo TRÙNG LẶP (khác nhóm "thiếu/sai dữ liệu" -
// có UI riêng: Alert cảnh báo + gộp nhóm trực quan trên bảng).
const DUPLICATE_TYPES = ['duplicate_phone', 'duplicate_email'] as const;
type DuplicateType = (typeof DUPLICATE_TYPES)[number];
const isDuplicateType = (t: string): t is DuplicateType =>
  (DUPLICATE_TYPES as readonly string[]).includes(t);

// ⚠️ MỚI (yêu cầu người dùng: "dropdown có đủ các emoji khác nhau") - mỗi
// loại kiểm tra có 1 emoji riêng để phân biệt nhanh bằng mắt ngay trong ô
// Select (kể cả khi đã đóng dropdown), không chỉ 2 loại trùng lặp như trước.
const TYPE_META: Record<string, { emoji: string; label: string }> = {
  future_date: { emoji: '📅', label: 'Ngày nhập lớn hơn hiện tại' },
  missing_phone: { emoji: '📵', label: 'Thiếu số điện thoại' },
  missing_email: { emoji: '📭', label: 'Thiếu email' },
  duplicate_phone: { emoji: '⚠️📞', label: 'Trùng số điện thoại' },
  duplicate_email: { emoji: '⚠️✉️', label: 'Trùng email' },
};
const TYPE_OPTIONS = Object.entries(TYPE_META).map(([value, m]) => ({
  value,
  label: `${m.emoji} ${m.label}`,
}));

// Bảng màu cố định để tô Tag theo nhóm trùng (SĐT/Email giống nhau -> cùng
// màu) - lặp vòng khi hết màu, đủ dùng cho vài chục nhóm/trang (pageSize
// mặc định 20, nhóm trùng thường chỉ 2-3 dòng nên số nhóm/trang không lớn).
const GROUP_COLORS = [
  'magenta', 'volcano', 'gold', 'lime', 'cyan', 'blue', 'purple', 'geekblue',
];

/** Hash chuỗi đơn giản (djb2) -> chọn màu ỔN ĐỊNH cho cùng 1 group key,
 * không đổi màu lung tung giữa các lần render/đổi trang. */
function colorForGroupKey(key: string): string {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
  }
  const idx = Math.abs(hash) % GROUP_COLORS.length;
  return GROUP_COLORS[idx];
}

// ⚠️ MỚI (yêu cầu người dùng: "Email bị trùng thì thêm Tag check lỗi
// Format") - regex kiểm tra format cơ bản, ĐÚNG pattern đang dùng ở
// `SKILL_NEXTJS_FRONTEND.md` (`lib/utils/validators.ts`: isValidEmail).
// Chỉ là cảnh báo hiển thị (không phải validate BE) - mục đích giúp người
// rà soát thấy ngay giá trị trùng nào còn SAI cú pháp (VD thiếu "@", thiếu
// domain do lỗi nhập liệu/paste từ Excel) chứ không chỉ là bị trùng.
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmailFormat = (email: string) => EMAIL_FORMAT_REGEX.test(email);

// ⚠️ MỚI (yêu cầu người dùng: "Đã tham gia nhóm" - "Nhóm nào list ra như
// customer page") - copy ĐÚNG y hệt `renderJoinedGroupsTag` của
// `/customers/page.tsx` (nhóm đầu tiên hiện tên thật, các nhóm còn lại gộp
// "+N", hover Tooltip xem đủ tên) - không export dùng chung từ đó vì
// `customers/page.tsx` không export hàm này, tách riêng bản local ở đây để
// không phải sửa file kia chỉ để export 1 hàm nhỏ.
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

/**
 * ⚠️ FIX BUG THẬT (rà soát permission 2026-09): trước đây trang này KHÔNG
 * check `customers.invalid_report` gì cả dù nav-config đã gate mục sidebar
 * theo đúng permission này từ lâu - gõ thẳng URL vẫn vào được, `fetchData()`
 * gọi API ngay lúc mount -> 403 -> axios interceptor tự bắn toast lỗi, bảng
 * hiện trống trơn không rõ vì sao, không điều hướng đi đâu. Mirror ĐÚNG
 * pattern route-guard đã dùng ở mọi trang khác (vd `quan-ly-status-khach`).
 */
export default function InvalidDataReportPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const { can, isLoading: permissionsLoading } = useMyPermissions();

  // ⚠️ MỚI (yêu cầu người dùng: "áp dụng UserMiniCard cho các table đang
  // dùng tên User") - dùng ĐÚNG nguồn màu/tên Vai trò an toàn về quyền
  // (GET /roles/colors, không đòi `roles.view`) y hệt pattern chia-data/
  // CustomerFilters, KHÔNG gọi thêm GET /roles riêng.
  const { getRoleColor } = useRoleColorMap();
  const { roleColors: allRoles } = useRoleColors();
  const roleNameMap = new Map(allRoles.map((r) => [r.code, r.name]));
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');

  // Dropdown "Trạng thái" lấy động từ /customer-statuses (đúng nguồn thật,
  // không hardcode) - dùng CHUNG với StatusTag để tô đúng màu Admin đã cấu
  // hình ở /quan-ly-status-khach.
  const { statuses: allCustomerStatuses } = useCustomerStatuses();

  // ⚠️ MỚI (yêu cầu người dùng: "filter thêm Người tạo, Sales phụ trách,
  // Marketing phụ trách") - ĐÚNG nguồn dữ liệu đang dùng ở /customers:
  // `useAssignmentGroupUsers('sales'|'marketing')` cho 2 dropdown Sales/
  // Marketing (danh sách user hợp lệ theo config nhóm phụ trách, không
  // phải toàn bộ `/users`), và `customersApi.getCreators()` cho "Người
  // nhập Data" (chỉ user đã từng tạo ≥1 khách hàng).
  const { users: salesUsers } = useAssignmentGroupUsers('sales');
  const { users: marketingUsers } = useAssignmentGroupUsers('marketing');
  const [creatorUsers, setCreatorUsers] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    customersApi
      .getCreators()
      .then(setCreatorUsers)
      .catch((error) => console.error('Failed to fetch creators list:', error));
  }, []);

  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  // ⚠️ MỚI (yêu cầu người dùng): mặc định mở trang / F5 luôn vào thẳng view
  // "Trùng số điện thoại" (loại hay dùng nhất để rà soát), thay vì
  // "future_date" như trước.
  const [invalidType, setInvalidType] = useState<string>('duplicate_phone');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [salesUserId, setSalesUserId] = useState<number | undefined>(undefined);
  const [marketingUserId, setMarketingUserId] = useState<number | undefined>(undefined);
  const [creatorId, setCreatorId] = useState<number | undefined>(undefined);
  // ⚠️ MỚI (yêu cầu người dùng: "Đã tham gia nhóm" - ĐÚNG hành vi/label y hệt
  // dropdown "Đã joined nhóm" ở /customers).
  const [joinedGroups, setJoinedGroups] = useState<'joined' | 'not_joined' | undefined>(undefined);
  // ⚠️ MỚI (yêu cầu người dùng: "Filter nhóm và cụ thể là nhóm nào") - chọn
  // CỤ THỂ 1 nhóm liên kết. Khi có `groupId`, dropdown "Đã tham gia nhóm" ở
  // cạnh áp dụng cho ĐÚNG nhóm này (Đã join / Chưa join nhóm này).
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  // ⚠️ MỚI (yêu cầu người dùng: "thêm filter cho 2 thời gian: Ngày nhập và
  // Ngày nhập thực tế") - ĐÚNG pattern/tên state đã dùng ở /chia-data
  // (unassignedDateFrom/To lọc inputDate, unassignedCreatedAtFrom/To lọc
  // createdAt) - 2 RangePicker độc lập, không đè lên nhau.
  const [inputDateFrom, setInputDateFrom] = useState<Dayjs | null>(null);
  const [inputDateTo, setInputDateTo] = useState<Dayjs | null>(null);
  const [createdAtFrom, setCreatedAtFrom] = useState<Dayjs | null>(null);
  const [createdAtTo, setCreatedAtTo] = useState<Dayjs | null>(null);
  // Lấy TẤT CẢ nhóm (kể cả nhóm đã bị ẩn) - khách có thể đã join 1 nhóm
  // giờ đã ẩn, vẫn cần lọc được. GET /link-groups mở cho mọi role đã đăng nhập.
  const [linkGroups, setLinkGroups] = useState<LinkGroup[]>([]);
  useEffect(() => {
    linkGroupsApi
      .getAll()
      .then(setLinkGroups)
      .catch((error) => console.error('Fetch link groups error:', error));
  }, []);
  // Chỉ BE trả field này khi invalidType là 1 trong 2 loại trùng lặp - số
  // GIÁ TRỊ (SĐT/Email) đang bị trùng, KHÁC `pagination.total` là số DÒNG
  // khách hàng (1 giá trị trùng có thể ứng với ≥2 dòng).
  const [duplicateGroupCount, setDuplicateGroupCount] = useState<number | undefined>(undefined);

  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  useEffect(() => {
    if (!permissionsLoading && !can('customers.invalid_report')) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [permissionsLoading, router]);

  // ⚠️ MỚI - nhận đủ tham số tường minh (không đọc lại state qua closure
  // mặc định) để mỗi nơi gọi (đổi loại/đổi trạng thái/tìm kiếm/đổi trang)
  // luôn gửi ĐÚNG bộ filter đang có, tránh bug filter "cũ" do closure lỗi
  // thời khi nhiều state đổi liên tiếp trong cùng 1 lượt.
  const fetchData = async (opts: {
    type?: string;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    salesUserId?: number;
    marketingUserId?: number;
    creatorId?: number;
    joinedGroups?: 'joined' | 'not_joined';
    groupId?: number;
    // ⚠️ MỚI - khoảng ngày lọc "Ngày nhập" (inputDate)/"Ngày nhập thực tế"
    // (createdAt), truyền dạng string 'YYYY-MM-DD' đã format sẵn (giống các
    // opts khác ở trên, không truyền thẳng Dayjs vào fetchData).
    dateFrom?: string;
    dateTo?: string;
    createdAtFrom?: string;
    createdAtTo?: string;
  }) => {
    const type = opts.type ?? invalidType;
    const page = opts.page ?? (pagination.current || 1);
    const limit = opts.limit ?? (pagination.pageSize || 20);
    const s = opts.search !== undefined ? opts.search : search;
    const st = opts.status !== undefined ? opts.status : status;
    const su = opts.salesUserId !== undefined ? opts.salesUserId : salesUserId;
    const mu = opts.marketingUserId !== undefined ? opts.marketingUserId : marketingUserId;
    const cr = opts.creatorId !== undefined ? opts.creatorId : creatorId;
    const jg = opts.joinedGroups !== undefined ? opts.joinedGroups : joinedGroups;
    const gid = 'groupId' in opts ? opts.groupId : groupId;
    const df = opts.dateFrom !== undefined ? opts.dateFrom : (inputDateFrom?.format('YYYY-MM-DD') || undefined);
    const dt = opts.dateTo !== undefined ? opts.dateTo : (inputDateTo?.format('YYYY-MM-DD') || undefined);
    const caf = opts.createdAtFrom !== undefined ? opts.createdAtFrom : (createdAtFrom?.format('YYYY-MM-DD') || undefined);
    const cat = opts.createdAtTo !== undefined ? opts.createdAtTo : (createdAtTo?.format('YYYY-MM-DD') || undefined);

    setLoading(true);
    try {
      const res = await customersApi.getInvalidDataReport({
        invalidType: type,
        page,
        limit,
        search: s || undefined,
        status: st || undefined,
        salesUserId: su || undefined,
        marketingUserId: mu || undefined,
        creatorId: cr || undefined,
        joinedGroups: jg || undefined,
        groupId: gid || undefined,
        dateFrom: df || undefined,
        dateTo: dt || undefined,
        createdAtFrom: caf || undefined,
        createdAtTo: cat || undefined,
      });
      setData(res.data);
      setDuplicateGroupCount(res.duplicateGroupCount);
      setPagination({
        current: res.page,
        total: res.total,
        pageSize: res.limit,
      });
    } catch (error) {
      console.error('Failed to fetch invalid data report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Chưa xác định được quyền, hoặc đã xác định KHÔNG có quyền (đang
    // điều hướng đi ở effect phía trên) -> không tự gọi API, tránh bắn
    // 403/toast vô ích trong lúc chờ redirect áp dụng.
    if (permissionsLoading || !can('customers.invalid_report')) return;
    fetchData({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading]);

  const handleTypeChange = (val: string) => {
    setInvalidType(val);
    fetchData({ type: val, page: 1 });
  };

  const handleStatusChange = (val?: string) => {
    setStatus(val);
    fetchData({ status: val, page: 1 });
  };

  const handleSalesUserChange = (val?: number) => {
    setSalesUserId(val);
    fetchData({ salesUserId: val, page: 1 });
  };

  const handleMarketingUserChange = (val?: number) => {
    setMarketingUserId(val);
    fetchData({ marketingUserId: val, page: 1 });
  };

  const handleCreatorChange = (val?: number) => {
    setCreatorId(val);
    fetchData({ creatorId: val, page: 1 });
  };

  const handleJoinedGroupsChange = (val?: 'joined' | 'not_joined') => {
    setJoinedGroups(val);
    fetchData({ joinedGroups: val, page: 1 });
  };

  const handleGroupChange = (val?: number) => {
    setGroupId(val);
    fetchData({ groupId: val, page: 1 });
  };

  const handleSearch = (val: string) => {
    setSearch(val);
    fetchData({ search: val, page: 1 });
  };

  // ⚠️ MỚI - ĐÚNG pattern các handler khác ở trên: đổi state rồi gọi
  // fetchData ngay với giá trị MỚI (không đợi state cập nhật xong qua
  // useEffect, tránh 1 nhịp fetch với filter cũ do closure).
  const handleInputDateRangeChange = (vals: [Dayjs | null, Dayjs | null] | null) => {
    const from = vals?.[0] ?? null;
    const to = vals?.[1] ?? null;
    setInputDateFrom(from);
    setInputDateTo(to);
    fetchData({
      dateFrom: from?.format('YYYY-MM-DD') || undefined,
      dateTo: to?.format('YYYY-MM-DD') || undefined,
      page: 1,
    });
  };

  const handleCreatedAtRangeChange = (vals: [Dayjs | null, Dayjs | null] | null) => {
    const from = vals?.[0] ?? null;
    const to = vals?.[1] ?? null;
    setCreatedAtFrom(from);
    setCreatedAtTo(to);
    fetchData({
      createdAtFrom: from?.format('YYYY-MM-DD') || undefined,
      createdAtTo: to?.format('YYYY-MM-DD') || undefined,
      page: 1,
    });
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatus(undefined);
    setSalesUserId(undefined);
    setMarketingUserId(undefined);
    setCreatorId(undefined);
    setJoinedGroups(undefined);
    setGroupId(undefined);
    setInputDateFrom(null);
    setInputDateTo(null);
    setCreatedAtFrom(null);
    setCreatedAtTo(null);
    fetchData({
      search: '',
      status: undefined,
      salesUserId: undefined,
      marketingUserId: undefined,
      creatorId: undefined,
      joinedGroups: undefined,
      groupId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      createdAtFrom: undefined,
      createdAtTo: undefined,
      page: 1,
    });
  };

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    fetchData({ page: newPagination.current, limit: newPagination.pageSize });
  };

  // ⚠️ MỚI (yêu cầu người dùng: "filter thêm Người tạo, Sales phụ trách,
  // Marketing phụ trách") - mirror ĐÚNG `renderUserOption` của
  // `CustomerFilters.tsx` (Avatar tô màu theo Vai trò + Tag Vai trò/Phòng
  // ban/Vị trí) để 3 dropdown filter mới nhất quán giao diện với `/customers`.
  const renderUserOption = (option: { data: { user: { id: number; name: string; role?: string; department?: { name: string; color?: string } | null; position?: { name: string; color?: string } | null } } }) => {
    const u = option.data.user;
    const tagStyle: React.CSSProperties = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
    return (
      <Space size={4} align="center">
        <Avatar size={20} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
          {u.name?.[0]?.toUpperCase()}
        </Avatar>
        <span style={{ fontSize: 13 }}>{u.name}</span>
        {u.role && (
          <Tag style={tagStyle} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>
        )}
        {u.department?.name && (
          <Tag style={tagStyle} color={resolveEntityColor(u.department.color)}>{u.department.name}</Tag>
        )}
        {u.position?.name && (
          <Tag style={tagStyle} color={resolveEntityColor(u.position.color)}>{u.position.name}</Tag>
        )}
      </Space>
    );
  };

  // Options chọn nhóm: gom theo Category (như trang quản lý nhóm liên kết),
  // nhóm đã ẩn có hậu tố "(đã ẩn)". Tìm kiếm theo tên nhóm qua `label`.
  const groupOptions = (() => {
    const byCategory = new Map<string, { label: string; options: { value: number; label: string }[] }>();
    for (const g of linkGroups) {
      const key = String(g.categoryId);
      if (!byCategory.has(key)) {
        byCategory.set(key, { label: g.category?.name ?? 'Khác', options: [] });
      }
      byCategory.get(key)!.options.push({
        value: g.id,
        label: g.isActive ? g.name : `${g.name} (đã ẩn)`,
      });
    }
    return Array.from(byCategory.values());
  })();

  const isDuplicateView = isDuplicateType(invalidType);

  // ⚠️ MỚI (gộp nhóm trực quan): BE (`getDuplicateContactReport`) đã sắp
  // các dòng cùng `duplicateGroupKey` đứng LIỀN NHAU trong mỗi trang (order
  // theo dup_key trước, ngày nhập chỉ là tiêu chí phụ) - nên chỉ cần nhìn
  // vào `data` của TRANG HIỆN TẠI là đủ để: (1) merge ô SĐT/Email của cả
  // nhóm thành 1 ô (rowSpan) thay vì lặp lại từng dòng, (2) tô nền xen kẽ +
  // viền phân cách giữa 2 nhóm liền kề (xem `.dup-group-*` ở globals.css) -
  // "trùng nhau thì thành 1 group" bất kể ngày nhập/trạng thái khác nhau.
  const groupKeyAt = (index: number) => data[index]?.duplicateGroupKey ?? '';

  const getGroupRowSpan = (index: number) => {
    if (index > 0 && groupKeyAt(index) === groupKeyAt(index - 1)) return 0; // gộp vào dòng trước
    let span = 1;
    for (let i = index + 1; i < data.length; i++) {
      if (groupKeyAt(i) === groupKeyAt(index)) span++;
      else break;
    }
    return span;
  };

  const rowClassName = (record: Customer, index: number) => {
    if (!isDuplicateView) return '';
    // Đếm số lần group key đổi từ đầu bảng tới dòng này -> tô nền xen kẽ
    // theo NHÓM (không phải theo dòng lẻ) để cả nhóm cùng 1 màu nền.
    let parity = 0;
    for (let i = 1; i <= index; i++) {
      if (groupKeyAt(i) !== groupKeyAt(i - 1)) parity = parity === 0 ? 1 : 0;
    }
    const classes = [parity === 1 ? 'dup-group-odd' : 'dup-group-even'];
    if (index > 0 && groupKeyAt(index) !== groupKeyAt(index - 1)) classes.push('dup-group-start');
    return classes.join(' ');
  };

  // Cột đầu chung cho mọi loại report (không đổi theo type).
  const nameColumn: ColumnsType<Customer>[number] = {
    title: 'Khách hàng',
    dataIndex: 'name',
    key: 'name',
    render: (text, record) => (
      <Space orientation="vertical" size={0}>
        <Text strong>{text || 'Không có tên'}</Text>
        {/* Ở view trùng Email, email chính là cột nhóm bên dưới rồi -
           tránh lặp lại 2 lần, chỉ hiện email phụ khi đang xem trùng SĐT. */}
        {invalidType !== 'duplicate_email' && (
          <Text type="secondary" className="text-xs">{record.email}</Text>
        )}
      </Space>
    ),
  };

  // Cột "Số điện thoại"/"Email" - ở 2 view trùng lặp: tô Tag màu theo nhóm
  // (`duplicateGroupKey` BE trả kèm) VÀ merge (rowSpan) thành 1 ô chung cho
  // cả nhóm - để mắt thường thấy ngay đây là 1 khối đang trùng nhau, kể cả
  // khi không đứng liền kề trên UI trước đây.
  const contactDataIndex = invalidType === 'duplicate_email' ? 'email' : 'phone';
  const contactColumn: ColumnsType<Customer>[number] = {
    title: invalidType === 'duplicate_email'
      ? 'Email (trùng lặp)'
      : (isDuplicateView ? 'Số điện thoại (trùng lặp)' : 'Số điện thoại'),
    dataIndex: contactDataIndex,
    key: contactDataIndex,
    // Chỉ RENDER nội dung ở đây - việc merge (rowSpan) chuyển hẳn sang
    // `onCell` bên dưới (KHÔNG return `{children, props}` từ `render` nữa -
    // antd 6 đã deprecate cách này vì tốn hiệu năng, cảnh báo thẳng ra
    // console: "columns.render return cell props is deprecated ... please
    // use onCell instead").
    render: (val: string, record) => {
      if (!isDuplicateView) return val || '-';
      const groupTag = (
        <Tag color={colorForGroupKey(record.duplicateGroupKey || val || '')}>{val || '-'}</Tag>
      );
      // Chỉ áp dụng cho view trùng Email - trùng SĐT không cần check format
      // ở đây (đã có validate riêng cho SĐT ở chỗ khác).
      const isBadFormat = contactDataIndex === 'email' && !!val && !isValidEmailFormat(val);
      if (!isBadFormat) return groupTag;
      return (
        <Space size={4} wrap>
          {groupTag}
          <Tooltip title="Email không đúng định dạng chuẩn (thiếu @ hoặc thiếu tên miền)">
            <Tag color="red">Sai định dạng</Tag>
          </Tooltip>
        </Space>
      );
    },
    onCell: isDuplicateView
      ? (_record, index) => ({ rowSpan: getGroupRowSpan(index ?? 0) })
      : undefined,
  };

  // ⚠️ MỚI (yêu cầu người dùng, hoàn thiện việc còn treo từ lượt trước) -
  // cột "Trùng với ai": BE đã trả sẵn `duplicatePeers` (id + tên các khách
  // khác đang trùng cùng SĐT/Email, đã loại trừ chính dòng này) - bấm vào
  // tên để đi thẳng `/customers?id=` (trang Khách hàng tự mở đúng modal chi
  // tiết khách đó, đã có sẵn logic đọc query `id`).
  const peersColumn: ColumnsType<Customer>[number] = {
    title: 'Trùng với ai',
    key: 'duplicatePeers',
    render: (_, record) => {
      const peers = record.duplicatePeers || [];
      if (peers.length === 0) return <Text type="secondary">-</Text>;
      const shown = peers.slice(0, 2);
      const rest = peers.slice(2);
      return (
        <Space size={4} wrap>
          {shown.map((p) => (
            <Tag
              key={p.id}
              color="processing"
              style={{ cursor: 'pointer' }}
              onClick={() => router.push(`/customers?id=${p.id}`)}
            >
              {p.name || `#${p.id}`}
            </Tag>
          ))}
          {rest.length > 0 && (
            <Tooltip title={rest.map((p) => p.name).join(', ')}>
              <Tag style={{ cursor: 'default' }}>+{rest.length}</Tag>
            </Tooltip>
          )}
        </Space>
      );
    },
  };

  const columns: ColumnsType<Customer> = [
    nameColumn,
    contactColumn,
    ...(isDuplicateView ? [peersColumn] : []),
    {
      title: 'Ngày nhập data',
      dataIndex: 'inputDate',
      key: 'inputDate',
      width: 120,
      render: (val) => val ? dayjs(val).format('DD/MM/YYYY') : '-',
    },
    {
      // ⚠️ MỚI (yêu cầu người dùng: "thêm 1 cột ngày nhập thực tế, check
      // page chia-data làm ref") - ĐÚNG pattern cột "Ngày nhập thực tế" ở
      // `/chia-data` (dataIndex 'createdAt', timestamp THẬT lúc bản ghi
      // được tạo trong hệ thống, có giờ:phút - khác "Ngày nhập data" =
      // inputDate chỉ có ngày do người nhập tự chọn). Đây cũng là tiêu chí
      // BE dùng để SORT MẶC ĐỊNH của cả trang report (mới nhất lên đầu).
      title: 'Ngày nhập thực tế',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (val: string) => val ? dayjs(val).format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => <StatusTag code={val} fallback={<Text type="secondary">-</Text>} />,
    },
    {
      // ⚠️ MỚI - dùng CHUNG <UserMiniCard> (Avatar tô màu theo Vai trò + tên)
      // thay vì text trơn, ĐÚNG pattern cột "Người tạo" ở /chia-data.
      title: 'Sales',
      key: 'salesUser',
      width: 190,
      render: (_, record) =>
        record.salesUser ? (
          <UserMiniCard
            name={record.salesUser.name}
            role={record.salesUser.role}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
            hideRoleTag
            nameFontSize={12}
          />
        ) : (
          <Text type="secondary">Chưa gán</Text>
        ),
    },
    {
      // ⚠️ MỚI (yêu cầu người dùng: "thêm cột marketing phụ trách luôn") -
      // ĐÚNG pattern cột "Sales" ở trên (UserMiniCard, ẩn Role Tag).
      title: 'Marketing phụ trách',
      key: 'marketingUser',
      width: 190,
      render: (_, record) =>
        record.marketingUser ? (
          <UserMiniCard
            name={record.marketingUser.name}
            role={record.marketingUser.role}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
            hideRoleTag
            nameFontSize={12}
          />
        ) : (
          <Text type="secondary">Chưa gán</Text>
        ),
    },
    {
      title: 'Người tạo',
      key: 'createdBy',
      width: 190,
      render: (_, record) =>
        record.createdBy ? (
          <UserMiniCard
            name={record.createdBy.name}
            role={record.createdBy.role}
            getRoleColor={getRoleColor}
            getRoleName={getRoleName}
            hideRoleTag
            nameFontSize={12}
          />
        ) : (
          <Text type="secondary">Hệ thống</Text>
        ),
    },
    {
      // ⚠️ MỚI (yêu cầu người dùng: "Đã tham gia nhóm" - "Nhóm nào list ra
      // như customer page") - ĐÚNG pattern cột "Đã joined nhóm" ở /customers.
      title: 'Đã tham gia nhóm',
      key: 'joinedGroups',
      align: 'center',
      render: (_, record) => renderJoinedGroupsTag(record),
    },
  ];

  // Số dòng thật sự đang có mặt trong data (khác `duplicateGroupCount` -
  // là số GIÁ TRỊ trùng, không phải số khách hàng) - dùng cho nội dung Alert.
  const affectedCustomerCount = pagination.total || 0;

  const duplicateLabel = invalidType === 'duplicate_email' ? 'Email' : 'Số điện thoại';
  const activeMeta = TYPE_META[invalidType];
  const hasActiveFilters =
    !!search || !!status || !!salesUserId || !!marketingUserId || !!creatorId || !!joinedGroups || !!groupId ||
    !!inputDateFrom || !!inputDateTo || !!createdAtFrom || !!createdAtTo;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Title level={4} style={{ margin: 0 }}>Báo cáo dữ liệu không hợp lệ</Title>
          <Text type="secondary">Danh sách khách hàng có dữ liệu lỗi, thiếu sót, không hợp lệ hoặc bị trùng lặp</Text>
        </div>
      </div>

      <Card
        title={
          <Space size={8}>
            <span style={{ fontSize: 16 }}>{activeMeta?.emoji}</span>
            <span>{activeMeta?.label}</span>
          </Space>
        }
        extra={
          <Space size={8} wrap>
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>{affectedCustomerCount} khách hàng</Tag>
            {isDuplicateView && duplicateGroupCount !== undefined && (
              <Tag color="orange" style={{ marginInlineEnd: 0 }}>{duplicateGroupCount} nhóm trùng</Tag>
            )}
          </Space>
        }
      >
        <Space className="mb-4" size="middle" wrap align="end">
          <div>
            <div className="mb-1"><Text strong>Loại kiểm tra</Text></div>
            <Select
              value={invalidType}
              onChange={handleTypeChange}
              style={{ width: 260 }}
              options={TYPE_OPTIONS}
            />
          </div>
          <div>
            <div className="mb-1"><Text strong>Trạng thái</Text></div>
            <Select
              value={status}
              onChange={handleStatusChange}
              allowClear
              placeholder="Tất cả trạng thái"
              style={{ width: 200 }}
              // ⚠️ MỚI (yêu cầu người dùng: "các trạng thái này phải có
              // color tag") - `label` là 1 React node (Tag đã tô đúng màu
              // từ /quan-ly-status-khach), KHÔNG phải string - Select hiển
              // thị y nguyên node này CẢ ở dropdown lẫn ở ô đã chọn (không
              // cần optionRender/labelRender riêng vì Select không bật
              // showSearch ở đây, không cần label dạng string để filter).
              options={allCustomerStatuses.map((s) => ({
                value: s.code,
                label: <Tag color={s.color} style={{ margin: 0 }}>{s.name}</Tag>,
              }))}
            />
          </div>
          <div>
            <div className="mb-1"><Text strong>Sales phụ trách</Text></div>
            <Select
              value={salesUserId}
              onChange={handleSalesUserChange}
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Chọn Sales"
              style={{ width: 200 }}
              optionLabelProp="label"
              optionRender={renderUserOption}
              popupMatchSelectWidth={false}
              options={salesUsers.map((u) => ({ value: u.id, label: u.name, user: u }))}
            />
          </div>
          <div>
            <div className="mb-1"><Text strong>Marketing phụ trách</Text></div>
            <Select
              value={marketingUserId}
              onChange={handleMarketingUserChange}
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Chọn Marketing"
              style={{ width: 200 }}
              optionLabelProp="label"
              optionRender={renderUserOption}
              popupMatchSelectWidth={false}
              options={marketingUsers.map((u) => ({ value: u.id, label: u.name, user: u }))}
            />
          </div>
          <div>
            <div className="mb-1"><Text strong>Người tạo</Text></div>
            <Select
              value={creatorId}
              onChange={handleCreatorChange}
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Chọn người tạo"
              style={{ width: 200 }}
              optionLabelProp="label"
              optionRender={renderUserOption}
              popupMatchSelectWidth={false}
              options={creatorUsers.map((u) => ({ value: u.id, label: u.name, user: u }))}
            />
          </div>
          <div>
            <div className="mb-1">
              <Tooltip
                title={
                  isDuplicateView
                    ? 'Ở báo cáo Trùng SĐT/Email: chỉ cần trong cụm trùng có ÍT NHẤT 1 khách thoả điều kiện nhóm thì hiện cả cụm (đủ mọi khách trong cụm).'
                    : undefined
                }
              >
                <Text strong>Nhóm cụ thể</Text>
              </Tooltip>
            </div>
            <Select
              value={groupId}
              onChange={handleGroupChange}
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Tất cả nhóm"
              style={{ width: 220 }}
              popupMatchSelectWidth={false}
              options={groupOptions}
              notFoundContent="Không có nhóm nào"
            />
          </div>
          <div>
            <div className="mb-1"><Text strong>Đã tham gia nhóm</Text></div>
            <Select
              value={joinedGroups}
              onChange={handleJoinedGroupsChange}
              allowClear
              placeholder={groupId ? 'Đã joined nhóm này' : 'Tất cả'}
              style={{ width: 200 }}
              options={
                groupId
                  ? [
                      { value: 'joined', label: 'Đã joined nhóm này' },
                      { value: 'not_joined', label: 'Chưa joined nhóm này' },
                    ]
                  : [
                      { value: 'joined', label: 'Đã joined ít nhất 1 nhóm' },
                      { value: 'not_joined', label: 'Chưa joined nhóm nào' },
                    ]
              }
            />
          </div>
          <div>
            <div className="mb-1">
              <Tooltip title="Lọc theo Ngày nhập (inputDate - ngày người nhập tự chọn)">
                <Text strong>Ngày nhập</Text>
              </Tooltip>
            </div>
            <DatePicker.RangePicker
              value={[inputDateFrom, inputDateTo]}
              onChange={handleInputDateRangeChange}
              format="DD/MM/YYYY"
              placeholder={['Từ ngày', 'Đến ngày']}
              style={{ width: 240 }}
              allowClear
            />
          </div>
          <div>
            <div className="mb-1">
              <Tooltip title="Lọc theo Ngày nhập THỰC TẾ (createdAt - lúc bản ghi được tạo trong hệ thống, có giờ:phút)">
                <Text strong>Ngày nhập thực tế</Text>
              </Tooltip>
            </div>
            <DatePicker.RangePicker
              value={[createdAtFrom, createdAtTo]}
              onChange={handleCreatedAtRangeChange}
              format="DD/MM/YYYY"
              placeholder={['Từ ngày', 'Đến ngày']}
              style={{ width: 240 }}
              allowClear
            />
          </div>
          <div>
            <div className="mb-1"><Text strong>Tìm kiếm</Text></div>
            <Input.Search
              defaultValue={search}
              allowClear
              placeholder="Tên, SĐT, Email..."
              style={{ width: 240 }}
              onSearch={handleSearch}
            />
          </div>
          <Space>
            {hasActiveFilters && (
              <Button icon={<ClearOutlined />} onClick={handleResetFilters}>
                Xóa bộ lọc
              </Button>
            )}
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchData({})}
            >
              Làm mới
            </Button>
          </Space>
        </Space>

        {/* Banner cảnh báo riêng cho 2 loại trùng lặp - chỉ hiện sau khi đã
           fetch xong lần đầu cho loại đang chọn (tránh nháy "Không phát
           hiện" rồi đổi ngay sang có dữ liệu khi loading). Không tính
           trùng Tên - đúng yêu cầu người dùng, vì tên trùng (VD 2 khách
           tên "Ken") là chuyện bình thường, không phải dấu hiệu data lỗi.
           ⚠️ SỬA LẠI ĐÚNG (yêu cầu người dùng): bản trước đổi `title` thành
           `message` do nhầm với API antd 4/5 (`message` là prop đúng ở bản
           đó). Project này đã lên **antd 6.3.5** - ở bản này `title` mới là
           prop CHÍNH THỨC (`message` giờ chỉ còn là alias @deprecated, xem
           `node_modules/antd/es/alert/Alert.d.ts`) - đổi lại đúng `title`. */}
        {isDuplicateView && !loading && (
          duplicateGroupCount ? (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              title={`Phát hiện ${duplicateGroupCount} ${duplicateLabel.toLowerCase()} bị trùng`}
              description={`Tổng cộng ${affectedCustomerCount} khách hàng liên quan đến ${duplicateGroupCount} ${duplicateLabel.toLowerCase()} bị lặp lại — các dòng cùng màu Tag ở cột "${duplicateLabel}" bên dưới đã được gộp thành 1 nhóm. Hệ thống KHÔNG chặn việc nhập trùng SĐT/Email (để không cản trở nghiệp vụ khi nhiều Sales/phòng ban cùng làm việc) — nguyên nhân phổ biến nhất là Nhân viên chỉ thấy được data của mình (phân quyền OWN) nên vô tình nhập lại khách đã có người khác thêm trước đó. Cần rà soát thủ công (gộp/xoá bớt, hoặc gán chung 1 khách cho đúng Sales phụ trách) để tránh 2 Sales cùng chăm 1 khách mà không biết.`}
            />
          ) : (
            <Alert
              className="mb-4"
              type="success"
              showIcon
                title={`Không phát hiện ${duplicateLabel.toLowerCase()} nào bị trùng${hasActiveFilters ? ' (trong phạm vi bộ lọc đang chọn)' : ''}`}
            />
          )
        )}

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          pagination={pagination}
          loading={loading}
          onChange={handleTableChange}
          rowClassName={rowClassName}
          scroll={{ x: isDuplicateView ? 1300 : 1100 }}
        />
      </Card>
    </div>
  );
}