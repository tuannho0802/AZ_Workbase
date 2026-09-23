'use client';

import { useState, useEffect } from 'react';
import {
  Table, Select, Button, Modal, Tag, Space, Input,
  Typography, Row, Col, Statistic, Divider, Tabs,
  Avatar, Tooltip, Badge, App, Card, Pagination, Popconfirm, DatePicker
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import {
  UserAddOutlined, ReloadOutlined, SearchOutlined,
  CheckCircleOutlined, TeamOutlined, InfoCircleOutlined, DeleteOutlined
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosInstance from '@/lib/api/axios-instance';
import { useAuthStore } from '@/lib/stores/auth.store';
import { CustomerDetailDrawer } from '@/components/customers/CustomerDetailDrawer';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { SourceTag } from '@/components/customers/SourceTag';
// ⚠️ MỚI (yêu cầu người dùng) - có filter Trạng thái ở cả 2 tab nhưng thiếu
// hẳn cột "Trạng thái" trong bảng (không có gì để đối chiếu filter đang lọc
// ra đúng data hay không). Dùng CHUNG <StatusTag> (đọc màu/tên từ
// `customer_statuses`, ĐÚNG pattern StatusTag.tsx đang dùng ở /customers) -
// CHỈ hiển thị tĩnh, KHÔNG có dropdown sửa nhanh như `CustomerStatusSelect`
// ở /customers (yêu cầu rõ: trang này chỉ lấy data, không cho quick-edit).
import { StatusTag } from '@/components/customers/StatusTag';
// ⚠️ MỚI (2026-09-10) - dropdown lọc "Chọn Sales nhận data" theo Phòng ban/
// Vai trò/Vị trí (yêu cầu người dùng). CHỈ lọc danh sách candidate hiển thị
// trong Select ở Modal chia data - KHÔNG đụng tới rules phân quyền dữ liệu
// khách hàng (đã có UiVisibilityRule/CustomerAccessHelper lo phần đó rồi,
// xem comment ở managedDepartmentIds/customersViewScope bên dưới).
import { useDepartments } from '@/lib/hooks/useDepartments';
import { usePositions } from '@/lib/hooks/usePositions';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { resolveEntityColor } from '@/lib/utils/entityColor';
// ⚠️ FIX (tuân thủ key 'sales' của Assignment Group) - đây mới là nguồn "rules"
// thật (Phòng ban/Vị trí Admin cấu hình qua /quan-ly-phu-trach, xem migration
// 1781100000000-CreateAssignmentGroupConfigs.ts), ĐÚNG pattern customers/page.tsx
// (`salesUsersInDept = useAssignmentGroupUsers('sales')`). Trước đây trang này
// chỉ có 3 dropdown lọc THỦ CÔNG (candidateDeptId/Position/Role) trên nền FULL
// usersData - không tự động áp rule 'sales', nên bấm "Chọn Sales nhận data" vẫn
// ra tất cả user (kể cả Admin/phòng ban khác) nếu không tự tay lọc.
import { useAssignmentGroupUsers } from '@/lib/hooks/useAssignmentGroups';
// ⚠️ MỚI - dùng CHUNG component "mini-card" nhân viên đã có sẵn (Avatar +
// tên + Tag Vai trò), ĐÚNG pattern trash-can/duyet-phep/phong-ban đang dùng,
// thay vì tự vẽ text trơn cho cột "Người tạo".
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
// ⚠️ MỚI - cột "Ghi chú gần nhất" giờ lấy từ bảng customer_notes (batch
// attachRecentNotes() ở BE), Y CHANG cột cùng tên ở /customers - dùng
// chung type RecentNote đã export sẵn ở đó thay vì tự định nghĩa lại.
import type { RecentNote } from '@/lib/types/customer.types';

const { Text } = Typography;

// ── HELPERS Ghi chú gần nhất (copy nguyên logic từ customers/page.tsx theo
// đúng yêu cầu "làm y chang page customers") ────────────────────────────
const formatRecentNoteLine = (note: RecentNote) =>
  `${note.createdByName || 'Không xác định'}: ${note.note} (${dayjs(note.createdAt).format('D/M/YY')})`;

const truncateAtWordBoundary = (text: string, maxLength = 20): string => {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const cuttingMidWord = text[maxLength] !== ' ';
  const safeCut = cuttingMidWord ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  const finalText = safeCut.trim().length > 0 ? safeCut.trimEnd() : cut;
  return `${finalText}...`;
};

const renderRecentNotesCell = (record: Customer, count: number) => {
  const allNotes = record.recentNotes || [];
  if (allNotes.length === 0) {
    return <span style={{ color: '#bbb', fontStyle: 'italic', fontSize: '11px' }}>Chưa có ghi chú</span>;
  }

  const visibleNotes = allNotes.slice(0, count);
  const fullLatestLine = formatRecentNoteLine(visibleNotes[0]);
  const latestLine = truncateAtWordBoundary(fullLatestLine, 20);

  const tooltipContent = (
    <div style={{ minWidth: 220, maxWidth: 320, fontSize: 12 }}>
      {visibleNotes.map((n, idx) => (
        <div key={n.id} style={idx < visibleNotes.length - 1 ? { marginBottom: 8 } : undefined}>
          <strong>{n.createdByName || 'Không xác định'}:</strong> {n.note}
          <br />
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>
            {dayjs(n.createdAt).format('HH:mm DD/MM/YYYY')}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} mouseEnterDelay={0.3}>
      <div style={{ maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'help', fontSize: 12 }}>
        {latestLine}
      </div>
    </Tooltip>
  );
};

// ── TYPES ──────────────────────────────────────────────
interface Customer {
  id: number;
  name: string | null;
  phone: string | null;
  source: string | null;
  campaign: string | null;
  note: string | null;
  recentNotes?: RecentNote[];
  inputDate: string | null;
  salesUser: { id: number; name: string; fullName?: string } | null;
  marketingUser: { id: number; name: string; fullName?: string } | null;
  // ⚠️ MỚI - thêm `role` (BE trả sẵn, User entity không `select: false` cho
  // cột này) để render bằng <UserMiniCard> (Avatar + Tag màu Vai trò) thay
  // vì text trơn, ĐÚNG pattern đã dùng ở trash-can/duyet-phep/phong-ban.
  createdBy: { id: number; name: string; fullName?: string; role?: string } | null;
  updatedBy?: { id: number; name: string; fullName?: string; role?: string } | null;
  createdAt: string;
  updatedAt?: string;
  // ⚠️ MỚI - BE (`getUnassigned`/`getAssigned`) đã trả sẵn field này (không
  // `.select()` giới hạn cột) - trước đây FE chỉ chưa khai báo/hiển thị.
  status?: string | null;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  department?: { id: number; name: string; color?: string } | null;
  // ⚠️ MỚI - rà soát Vị trí 2026-09-10: nguồn `/users/all` (findEmployees())
  // giờ đã JOIN 'position' đối xứng 'department'.
  position?: { id: number; name: string; color?: string } | null;
}

interface Department {
  id: number;
  name: string;
  // ⚠️ Nguồn "ai đang quản lý phòng ban này" giờ là nhiều-nhiều (bảng
  // department_managers, xem department-manager.entity.ts ở BE) - KHÔNG
  // còn dùng cột managerUserId cũ (đã deprecated, BE không còn ghi giá trị
  // mới vào đó). GET /departments trả kèm mảng `managers` này.
  managers?: { id: number; name: string; role: string }[];
}

// ── API CALLS (inline để tránh import lỗi) ─────────────
const api = {
  getUnassigned: (p: any) => 
    axiosInstance.get('/customers/unassigned', { params: p }),
  getAssigned: (p: any) => 
    axiosInstance.get('/customers/assigned', { params: p }),
  bulkAssign: (body: any) => 
    axiosInstance.patch('/customers/bulk-assign', body),
  getUsers: () => 
    axiosInstance.get('/users/all'),
  // Cần để tính đúng "phòng ban Manager đang quản lý" (user.id nằm trong
  // department.managers[] - bảng department_managers, nhiều-nhiều) - dùng
  // lọc dropdown "Data Owner"/"Lọc theo Sales" cho khớp ĐÚNG phạm vi Manager
  // được XEM (xem CustomerAccessHelper.applyViewFilter ở BE - Manager chỉ
  // xem được KH thuộc phòng ban mà mình được gán quản lý, KHÔNG phải phòng
  // ban mà bản thân Manager trực thuộc).
  getDepartments: () =>
    axiosInstance.get('/departments'),
  deleteCustomer: (id: number) =>
    axiosInstance.delete('/customers/' + id),
};

const UnassignedMobileCard = ({ record, user, renderAuditTrail, onNameClick, onDelete }: { record: Customer, user: any, renderAuditTrail: (r: any) => React.ReactNode, onNameClick: () => void, onDelete: (id: number) => void }) => {
  const isMyPrimary = record.salesUser?.id === user?.id;
  // ⚠️ FIX BUG THẬT (rà soát permission): trước đây hardcode
  // `user?.role === 'admin'` - nếu Admin sau này cấp `customers.delete` cho
  // role khác qua trang Phân quyền, role đó vẫn KHÔNG thấy nút Xoá dù BE đã
  // cho phép (thiếu tính năng). Ngược lại nếu Admin THU HỒI quyền xoá của
  // chính role admin (hiếm nhưng hệ thống cho phép), nút vẫn hiện ra và bấm
  // sẽ dính 403 - đúng lỗi user yêu cầu rà soát. Dùng `can()` động thay thế.
  const { can } = useMyPermissions();
  const canDelete = can('customers.delete');

  return (
    <Card
      size="small"
      variant="outlined"
      style={{ marginBottom: 8 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Space size={4}>
          {isMyPrimary && (
            <Tooltip title="Bạn đang là Sales phụ trách chính">
              <Tag color="green" style={{ margin: 0 }}>👤</Tag>
            </Tooltip>
          )}
          {record.name ? (
            <Space size={4}>
              <Text strong style={{ color: '#1890ff', cursor: 'pointer' }} onClick={onNameClick}>{record.name}</Text>
              <Tooltip title={renderAuditTrail(record)} mouseEnterDelay={0.3}>
                <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'help', fontSize: '11px' }} />
              </Tooltip>
            </Space>
          ) : (
            <Text type="secondary" italic>Chưa có tên</Text>
          )}
        </Space>
        <Space size={4}>
          {record.source ? <SourceTag source={record.source} /> : <Text type="secondary">-</Text>}
          {canDelete && (
            <Popconfirm
              title="Xóa khách hàng"
              description="Bạn có chắc chắn muốn xóa khách hàng này?"
              onConfirm={(e) => { e?.stopPropagation(); onDelete(record.id); }}
              onCancel={(e) => e?.stopPropagation()}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} size="small" />
            </Popconfirm>
          )}
        </Space>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 12, color: '#555' }}>
        <span>📞 {record.phone || 'Chưa có SĐT'}</span>
        <span>📅 {record.inputDate ? dayjs(record.inputDate).format('DD/MM/YY') : '-'}</span>
      </div>
      {record.recentNotes && record.recentNotes.length > 0 && (
        <div style={{ marginBottom: 4 }}>📝 {renderRecentNotesCell(record, 3)}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#8c8c8c' }}>
        <span>UTM: {record.campaign || '-'}</span>
        <span>Tạo bởi: {record.createdBy?.name || 'Hệ thống'}</span>
      </div>
    </Card>
  );
};

const AssignedMobileCard = ({ record, user, renderAuditTrail, onNameClick, onDelete }: { record: Customer, user: any, renderAuditTrail: (r: any) => React.ReactNode, onNameClick: () => void, onDelete: (id: number) => void }) => {
  const primarySales = record.salesUser;
  const allAssignees = (record as any).activeAssignees || [];
  const sharedSales = allAssignees.filter((a: any) => a.id !== primarySales?.id);
  const { can } = useMyPermissions();
  const canDelete = can('customers.delete');

  return (
    <Card
      size="small"
      variant="outlined"
      style={{ marginBottom: 8 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Space size={4}>
          {record.name ? (
            <Space size={4}>
              <Text strong style={{ color: '#1890ff', cursor: 'pointer' }} onClick={onNameClick}>{record.name}</Text>
              <Tooltip title={renderAuditTrail(record)} mouseEnterDelay={0.3}>
                <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'help', fontSize: '11px' }} />
              </Tooltip>
            </Space>
          ) : (
            <Text type="secondary" italic>Chưa có tên</Text>
          )}
        </Space>
        <Space size={4}>
          {record.source ? <SourceTag source={record.source} /> : <Text type="secondary">-</Text>}
          {canDelete && (
            <Popconfirm
              title="Xóa khách hàng"
              description="Bạn có chắc chắn muốn xóa khách hàng này?"
              onConfirm={(e) => { e?.stopPropagation(); onDelete(record.id); }}
              onCancel={(e) => e?.stopPropagation()}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} size="small" />
            </Popconfirm>
          )}
        </Space>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 12, color: '#555' }}>
        <span>📞 {record.phone || 'Chưa có SĐT'}</span>
        <span>📅 {record.inputDate ? dayjs(record.inputDate).format('DD/MM/YY') : '-'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Space size={[0, 4]} align="center" wrap>
          {primarySales ? <Tag color="blue" style={{ fontSize: 10 }} title="Sales phụ trách chính">{primarySales.name}</Tag> : <Text type="secondary" style={{ fontSize: 10 }}>Chưa có Primary</Text>}
          {sharedSales.length > 0 && (
            <Tooltip title={`Sales được chia:\n${sharedSales.map((a: any) => a.name).join(', ')}`}>
              <Tag color="cyan" style={{ fontSize: 10 }}>+{sharedSales.length}</Tag>
            </Tooltip>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 11 }}>Tạo bởi: {record.createdBy?.name || 'Hệ thống'}</Text>
      </div>
      {record.recentNotes && record.recentNotes.length > 0 && (
        <div style={{ marginTop: 4 }}>📝 {renderRecentNotesCell(record, 3)}</div>
      )}
    </Card>
  );
};

// ── MAIN COMPONENT ─────────────────────────────────────
export default function ChiaDataPage() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const qc = useQueryClient();
  const { message: antdMessage } = App.useApp();

  // Danh sách nguồn cho dropdown filter - lấy TẤT CẢ (kể cả đã khoá), vì
  // khách hàng cũ vẫn có thể mang 1 nguồn đã bị khoá sau này, khác với form
  // thêm khách hàng mới (chỉ cho chọn nguồn đang mở - xem CustomerForm.tsx).
  const { sources: allMediaSources } = useMediaSources(false);

  // State: filters cho bảng Chưa assign
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [unassignedSearch, setUnassignedSearch] = useState('');
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [filterDataOwner, setFilterDataOwner] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [unassignedDateFrom, setUnassignedDateFrom] = useState<Dayjs | null>(null);
  const [unassignedDateTo, setUnassignedDateTo] = useState<Dayjs | null>(null);
  // ⚠️ MỚI - tách riêng khoảng ngày lọc theo "Ngày nhập thực tế" (createdAt,
  // có giờ:phút) khỏi unassignedDateFrom/To ở trên (đang lọc inputDate -
  // ngày người nhập tự chọn). 2 RangePicker độc lập, không đè lên nhau.
  const [unassignedCreatedAtFrom, setUnassignedCreatedAtFrom] = useState<Dayjs | null>(null);
  const [unassignedCreatedAtTo, setUnassignedCreatedAtTo] = useState<Dayjs | null>(null);

  // State: filters cho bảng Đã assign
  const [assignedPage, setAssignedPage] = useState(1);
  const [assignedSearch, setAssignedSearch] = useState('');
  const [filterAssignedStatus, setFilterAssignedStatus] = useState<string | null>(null);
  const [assignedDateFrom, setAssignedDateFrom] = useState<Dayjs | null>(null);
  const [assignedDateTo, setAssignedDateTo] = useState<Dayjs | null>(null);
  // ⚠️ MỚI - tương tự tab "Có thể chia", tách riêng khoảng ngày lọc theo
  // "Ngày nhập thực tế" (createdAt) khỏi assignedDateFrom/To (inputDate).
  const [assignedCreatedAtFrom, setAssignedCreatedAtFrom] = useState<Dayjs | null>(null);
  const [assignedCreatedAtTo, setAssignedCreatedAtTo] = useState<Dayjs | null>(null);
  // ⚠️ MỚI (yêu cầu người dùng - tab "Đã assign"): 2 dropdown lọc thêm.
  // - filterPrimaryUser -> `primaryUserId` (BE: OR giữa salesUserId VÀ
  //   marketingUserId - gộp cả Sales lẫn Marketing "phụ trách chính").
  //   Thay thế hẳn dropdown "Lọc theo Sales" cũ (-> `salesUserId`, chỉ khớp
  //   cột Sales, đã bỏ khỏi UI) vì primaryUserId là superset đúng ý người
  //   dùng yêu cầu ("bao gồm Sales và Marketing"). `salesUserId` vẫn còn
  //   nguyên trên BE (route/service) để không phá `assignments.api.ts` -
  //   một chỗ KHÁC đang gọi cùng endpoint - chỉ riêng UI trang này đổi.
  // - filterSharedUser -> `sharedUserId` (BE: khách đang có user này trong
  //   customer_assignments active, KHÔNG tính nếu user đó đang là Primary).
  const [filterPrimaryUser, setFilterPrimaryUser] = useState<number | null>(null);
  const [filterSharedUser, setFilterSharedUser] = useState<number | null>(null);

  // Số ghi chú gần nhất hiển thị trong tooltip cột "Ghi chú gần nhất" - ĐÚNG
  // pattern `recentNotesCount` ở /customers (chung 1 state cho cả 2 tab, vì
  // đây là 1 trang duy nhất, khác /customers vốn chỉ có 1 bảng).
  const [recentNotesCount, setRecentNotesCount] = useState<3 | 5>(3);

  // Trạng thái động (bảng customer_statuses) - dùng chung cho cả 2 tab, đồng
  // bộ với dropdown "Trạng thái" ở /customers (CustomerFilters.tsx).
  const { statuses: allCustomerStatuses } = useCustomerStatuses();

  // State: selection + modal
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  // Drawer chi tiết khách hàng (dùng chung CustomerDetailDrawer đã có sẵn
  // tab "Gán data" - Sửa/Thu hồi/Gán thêm) - mở NGAY TẠI trang này, không
  // điều hướng sang /customers nữa, theo đúng yêu cầu.
  const [detailCustomerId, setDetailCustomerId] = useState<number | null>(null);
  const [targetSalesIds, setTargetSalesIds] = useState<number[]>([]);
  // ⚠️ MỚI (2026-09-10) - 3 filter "rules" để thu hẹp danh sách candidate
  // trong Select "Chọn Sales nhận data" (Modal chia data) theo Phòng ban/
  // Vị trí/Vai trò - CHỈ lọc hiển thị dropdown, KHÔNG đụng rules phân quyền
  // dữ liệu khách hàng (đã có CustomerAccessHelper lo phần đó, xem comment
  // ở customersViewScope bên dưới). Reset về rỗng mỗi lần đóng/mở modal để
  // không giữ filter cũ từ lượt chia data trước.
  const [candidateDeptId, setCandidateDeptId] = useState<number | null>(null);
  const [candidatePositionId, setCandidatePositionId] = useState<number | null>(null);
  const [candidateRole, setCandidateRole] = useState<string | null>(null);

  // Auth State
  const router = useRouter();
  const { user, isAuthenticated, isHydrated } = useAuthStore();
  // ⚠️ FIX BUG THẬT (báo cáo trực tiếp qua ảnh chụp Ma trận quyền: Employee
  // tắt "assign" nhưng trang /chia-data KHÔNG ẩn, kể cả sidebar) - trước đây
  // trang này KHÔNG có gate riêng nào theo `customers.assign`, chỉ dựa vào
  // `isAuthenticated`. BE đã chặn đúng (403 khi bấm "Gán data" thật), nhưng
  // FE chưa theo kịp - vào được cả trang, chỉ 403 khi thao tác, đúng loại
  // bug "UI không theo kịp permission BE" đã rà soát trước đó. Thêm gate
  // cùng pattern với `trash-can/page.tsx` (canAccessTrash): đợi permissions
  // tải xong rồi mới quyết định, tránh nhấp nháy UI hoặc redirect nhầm lúc
  // chưa kịp tải.
  const { can, scope, isLoading: permissionsLoading } = useMyPermissions();
  const canDeleteCustomer = can('customers.delete');
  const canAssign = can('customers.assign');

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [isHydrated, isAuthenticated, router]);

  useEffect(() => {
    if (!permissionsLoading && user && !canAssign) {
      antdMessage.error('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
    }
  }, [user, canAssign, permissionsLoading, router, antdMessage]);

  // ── QUERIES ────────────────────────────────────────────
  const { data: unassignedData, isLoading: loadingUnassigned } = useQuery({
    queryKey: ['unassigned', unassignedPage, unassignedSearch,
      filterSource, filterDataOwner, filterStatus,
      unassignedDateFrom?.format('YYYY-MM-DD'), unassignedDateTo?.format('YYYY-MM-DD'),
      unassignedCreatedAtFrom?.format('YYYY-MM-DD'), unassignedCreatedAtTo?.format('YYYY-MM-DD')],
    queryFn: () => api.getUnassigned({
      page: unassignedPage, limit: 20,
      search: unassignedSearch || undefined,
      source: filterSource || undefined,
      creatorId: filterDataOwner || undefined,
      status: filterStatus || undefined,
      dateFrom: unassignedDateFrom?.format('YYYY-MM-DD') || undefined,
      dateTo: unassignedDateTo?.format('YYYY-MM-DD') || undefined,
      createdAtFrom: unassignedCreatedAtFrom?.format('YYYY-MM-DD') || undefined,
      createdAtTo: unassignedCreatedAtTo?.format('YYYY-MM-DD') || undefined,
    }).then(r => r.data),
    staleTime: 30_000,
    enabled: isHydrated && isAuthenticated, // Chỉ chạy khi đã nạp xong token
  });

  const { data: assignedData, isLoading: loadingAssigned } = useQuery({
    queryKey: ['assigned', assignedPage, assignedSearch,
      filterAssignedStatus, assignedDateFrom?.format('YYYY-MM-DD'), assignedDateTo?.format('YYYY-MM-DD'),
      assignedCreatedAtFrom?.format('YYYY-MM-DD'), assignedCreatedAtTo?.format('YYYY-MM-DD'),
      filterPrimaryUser, filterSharedUser],
    queryFn: () => api.getAssigned({
      page: assignedPage, limit: 20,
      search: assignedSearch || undefined,
      status: filterAssignedStatus || undefined,
      dateFrom: assignedDateFrom?.format('YYYY-MM-DD') || undefined,
      dateTo: assignedDateTo?.format('YYYY-MM-DD') || undefined,
      createdAtFrom: assignedCreatedAtFrom?.format('YYYY-MM-DD') || undefined,
      createdAtTo: assignedCreatedAtTo?.format('YYYY-MM-DD') || undefined,
      primaryUserId: filterPrimaryUser || undefined,
      sharedUserId: filterSharedUser || undefined,
    }).then(r => r.data),
    staleTime: 30_000,
    enabled: isHydrated && isAuthenticated,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-all'],
    queryFn: () => api.getUsers().then(r => r.data),
    staleTime: 5 * 60_000,
    enabled: isHydrated && isAuthenticated,
  });

  const { data: departmentsData } = useQuery({
    queryKey: ['departments-all'],
    queryFn: () => api.getDepartments().then(r => r.data),
    staleTime: 5 * 60_000,
    enabled: isHydrated && isAuthenticated,
  });

  // ── "RULES" LỌC CANDIDATE Ở MODAL CHIA DATA (2026-09-10) ─────────────
  // Dùng ĐÚNG nguồn dữ liệu chuẩn (đã cache React Query, cùng nguồn với
  // /phan-quyen, /phong-ban, /vi-tri, users/page.tsx) thay vì tự chế lại
  // list rời rạc - departments ở đây có `color` (đủ cho resolveEntityColor),
  // KHÁC với `departmentsData` (chỉ dùng tính managedDepartmentIds ở dưới,
  // giữ nguyên không đụng để tránh phá logic RBAC hiện có).
  const { departments: allDepartments } = useDepartments();
  const { positions: allPositions } = usePositions();
  const { getRoleColor } = useRoleColorMap();
  // ⚠️ FIX BUG THẬT (403 "GET /api/roles" liên tục ở trang Chia Data, kể cả
  // F5) - `useRoles()` (GET /roles) đòi `roles.view`, Employee/Sales không
  // có -> toast lỗi đỏ tự động mỗi lần vào trang (axios-instance.ts
  // interceptor). Đổi sang `useRoleColors()` (GET /roles/colors) - route AN
  // TOÀN đã có sẵn, không cần `roles.view`, trả đủ {id,code,name,color} cho
  // cả map tên hiển thị lẫn 3 dropdown "rules" Phòng ban/Vị trí/Vai trò bên
  // dưới (candidateRoleOptions).
  const { roleColors: allRoles } = useRoleColors();
  // ⚠️ FIX BUG THẬT (báo cáo qua ảnh chụp, đồng bộ CustomerFilters.tsx): Tag
  // Vai trò ở userOptions/renderUserOption bên dưới trước đây hiện thẳng
  // `u.role` (CODE hệ thống vd "manager") thay vì TÊN hiển thị Admin đặt ở
  // /phan-quyen (vd "Quản lý").
  const roleNameMap = new Map(allRoles.map((r: any) => [r.code, r.name]));
  const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');
  // Danh sách user hợp lệ theo ĐÚNG config key='sales' (Assignment Group) -
  // nguồn "rules" thật sự, KHÔNG phải 3 dropdown lọc thủ công bên dưới.
  const { users: salesRuleUsers } = useAssignmentGroupUsers('sales');

  // ── MUTATION: Bulk Assign ───────────────────────────────
  const { mutate: doAssign, isPending: assigning } = useMutation({
    mutationFn: () => api.bulkAssign({
      customerIds: selectedIds,
      salesUserIds: targetSalesIds,
      reason: 'Redesigned Chia Data Page Assignment',
    }).then(r => r.data),
    onSuccess: (result) => {
      antdMessage.success(
        `✅ Đã chia ${result.success} khách cho ${targetSalesIds.length} Sales`
      );
      if (result.failed > 0) {
        antdMessage.warning(`Có ${result.failed} khách không thể chia (đã có sales hoặc lỗi)`);
      }
      // Reset và refresh
      setSelectedIds([]);
      setTargetSalesIds([]);
      setModalOpen(false);
      qc.invalidateQueries({ queryKey: ['unassigned'] });
      qc.invalidateQueries({ queryKey: ['assigned'] });
    },
    onError: (err: any) => {
      console.log('Assignment error:', err);
      antdMessage.error('Lỗi: ' + (err.response?.data?.message || err.message));
    },
  });

  const handleDeleteCustomer = async (id: number) => {
    try {
      await api.deleteCustomer(id);
      antdMessage.success('Đã xóa khách hàng');
      qc.invalidateQueries({ queryKey: ['unassigned'] });
      qc.invalidateQueries({ queryKey: ['assigned'] });
    } catch (error: any) {
      antdMessage.error(error?.response?.data?.message || 'Lỗi khi xóa khách hàng');
    }
  };

  // ── HELPERS ──────────────────────────────────────────
  const renderAuditTrail = (record: Customer | any) => {
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

  // ── COLUMNS: Bảng Chưa assign ──────────────────────────
  const unassignedColumns = [
    {
      title: '#', width: 50,
      render: (_: any, __: any, i: number) =>
        (unassignedPage - 1) * 20 + i + 1,
    },
    {
      title: 'Tên khách hàng', dataIndex: 'name', width: 200,
      render: (v: string | null, r: Customer) => {
        const isMyPrimary = r.salesUser?.id === user?.id;
        return (
          <Space>
            {isMyPrimary && (
              <Tooltip title="Bạn đang là Sales phụ trách chính">
                <Tag color="green" style={{ margin: 0 }}>👤</Tag>
              </Tooltip>
            )}
            {v ? (
              <Space size={4}>
                <Text strong style={{ color: '#1890ff' }}>{v}</Text>
                <Tooltip title={renderAuditTrail(r)} mouseEnterDelay={0.3}>
                  <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'help', fontSize: '12px' }} />
                </Tooltip>
              </Space>
            ) : <Text type="secondary" italic>Chưa có tên</Text>}
          </Space>
        );
      }
    },
    {
      title: 'SĐT', dataIndex: 'phone', width: 130,
      render: (v: string | null) => v
        ? v
        : <Text type="secondary">Chưa có</Text>,
    },
    {
      title: 'Nguồn', dataIndex: 'source', width: 110,
      render: (v: string | null) => v
        ? <SourceTag source={v} />
        : <Text type="secondary">-</Text>,
    },
    {
      // ⚠️ MỚI (yêu cầu người dùng) - chỉ hiển thị, KHÔNG cho quick-edit
      // (khác /customers) - xem comment đầy đủ ở import StatusTag đầu file.
      title: 'Trạng thái', dataIndex: 'status', width: 120,
      render: (v: string | null) => <StatusTag code={v} fallback={<Text type="secondary">-</Text>} />,
    },
    {
      title: 'Campaign', dataIndex: 'campaign', width: 160,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      // ⚠️ SỬA (yêu cầu người dùng) - "Ghi chú" trước đây lấy thẳng
      // `customer.note` (1 cột text đơn trên bảng customers, gần như không
      // ai dùng thực tế) - giờ đổi sang "Ghi chú gần nhất" lấy từ bảng
      // `customer_notes` (nhiều ghi chú theo thời gian, có người tạo), ĐÚNG
      // NGUYÊN VĂN cột cùng tên ở /customers (`renderRecentNotesCell`, BE đã
      // gắn sẵn qua `attachRecentNotes()` - xem đầu file).
      title: 'Ghi chú gần nhất', key: 'recentNotes', width: 180,
      render: (_: any, r: Customer) => renderRecentNotesCell(r, recentNotesCount),
    },
    {
      // ⚠️ SỬA (yêu cầu người dùng) - "Người tạo" trước đây chỉ hiện text
      // trơn - giờ dùng CHUNG <UserMiniCard> (Avatar + Tag Vai trò), ĐÚNG
      // pattern trash-can/duyet-phep - vẫn giữ Tooltip renderAuditTrail bọc
      // ngoài (hiện giờ:phút tạo + sửa cuối khi di chuột).
      title: 'Người tạo', width: 190,
      render: (_: any, r: Customer) => (
        <Tooltip title={renderAuditTrail(r)}>
          <span style={{ cursor: 'help', display: 'inline-block' }}>
            {r.createdBy ? (
              <UserMiniCard
                name={r.createdBy.name}
                role={r.createdBy.role}
                getRoleColor={getRoleColor}
                getRoleName={getRoleName}
                hideRoleTag
                nameFontSize={12}
              />
            ) : (
              <Text type="secondary">Hệ thống</Text>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Ngày nhập', dataIndex: 'inputDate', width: 110,
      render: (v: string | null) => v
        ? dayjs(v).format('DD/MM/YYYY')
        : '-',
    },
    {
      // ⚠️ MỚI - "Ngày nhập thực tế" = customer.createdAt (khác "Ngày nhập"
      // = inputDate, cột trên chỉ có ngày do người nhập tự chọn/không giờ
      // phút). Cột này lấy timestamp THẬT lúc bản ghi được tạo trong hệ
      // thống (có giờ:phút) - hiện rút gọn dd/mm/yy, hover xem đủ giờ:phút +
      // ai tạo qua chung tooltip renderAuditTrail.
      title: 'Ngày nhập thực tế', dataIndex: 'createdAt', width: 130,
      render: (v: string, r: Customer) => (
        <Tooltip title={renderAuditTrail(r)}>
          <span style={{ cursor: 'help' }}>{v ? dayjs(v).format('DD/MM/YY') : '-'}</span>
        </Tooltip>
      ),
    },
    ...(canDeleteCustomer ? [{
      title: 'Thao tác', width: 60, align: 'center' as const,
      render: (_: any, r: Customer) => (
        <Popconfirm
          title="Xóa khách hàng"
          description="Bạn có chắc muốn xóa?"
          onConfirm={(e) => { e?.stopPropagation(); handleDeleteCustomer(r.id); }}
          onCancel={(e) => e?.stopPropagation()}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} size="small" />
        </Popconfirm>
      )
    }] : []),
  ];

  // ── COLUMNS: Bảng Đã assign ────────────────────────────
  const assignedColumns = [
    {
      title: '#', width: 50,
      render: (_: any, __: any, i: number) =>
        (assignedPage - 1) * 20 + i + 1,
    },
    {
      title: 'Tên khách hàng', dataIndex: 'name', width: 200,
      render: (v: string | null, r: Customer) => (
        v ? (
          <Space size={4}>
            <Text strong style={{ color: '#1890ff' }}>{v}</Text>
            <Tooltip title={renderAuditTrail(r)} mouseEnterDelay={0.3}>
              <InfoCircleOutlined style={{ color: '#1890ff', cursor: 'help', fontSize: '12px' }} />
            </Tooltip>
          </Space>
        ) : <Text type="secondary" italic>Chưa có tên</Text>
      ),
    },
    {
      title: 'SĐT', dataIndex: 'phone', width: 130,
      render: (v: string | null) => v || 
        <Text type="secondary">Chưa có</Text>,
    },
    {
      title: 'Sales Phụ trách chính', width: 180,
      render: (_: any, r: any) => {
        const primarySales = r.salesUser;
        const allAssignees = r.activeAssignees || [];
        const sharedSales = allAssignees.filter((a: any) => a.id !== primarySales?.id);

        if (!primarySales && sharedSales.length === 0) {
          return <Text type="secondary">-</Text>;
        }

        return (
          <Space size={[0, 4]} align="center" wrap>
            {primarySales ? <Tag color="blue" title="Sales phụ trách chính">{primarySales.name}</Tag> : <Text type="secondary">Chưa có Primary</Text>}
            {sharedSales.length > 0 && (
              <Tooltip title={`Sales được chia:\n${sharedSales.map((a: any) => a.name).join(', ')}`}>
                <Tag color="cyan">+{sharedSales.length}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Nguồn', dataIndex: 'source', width: 100,
      render: (v: string | null) => v
        ? <SourceTag source={v} /> : '-',
    },
    {
      // ⚠️ MỚI (yêu cầu người dùng) - đồng bộ đúng cột "Trạng thái" như
      // bảng "Có thể chia" ở trên - chỉ hiển thị, KHÔNG cho quick-edit, xem
      // comment đầy đủ ở import StatusTag đầu file.
      title: 'Trạng thái', dataIndex: 'status', width: 120,
      render: (v: string | null) => <StatusTag code={v} fallback={<Text type="secondary">-</Text>} />,
    },
    {
      // ⚠️ SỬA (yêu cầu người dùng) - đồng bộ đúng cột "Ghi chú gần nhất"
      // (customer_notes) như bảng "Có thể chia" ở trên, xem comment đầy đủ
      // ở unassignedColumns.
      title: 'Ghi chú gần nhất', key: 'recentNotes', width: 180,
      render: (_: any, r: Customer) => renderRecentNotesCell(r, recentNotesCount),
    },
    {
      // ⚠️ SỬA (yêu cầu người dùng) - đồng bộ đúng <UserMiniCard> như bảng
      // "Có thể chia" ở trên, xem comment đầy đủ ở unassignedColumns.
      title: 'Người tạo', width: 190,
      render: (_: any, r: Customer) => (
        <Tooltip title={renderAuditTrail(r)}>
          <span style={{ cursor: 'help', display: 'inline-block' }}>
            {r.createdBy ? (
              <UserMiniCard
                name={r.createdBy.name}
                role={r.createdBy.role}
                getRoleColor={getRoleColor}
                getRoleName={getRoleName}
                hideRoleTag
                nameFontSize={12}
              />
            ) : (
              <Text type="secondary">Hệ thống</Text>
            )}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Ngày nhập', dataIndex: 'inputDate', width: 110,
      render: (v: string | null) => v
        ? dayjs(v).format('DD/MM/YYYY') : '-',
    },
    {
      // ⚠️ MỚI - đồng bộ đúng cột "Ngày nhập thực tế" (createdAt, có giờ:phút)
      // như bảng "Có thể chia" ở trên, xem comment đầy đủ ở unassignedColumns.
      title: 'Ngày nhập thực tế', dataIndex: 'createdAt', width: 130,
      render: (v: string, r: Customer) => (
        <Tooltip title={renderAuditTrail(r)}>
          <span style={{ cursor: 'help' }}>{v ? dayjs(v).format('DD/MM/YY') : '-'}</span>
        </Tooltip>
      ),
    },
    ...(canDeleteCustomer ? [{
      title: 'Thao tác', width: 60, align: 'center' as const,
      render: (_: any, r: Customer) => (
        <Popconfirm
          title="Xóa khách hàng"
          description="Bạn có chắc muốn xóa?"
          onConfirm={(e) => { e?.stopPropagation(); handleDeleteCustomer(r.id); }}
          onCancel={(e) => e?.stopPropagation()}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} size="small" />
        </Popconfirm>
      )
    }] : []),
  ];

  // ── Phạm vi XEM theo role - dùng để lọc dropdown "Data Owner"/"Lọc theo
  // Sales" cho khớp ĐÚNG với những gì BE thực sự trả về (CustomerAccessHelper.
  // applyViewFilter). KHÔNG liên quan tới "Chọn Sales nhận data" ở modal Chia
  // data - chỗ đó giờ lọc theo "rules" Assignment Group key='sales' (xem
  // candidateUsers bên dưới), độc lập với RBAC xem dữ liệu khách hàng ở đây.
  const managedDepartmentIds = ((departmentsData || []) as Department[])
    .filter((d) => (d.managers ?? []).some((m) => m.id === user?.id))
    .map((d) => d.id);

  // ⚠️ FIX BUG THẬT (rà soát permission 2026-09): trước đây if/else hardcode
  // theo `user?.role` - nếu Admin đổi scope của `customers.view` cho 1 role
  // (vd đổi Manager từ 'department' sang 'own', hoặc cấp 'all' cho 1 role
  // tuỳ chỉnh) qua trang Phân quyền, dropdown này KHÔNG phản ánh theo, vẫn
  // hành xử như cấu hình gốc - đúng kiểu lệch UI/API đang rà soát. Giờ đọc
  // trực tiếp `scope('customers.view')` (nguồn THẬT mà PermissionGuard ở BE
  // dùng để enforce applyViewFilter) thay vì suy luận lại từ role string.
  const customersViewScope = scope('customers.view');
  const viewScopeUsers: User[] = (() => {
    if (customersViewScope === 'all') {
      return usersData || [];
    }
    if (customersViewScope === 'department') {
      return (usersData || []).filter(
        (u: User) => u.id === user?.id || (u.department?.id != null && managedDepartmentIds.includes(u.department.id)),
      );
    }
    // scope === 'own' hoặc không có quyền customers.view: phạm vi xem chỉ
    // có chính mình -> dropdown lọc theo "Data Owner"/"Sales" chỉ còn đúng
    // 1 lựa chọn hợp lý là bản thân, nên ẨN LUÔN 2 dropdown này ở phần
    // RENDER (xem isMobile/không isMobile bên dưới) thay vì hiện dropdown
    // chỉ có 1 option gây rối mắt.
    return [];
  })();

  // ── CANDIDATE cho Select "Chọn Sales nhận data" (modal Chia data) -
  // ⚠️ FIX BUG THẬT (báo cáo trực tiếp: "Bấm chọn Sales để gán thì nó ra
  // full User") - trước đây nền là FULL `usersData` (mọi role/phòng ban),
  // 3 dropdown Phòng ban/Vị trí/Vai trò chỉ là lọc THÊM thủ công, không có
  // "rule" mặc định nào. Giờ bắt buộc nền PHẢI là danh sách đã lọc theo
  // đúng config key='sales' (Assignment Group, Admin cấu hình qua
  // /quan-ly-phu-trach - mặc định = Phòng "Kinh doanh", xem migration
  // 1781100000000-CreateAssignmentGroupConfigs.ts), ĐÚNG pattern
  // `salesUsersInDept` ở customers/page.tsx. Join lại với `usersData` (thay
  // vì dùng thẳng `salesRuleUsers`) chỉ để giữ field `department.color`/
  // `position.color` cho Tag (resolveUsers() ở BE không trả `color`). 3
  // dropdown Phòng ban/Vị trí/Vai trò vẫn giữ để lọc SÂU HƠN bên trong tập
  // đã đúng rule này (không chọn gì = giữ nguyên toàn bộ tập rule).
  const salesRuleUserIds = new Set(salesRuleUsers.map((u) => u.id));
  const candidateUsers = (usersData || []).filter((u: User) => {
    if (!salesRuleUserIds.has(u.id)) return false;
    if (candidateDeptId != null && u.department?.id !== candidateDeptId) return false;
    if (candidatePositionId != null && u.position?.id !== candidatePositionId) return false;
    if (candidateRole != null && u.role !== candidateRole) return false;
    return true;
  });

  const userOptions = candidateUsers.map((u: User) => ({
    value: u.id,
    label: (
      <Space size={4} align="center">
        <Avatar size={20} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
          {u.name?.[0]?.toUpperCase()}
        </Avatar>
        <span style={{ fontSize: 13 }}>{u.name || u.email}</span>
        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>
        {u.department?.name && (
          <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={resolveEntityColor(u.department.color)}>{u.department.name}</Tag>
        )}
        {u.position?.name && (
          <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={resolveEntityColor(u.position.color)}>{u.position.name}</Tag>
        )}
      </Space>
    ),
  }));

  // Options cho 3 dropdown filter "rules" ở modal - Tag preview cùng màu
  // với Tag thật sẽ hiện trong danh sách candidate (resolveEntityColor),
  // để người dùng nhận ra ngay trước khi chọn.
  const candidateDeptOptions = allDepartments.map((d: any) => ({
    value: d.id,
    label: <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>{d.name}</Tag>,
  }));
  const candidatePositionOptions = allPositions.map((p: any) => ({
    value: p.id,
    label: <Tag color={resolveEntityColor(p.color)} style={{ marginInlineEnd: 0 }}>{p.name}</Tag>,
  }));
  const candidateRoleOptions = allRoles.map((r: any) => ({
    value: r.code,
    label: <Tag color={resolveEntityColor(r.color)} style={{ marginInlineEnd: 0 }}>{r.name}</Tag>,
  }));

  // Options cho 2 dropdown filter theo phạm vi xem (Data Owner / Lọc theo
  // Sales) - ⚠️ FIX (đồng bộ Tag màu Phòng ban/Vai trò/Vị trí, giống hệt
  // `userOptions` ở modal Chia data và CustomerFilters.tsx bên /customers):
  // trước đây chỉ render `u.name || u.email` trơn, không có Avatar/Tag nào.
  const viewScopeUserOptions = viewScopeUsers.map((u: User) => ({
    value: u.id,
    label: u.name || u.email,
    // "label" giữ text đơn giản cho optionLabelProp (hiện gọn khi đã chọn),
    // "user" mang FULL data để optionRender vẽ Avatar/Tag đầy đủ khi mở dropdown.
    user: u,
  }));
  const renderUserOption = (option: { data: { user: User } }) => {
    const u = option.data.user;
    return (
      <Space size={4} align="center">
        <Avatar size={20} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
          {u.name?.[0]?.toUpperCase()}
        </Avatar>
        <span style={{ fontSize: 13 }}>{u.name || u.email}</span>
        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>
        {u.department?.name && (
          <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={resolveEntityColor(u.department.color)}>{u.department.name}</Tag>
        )}
        {u.position?.name && (
          <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color={resolveEntityColor(u.position.color)}>{u.position.name}</Tag>
        )}
      </Space>
    );
  };

  // ── RENDER ─────────────────────────────────────────────
  if (!isHydrated || !isAuthenticated) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Typography.Title level={4}>Đang kiểm tra quyền truy cập...</Typography.Title>
      </div>
    );
  }

  // Đợi permissions tải xong trước khi quyết định - tránh render nhấp
  // nháy nội dung trang rồi mới redirect (cùng lý do permissionsLoading ở
  // trash-can/page.tsx). Sau khi tải xong, không có quyền `customers.assign`
  // thì không render gì cả (redirect đã được kích hoạt ở useEffect phía trên).
  if (permissionsLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Typography.Title level={4}>Đang kiểm tra quyền truy cập...</Typography.Title>
      </div>
    );
  }
  if (!canAssign) {
    return null;
  }

  return (
    <div style={{ padding: 24 }}>
      
      {/* HEADER STATS */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <div style={{ 
            background: '#fff', padding: 20, borderRadius: 8,
            border: '1px solid #f0f0f0' 
          }}>
            <Statistic
              title="Có thể chia"
              value={unassignedData?.pagination?.total ?? 0}
              prefix={<TeamOutlined style={{ color: '#faad14' }} />}
              styles={{ content: { color: '#faad14', fontSize: 28 } }}
            />
          </div>
        </Col>
        <Col span={6}>
          <div style={{ 
            background: '#fff', padding: 20, borderRadius: 8,
            border: '1px solid #f0f0f0' 
          }}>
            <Statistic
              title="Đã assign"
              value={assignedData?.pagination?.total ?? 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              styles={{ content: { color: '#52c41a', fontSize: 28 } }}
            />
          </div>
        </Col>
      </Row>

      {/* TABS: 2 bảng */}
      <Tabs
        defaultActiveKey="unassigned"
        items={[
          {
            key: 'unassigned',
            label: (
              <Badge 
                count={unassignedData?.pagination?.total ?? 0}
                overflowCount={9999}
                color="#faad14"
              >
                <span style={{ paddingRight: 8 }}>📋 Có thể chia</span>
              </Badge>
            ),
            children: (
              <>
                {/* FILTER ROW */}
                <Row gutter={12} style={{ marginBottom: 16 }} align="middle">
                  <Col flex="280px">
                    <Input
                      prefix={<SearchOutlined />}
                      placeholder="Tên, SĐT..."
                      allowClear
                      value={unassignedSearch}
                      onChange={e => {
                        setUnassignedSearch(e.target.value);
                        setUnassignedPage(1);
                      }}
                    />
                  </Col>
                  <Col flex="180px">
                    <Select
                      allowClear
                      placeholder="Nguồn"
                      style={{ width: '100%' }}
                      options={allMediaSources.map(s => ({
                        value: s.name, label: <SourceTag source={s.name} />
                      }))}
                      onChange={v => { 
                        setFilterSource(v ?? null); 
                        setUnassignedPage(1); 
                      }}
                    />
                  </Col>
                  {viewScopeUsers.length > 0 && (
                    <Col flex="220px">
                      <Select
                        allowClear
                        placeholder="Data Owner"
                        style={{ width: '100%' }}
                        options={viewScopeUserOptions}
                        optionLabelProp="label"
                        optionRender={renderUserOption}
                        popupMatchSelectWidth={false}
                        showSearch={{ optionFilterProp: 'label' }}
                        onChange={v => { 
                          setFilterDataOwner(v ?? null); 
                          setUnassignedPage(1); 
                        }}
                      />
                    </Col>
                  )}
                  <Col flex="160px">
                    <Select
                      allowClear
                      placeholder="Trạng thái"
                      style={{ width: '100%' }}
                      onChange={v => { setFilterStatus(v ?? null); setUnassignedPage(1); }}
                      options={allCustomerStatuses
                        .slice()
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map(s => ({ value: s.code, label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag> }))}
                    />
                  </Col>
                  <Col flex="260px">
                    <Tooltip title="Lọc theo Ngày nhập (inputDate - ngày người nhập tự chọn)">
                      <DatePicker.RangePicker
                        style={{ width: '100%' }}
                        format="DD/MM/YYYY"
                        placeholder={['Ngày nhập từ', 'đến']}
                        value={[unassignedDateFrom, unassignedDateTo]}
                        onChange={(vals) => {
                          setUnassignedDateFrom(vals?.[0] ?? null);
                          setUnassignedDateTo(vals?.[1] ?? null);
                          setUnassignedPage(1);
                        }}
                      />
                    </Tooltip>
                  </Col>
                  <Col flex="260px">
                    <Tooltip title="Lọc theo Ngày nhập THỰC TẾ (createdAt - lúc tạo bản ghi, có giờ:phút)">
                      <DatePicker.RangePicker
                        style={{ width: '100%' }}
                        format="DD/MM/YYYY"
                        placeholder={['Nhập thực tế từ', 'đến']}
                        value={[unassignedCreatedAtFrom, unassignedCreatedAtTo]}
                        onChange={(vals) => {
                          setUnassignedCreatedAtFrom(vals?.[0] ?? null);
                          setUnassignedCreatedAtTo(vals?.[1] ?? null);
                          setUnassignedPage(1);
                        }}
                      />
                    </Tooltip>
                  </Col>
                  <Col>
                    <Tooltip title='Số ghi chú gần nhất hiển thị trong tooltip cột "Ghi chú gần nhất"'>
                      <Select
                        size="middle"
                        value={recentNotesCount}
                        style={{ width: 100 }}
                        onChange={(val: 3 | 5) => setRecentNotesCount(val)}
                        options={[
                          { value: 3, label: '3 gần nhất' },
                          { value: 5, label: '5 gần nhất' },
                        ]}
                      />
                    </Tooltip>
                  </Col>
                  <Col flex="auto" />
                  {/* NÚT CHIA — chỉ hiện khi đã chọn */}
                  {selectedIds.length > 0 && !isMobile && (
                    <Col>
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        onClick={() => setModalOpen(true)}
                        style={{ background: '#1890ff' }}
                      >
                        Chia {selectedIds.length} khách →
                      </Button>
                    </Col>
                  )}
                  <Col>
                    <Tooltip title="Làm mới">
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => 
                          qc.invalidateQueries({ 
                            queryKey: ['unassigned'] 
                          })
                        }
                      />
                    </Tooltip>
                  </Col>
                </Row>

                {/* SELECTION INFO */}
                {selectedIds.length > 0 && !isMobile && (
                  <div style={{
                    background: '#e6f7ff', border: '1px solid #91d5ff',
                    borderRadius: 6, padding: '8px 16px',
                    marginBottom: 12, display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <Text>
                      Đã chọn <Text strong>{selectedIds.length}</Text> khách hàng
                    </Text>
                    <Button 
                      size="small" 
                      onClick={() => setSelectedIds([])}
                    >
                      Bỏ chọn tất cả
                    </Button>
                  </div>
                )}

                {isMobile ? (
                  <div>
                    {(unassignedData?.customers ?? []).length === 0 ? (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
                        ✅ Không còn khách chưa assign
                      </div>
                    ) : (
                      (unassignedData?.customers ?? []).map((record: Customer) => (
                        <UnassignedMobileCard
                          key={record.id}
                          record={record}
                          user={user}
                          renderAuditTrail={renderAuditTrail}
                          onNameClick={() => router.push(`/customers?id=${record.id}`)}
                          onDelete={handleDeleteCustomer}
                        />
                      ))
                    )}
                    <Pagination
                      current={unassignedPage}
                      pageSize={20}
                      total={unassignedData?.pagination?.total ?? 0}
                      size="small"
                      simple
                      onChange={p => setUnassignedPage(p)}
                      style={{ textAlign: 'center', marginTop: 12 }}
                    />
                  </div>
                ) : (
                  <Table
                    rowSelection={{
                      selectedRowKeys: selectedIds,
                      onChange: keys => setSelectedIds(keys as number[]),
                      preserveSelectedRowKeys: true,
                    }}
                    onRow={(record: Customer) => ({
                      onClick: (e: React.MouseEvent<HTMLElement>) => {
                        const target = e.target as HTMLElement;
                        // Bỏ qua nếu click TRÚNG checkbox hoặc nút Xoá - để
                        // chính rowSelection/Popconfirm tự xử lý, tránh bị
                        // double-toggle (chọn rồi tự bỏ chọn ngay lập tức).
                        if (target.closest('.ant-checkbox-wrapper') || target.closest('button')) return;
                        setSelectedIds(prev =>
                          prev.includes(record.id)
                            ? prev.filter(id => id !== record.id)
                            : [...prev, record.id]
                        );
                      },
                      style: { cursor: 'pointer' },
                    })}
                    columns={unassignedColumns}
                    dataSource={unassignedData?.customers ?? []}
                    rowKey="id"
                    loading={loadingUnassigned}
                    size="small"
                      scroll={{ x: 'max-content' }}
                    pagination={{
                      current: unassignedPage,
                      pageSize: 20,
                      total: unassignedData?.pagination?.total ?? 0,
                      onChange: p => setUnassignedPage(p),
                      showTotal: t => `Tổng ${t.toLocaleString()} khách chưa assign`,
                      showSizeChanger: false,
                    }}
                    locale={{ emptyText: '✅ Không còn khách chưa assign' }}
                  />
                )}
              </>
            ),
          },
          {
            key: 'assigned',
            label: (
              <Badge
                count={assignedData?.pagination?.total ?? 0}
                overflowCount={9999}
                color="#52c41a"
              >
                <span style={{ paddingRight: 8 }}>✅ Đã assign</span>
              </Badge>
            ),
            children: (
              <>
                {/* FILTER */}
                <Row gutter={12} style={{ marginBottom: 16 }}>
                  <Col flex="280px">
                    <Input
                      prefix={<SearchOutlined />}
                      placeholder="Tên, SĐT khách..."
                      allowClear
                      value={assignedSearch}
                      onChange={e => {
                        setAssignedSearch(e.target.value);
                        setAssignedPage(1);
                      }}
                    />
                  </Col>
                  {viewScopeUsers.length > 0 && (
                    <Col flex="220px">
                      <Tooltip title="Lọc theo người phụ trách chính (Sales HOẶC Marketing)">
                        <Select
                          allowClear
                          placeholder="Người phụ trách chính"
                          style={{ width: '100%' }}
                          options={viewScopeUserOptions}
                          optionLabelProp="label"
                          optionRender={renderUserOption}
                          popupMatchSelectWidth={false}
                          showSearch={{ optionFilterProp: 'label' }}
                          onChange={v => {
                            setFilterPrimaryUser(v ?? null);
                            setAssignedPage(1);
                          }}
                        />
                      </Tooltip>
                    </Col>
                  )}
                  {viewScopeUsers.length > 0 && (
                    <Col flex="220px">
                      <Tooltip title="Lọc theo Sales được chia (shared, không tính Primary)">
                        <Select
                          allowClear
                          placeholder="Sales được chia"
                          style={{ width: '100%' }}
                          options={viewScopeUserOptions}
                          optionLabelProp="label"
                          optionRender={renderUserOption}
                          popupMatchSelectWidth={false}
                          showSearch={{ optionFilterProp: 'label' }}
                          onChange={v => {
                            setFilterSharedUser(v ?? null);
                            setAssignedPage(1);
                          }}
                        />
                      </Tooltip>
                    </Col>
                  )}
                  <Col flex="160px">
                    <Select
                      allowClear
                      placeholder="Trạng thái"
                      style={{ width: '100%' }}
                      onChange={v => { setFilterAssignedStatus(v ?? null); setAssignedPage(1); }}
                      options={allCustomerStatuses
                        .slice()
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map(s => ({ value: s.code, label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag> }))}
                    />
                  </Col>
                  <Col flex="260px">
                    <Tooltip title="Lọc theo Ngày nhập (inputDate - ngày người nhập tự chọn)">
                      <DatePicker.RangePicker
                        style={{ width: '100%' }}
                        format="DD/MM/YYYY"
                        placeholder={['Ngày nhập từ', 'đến']}
                        value={[assignedDateFrom, assignedDateTo]}
                        onChange={(vals) => {
                          setAssignedDateFrom(vals?.[0] ?? null);
                          setAssignedDateTo(vals?.[1] ?? null);
                          setAssignedPage(1);
                        }}
                      />
                    </Tooltip>
                  </Col>
                  <Col flex="260px">
                    <Tooltip title="Lọc theo Ngày nhập THỰC TẾ (createdAt - lúc tạo bản ghi, có giờ:phút)">
                      <DatePicker.RangePicker
                        style={{ width: '100%' }}
                        format="DD/MM/YYYY"
                        placeholder={['Nhập thực tế từ', 'đến']}
                        value={[assignedCreatedAtFrom, assignedCreatedAtTo]}
                        onChange={(vals) => {
                          setAssignedCreatedAtFrom(vals?.[0] ?? null);
                          setAssignedCreatedAtTo(vals?.[1] ?? null);
                          setAssignedPage(1);
                        }}
                      />
                    </Tooltip>
                  </Col>
                  <Col>
                    <Tooltip title='Số ghi chú gần nhất hiển thị trong tooltip cột "Ghi chú gần nhất"'>
                      <Select
                        size="middle"
                        value={recentNotesCount}
                        style={{ width: 100 }}
                        onChange={(val: 3 | 5) => setRecentNotesCount(val)}
                        options={[
                          { value: 3, label: '3 gần nhất' },
                          { value: 5, label: '5 gần nhất' },
                        ]}
                      />
                    </Tooltip>
                  </Col>
                  <Col>
                    <Tooltip title="Làm mới">
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={() => 
                          qc.invalidateQueries({ 
                            queryKey: ['assigned'] 
                          })
                        }
                      />
                    </Tooltip>
                  </Col>
                </Row>

                {isMobile ? (
                  <div>
                    {(assignedData?.customers ?? []).length === 0 ? (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
                        Chưa có khách nào được assign
                      </div>
                    ) : (
                      (assignedData?.customers ?? []).map((record: Customer) => (
                        <AssignedMobileCard
                          key={record.id}
                          record={record}
                          user={user}
                          renderAuditTrail={renderAuditTrail}
                          onNameClick={() => setDetailCustomerId(record.id)}
                          onDelete={handleDeleteCustomer}
                        />
                      ))
                    )}
                    <Pagination
                      current={assignedPage}
                      pageSize={20}
                      total={assignedData?.pagination?.total ?? 0}
                      size="small"
                      simple
                      onChange={p => setAssignedPage(p)}
                      style={{ textAlign: 'center', marginTop: 12 }}
                    />
                  </div>
                ) : (
                  <Table
                    onRow={(record: Customer) => ({
                      onClick: (e: React.MouseEvent<HTMLElement>) => {
                        const target = e.target as HTMLElement;
                        // Bỏ qua nếu click TRÚNG nút Xoá - không mở nhầm
                        // drawer khi người dùng chỉ muốn xoá.
                        if (target.closest('button')) return;
                        setDetailCustomerId(record.id);
                      },
                      style: { cursor: 'pointer' },
                    })}
                    columns={assignedColumns}
                    dataSource={assignedData?.customers ?? []}
                    rowKey="id"
                    loading={loadingAssigned}
                    size="small"
                      scroll={{ x: 'max-content' }}
                    pagination={{
                      current: assignedPage,
                      pageSize: 20,
                      total: assignedData?.pagination?.total ?? 0,
                      onChange: p => setAssignedPage(p),
                      showTotal: t => `Tổng ${t.toLocaleString()} khách đã assign`,
                      showSizeChanger: false,
                    }}
                    locale={{ emptyText: 'Chưa có khách nào được assign' }}
                  />
                )}
              </>
            ),
          },
        ]}
      />

      {/* ── MODAL ASSIGN ─────────────────────────────── */}
      <Modal
        open={modalOpen}
        title={
          <Space>
            <UserAddOutlined style={{ color: '#1890ff' }} />
            <span>
              Chia <Text strong style={{ color: '#1890ff' }}>
                {selectedIds.length}
              </Text> khách hàng
            </span>
          </Space>
        }
        onCancel={() => {
          setModalOpen(false);
          setTargetSalesIds([]);
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setModalOpen(false);
              setTargetSalesIds([]);
            }}
          >
            Hủy
          </Button>,
          <Button
            key="confirm"
            type="primary"
            icon={<UserAddOutlined />}
            loading={assigning}
            disabled={targetSalesIds.length === 0}
            onClick={() => doAssign()}
          >
            Xác nhận chia cho {targetSalesIds.length} Sales
          </Button>,
        ]}
        width={560}
        destroyOnHidden
      >
        <div style={{ padding: '8px 0' }}>
          {/* Summary */}
          <div style={{
            background: '#f6ffed', border: '1px solid #b7eb8f',
            borderRadius: 6, padding: '10px 16px', marginBottom: 20
          }}>
            <Text>
              Sẽ chia <Text strong>{selectedIds.length}</Text> khách 
              cho <Text strong>{targetSalesIds.length || '?'}</Text> Sales
              {targetSalesIds.length > 1 && (
                <Text type="secondary">
                  {' '}(mỗi Sales nhận cả {selectedIds.length} khách)
                </Text>
              )}
            </Text>
          </div>

          {/* Select Sales */}
          <div style={{ marginBottom: 8 }}>
            <Text strong>Chọn Sales nhận data:</Text>
          </div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Tìm tên hoặc email sales..."
            value={targetSalesIds}
            onChange={setTargetSalesIds}
            options={userOptions}
            notFoundContent={
              salesRuleUsers.length === 0
                ? 'Chưa cấu hình "Sales phụ trách" (Assignment Group key=sales) ở trang Quản lý phụ trách'
                : 'Không tìm thấy nhân viên'
            }
            showSearch={{
              filterOption: (input, option) => {
                const u = candidateUsers.find(
                  (u: User) => u.id === option?.value
                );
                const q = input.toLowerCase();
                return (
                  u?.name?.toLowerCase().includes(q) ||
                  u?.email?.toLowerCase().includes(q)
                ) ?? false;
              },
            }}
            optionLabelProp="label"
            maxTagCount="responsive"
          />

          {/* Preview Sales được chọn */}
          {targetSalesIds.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sales sẽ nhận data:
              </Text>
              <div style={{ marginTop: 8, display: 'flex', 
                flexWrap: 'wrap', gap: 8 }}>
                {targetSalesIds.map(id => {
                  const u = candidateUsers.find(
                    (u: User) => u.id === id
                  );
                  return u ? (
                    <Tag 
                      key={id}
                      color="blue"
                      closable
                      onClose={() => setTargetSalesIds(
                        prev => prev.filter(x => x !== id)
                      )}
                    >
                      {u.name || u.email}
                    </Tag>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ── DRAWER CHI TIẾT / QUẢN LÝ GÁN DATA ────────────────
          Dùng chung CustomerDetailDrawer (đã có tab "Gán data" với đủ
          Sửa/Thu hồi/Gán thêm) - mở NGAY tại trang này, không rời trang. */}
      <CustomerDetailDrawer
        open={detailCustomerId !== null}
        customerId={detailCustomerId}
        onClose={() => setDetailCustomerId(null)}
        onUpdate={() => {
          // Sửa/Thu hồi/Gán thêm có thể làm khách hàng chuyển giữa 2 tab
          // (vd thu hồi hết -> rơi về "Có thể chia") nên refetch cả 2.
          qc.invalidateQueries({ queryKey: ['unassigned'] });
          qc.invalidateQueries({ queryKey: ['assigned'] });
        }}
      />
    </div>
  );
}