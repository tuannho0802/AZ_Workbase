'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card, Button, Space, Tag, Badge, Tabs, Modal, Input, App, Typography, Divider, Tooltip,
  Row, Col, Select, DatePicker, Form
} from 'antd';
import {
  CheckOutlined, CloseOutlined, HistoryOutlined, HourglassOutlined,
  UserOutlined, CalendarOutlined, ClockCircleOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, UndoOutlined, DeleteRowOutlined
} from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest, LeaveRequestsQuery } from '@/lib/api/leave-requests.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useLeaveTypes } from '@/lib/hooks/useLeaveTypes';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { AttachmentsViewerButton } from '@/components/leave-requests/AttachmentsViewerButton';
import { WeeklyLazySection, WeekBucketDto } from '@/components/common/WeeklyLazySection';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import dayjs, { Dayjs } from 'dayjs';

const { TextArea } = Input;
const { Text } = Typography;

// ── helpers ─────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { text: string; color: string }> = {
  approved:  { text: 'Đã duyệt', color: 'success' },
  rejected:  { text: 'Từ chối',  color: 'error' },
  cancelled: { text: 'Đã hủy',  color: 'default' },
  pending:   { text: 'Chờ duyệt', color: 'processing' },
};

/**
 * REASON_ELLIPSIS_STYLE - FIX BUG THẬT (2026-09-16, báo trực tiếp qua ảnh
 * chụp "vị trí tooltip đang sai"): cột "Lý do"/"Lý do từ chối" trước đây chỉ
 * `<span>{reason}</span>` TRẦN, không tự giới hạn bề rộng - phần cắt/ẩn text
 * tràn HOÀN TOÀN dựa vào CSS `ellipsis: true` ở cấp CỘT (Table tự bọc 1 div
 * overflow:hidden quanh Ô, không phải quanh `<span>`). Vì `<span>` không có
 * `maxWidth`, `getBoundingClientRect()` của nó (dùng để antd `Tooltip` định
 * vị popup) trả về bề rộng THẬT của toàn bộ text CHƯA cắt (kéo dài tràn khỏi
 * Ô, chỉ đang bị Ô cha ẩn đi chứ không đổi kích thước layout của span) - kết
 * quả Tooltip bật lên lệch hẳn sang phải, xa hẳn vị trí chữ "..." nhìn thấy
 * (đúng hiện tượng trong ảnh chụp: Tooltip đè lên tận cột Đính kèm/Duyệt).
 * Style này ép chính `<span>` (đối tượng trigger Tooltip) tự cắt bằng
 * `overflow:hidden`/`textOverflow:ellipsis`/`maxWidth:100%` - mirror ĐÚNG
 * cách các nơi khác trong app làm (`ellipsisTextStyle` ở
 * `customer-option-render.tsx`, `TaskMiniCard.tsx`) - lúc này bounding rect
 * của span khớp ĐÚNG phần chữ nhìn thấy, Tooltip định vị đúng chỗ.
 */
const REASON_ELLIPSIS_STYLE: React.CSSProperties = {
  display: 'inline-block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
};

// Period Hours (Optional) - khung giờ Từ - Đến cụ thể trong ngày (vd
// '14:00:00' - '17:00:00'), TÁCH BIỆT với startDate/endDate/totalDays. BE
// trả về format HH:mm:ss (cột MySQL TIME) - chỉ cần cắt 5 ký tự đầu để hiện
// HH:mm, KHÔNG dùng dayjs parse (đây là giờ-trong-ngày thuần, không phải
// timestamp đầy đủ). Trả về null khi không dùng Period Hours (1 trong 2 cột
// rỗng cũng coi như không có - BE luôn đảm bảo cặp đủ cả 2 hoặc null cả 2).
function formatPeriodHours(record: LeaveRequest): string | null {
  if (!record.periodStartTime || !record.periodEndTime) return null;
  return `${record.periodStartTime.slice(0, 5)} - ${record.periodEndTime.slice(0, 5)}`;
}

// ── mobile card – pending ────────────────────────────────────────────────────
function PendingMobileCard({
  record,
  onApprove,
  onReject,
  onEdit,
  canEdit,
  leaveTypeMap,
}: {
  record: LeaveRequest;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
    onEdit: (record: LeaveRequest) => void;
    canEdit: boolean;
    leaveTypeMap: Record<string, { text: string; color: string }>;
}) {
  const lt = leaveTypeMap[record.leaveType] ?? { text: record.leaveType, color: 'default' };
  return (
    <Card
      variant="outlined"
      style={{ marginBottom: 10 }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{record.requester.name}</div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>{record.requester.email}</div>
        </div>
        <Tag color={lt.color} style={{ marginTop: 2 }}>{lt.text}</Tag>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      {/* Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <CalendarOutlined style={{ color: '#1890ff', fontSize: 12 }} />
          <Text style={{ fontSize: 12 }}>
            {dayjs(record.startDate).format('DD/MM/YYYY')} → {dayjs(record.endDate).format('DD/MM/YYYY')}
            <Text strong style={{ color: '#1890ff', marginLeft: 6 }}>{record.totalDays} ngày</Text>
          </Text>
        </div>
        {formatPeriodHours(record) && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <ClockCircleOutlined style={{ color: '#722ed1', fontSize: 12 }} />
            <Text style={{ fontSize: 12, color: '#722ed1' }}>{formatPeriodHours(record)}</Text>
          </div>
        )}
        {record.requester.department && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <UserOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
            <Text style={{ fontSize: 12, color: '#595959' }}>{record.requester.department.name}</Text>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ClockCircleOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
          <Text style={{ fontSize: 12, color: '#8c8c8c' }}>Gửi {dayjs(record.createdAt).format('DD/MM/YYYY HH:mm')}</Text>
        </div>
        {record.reason && (
          <Text style={{ fontSize: 12, color: '#595959', fontStyle: 'italic' }}>
            Lý do: {record.reason}
          </Text>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <AttachmentsViewerButton requestId={record.id} size="small" count={record.attachmentCount} />
        <Button
          type="primary"
          size="small"
          icon={<CheckOutlined />}
          style={{ flex: 1 }}
          onClick={() => onApprove(record.id)}
        >
          Duyệt
        </Button>
        <Button
          danger
          size="small"
          icon={<CloseOutlined />}
          style={{ flex: 1 }}
          onClick={() => onReject(record.id)}
        >
          Từ chối
        </Button>
        {canEdit && (
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          >
            Sửa
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── mobile card – history ────────────────────────────────────────────────────
function HistoryMobileCard({
  record,
  onEdit,
  canEdit,
  leaveTypeMap,
}: {
  record: LeaveRequest;
    onEdit: (record: LeaveRequest) => void;
    canEdit: boolean;
  leaveTypeMap: Record<string, { text: string; color: string }>;
}) {
  const lt = leaveTypeMap[record.leaveType] ?? { text: record.leaveType, color: 'default' };
  const st = STATUS_MAP[record.status] ?? { text: record.status, color: 'default' };
  const processedDate = record.approvedAt || record.rejectedAt;
  return (
    <Card
      variant="outlined"
      style={{ marginBottom: 10 }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{record.requester.name}</div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>{record.requester.email}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Tag color={lt.color}>{lt.text}</Tag>
          <Tag color={st.color}>{st.text}</Tag>
        </div>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <CalendarOutlined style={{ color: '#1890ff', fontSize: 12 }} />
          <Text style={{ fontSize: 12 }}>
            {dayjs(record.startDate).format('DD/MM/YYYY')} → {dayjs(record.endDate).format('DD/MM/YYYY')}
            <Text strong style={{ color: '#1890ff', marginLeft: 6 }}>{record.totalDays} ngày</Text>
          </Text>
        </div>
        {formatPeriodHours(record) && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <ClockCircleOutlined style={{ color: '#722ed1', fontSize: 12 }} />
            <Text style={{ fontSize: 12, color: '#722ed1' }}>{formatPeriodHours(record)}</Text>
          </div>
        )}
        {record.reason && (
          <Text style={{ fontSize: 12, color: '#595959', fontStyle: 'italic' }}>
            Lý do: {record.reason}
          </Text>
        )}
        {record.approver && (
          <Text style={{ fontSize: 12 }}>
            Người duyệt: <Text strong>{record.approver.name}</Text>
          </Text>
        )}
        {processedDate && (
          <Text style={{ fontSize: 12, color: '#8c8c8c' }}>
            Ngày xử lý: {dayjs(processedDate).format('DD/MM/YYYY HH:mm')}
          </Text>
        )}
        {record.rejectionReason && (
          <Text style={{ fontSize: 12, color: '#f5222d', fontStyle: 'italic' }}>
            Lý do từ chối: {record.rejectionReason}
          </Text>
        )}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <AttachmentsViewerButton requestId={record.id} size="small" count={record.attachmentCount} />
        {canEdit && (record.status === 'pending' || record.status === 'approved') && (
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)}>
            Sửa
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── mobile card – trash ──────────────────────────────────────────────────────
function TrashMobileCard({
  record,
  onRestore,
  onHardDelete,
  canHardDelete,
  leaveTypeMap,
}: {
  record: LeaveRequest;
  onRestore: (record: LeaveRequest) => void;
  onHardDelete: (record: LeaveRequest) => void;
  canHardDelete: boolean;
  leaveTypeMap: Record<string, { text: string; color: string }>;
}) {
  const lt = leaveTypeMap[record.leaveType] ?? { text: record.leaveType, color: 'default' };
  const st = STATUS_MAP[record.status] ?? { text: record.status, color: 'default' };
  return (
    <Card
      variant="outlined"
      style={{ marginBottom: 10 }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{record.requester.name}</div>
          <div style={{ fontSize: 11, color: '#8c8c8c' }}>{record.requester.email}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Tag color={lt.color}>{lt.text}</Tag>
          <Tag color={st.color}>{st.text}</Tag>
        </div>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        <Text style={{ fontSize: 12 }}>
          {dayjs(record.startDate).format('DD/MM/YYYY')} → {dayjs(record.endDate).format('DD/MM/YYYY')}
          <Text strong style={{ color: '#1890ff', marginLeft: 6 }}>{record.totalDays} ngày</Text>
        </Text>
        <Text style={{ fontSize: 12, color: '#8c8c8c' }}>
          Người xoá: <Text strong>{record.deletedBy?.name || '-'}</Text>
        </Text>
        {record.deletedAt && (
          <Text style={{ fontSize: 12, color: '#8c8c8c' }}>
            Ngày xoá: {dayjs(record.deletedAt).format('DD/MM/YYYY HH:mm')}
          </Text>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button
          size="small"
          icon={<UndoOutlined />}
          style={{ flex: 1 }}
          onClick={() => onRestore(record)}
        >
          Khôi phục
        </Button>
        {canHardDelete && (
          <Button
            danger
            size="small"
            icon={<DeleteRowOutlined />}
            style={{ flex: 1 }}
            onClick={() => onHardDelete(record)}
          >
            Xoá vĩnh viễn
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
// Trạng thái nội bộ dùng chung cho CẢ 3 tab (Chờ duyệt/Lịch sử/Thùng rác) -
// mỗi tab là 1 "phân trang theo tuần" ĐỘC LẬP (weeks/weekFilters/fetchToken
// riêng), mirror ĐÚNG cách `audit-logs/page.tsx` tách 2 tab (chính/Đăng
// nhập). Gom vào 1 type để 3 khối state/fetch dưới đây không lặp lại tên.
interface WeekTabState {
  weeks: WeekBucketDto[];
  weekFilters: LeaveRequestsQuery;
  fetchToken: number;
  page: number;
  weeksPerPage: number;
  totalWeeks: number;
  total: number;
  loading: boolean;
}
const INITIAL_TAB_STATE: WeekTabState = {
  weeks: [], weekFilters: {}, fetchToken: 0, page: 1, weeksPerPage: 4, totalWeeks: 0, total: 0, loading: false,
};

export default function ApprovalPage() {
  const [pendingState, setPendingState] = useState<WeekTabState>(INITIAL_TAB_STATE);
  const [historyState, setHistoryState] = useState<WeekTabState>(INITIAL_TAB_STATE);
  const [trashState, setTrashState] = useState<WeekTabState>(INITIAL_TAB_STATE);
  const [trashTabLoaded, setTrashTabLoaded] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Sửa đơn (User báo lỡ set sai ngày) - chỉ áp dụng cho đơn PENDING/APPROVED
  // (khớp rule BE ở LeaveRequestsService.update()), gate riêng bằng quyền
  // `leave_requests.edit` (tách khỏi `leave_requests.approve`/`view`).
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<LeaveRequest | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm();

  // Filter: giờ lọc SERVER-SIDE (gửi kèm mỗi lần fetch page/tuần) thay vì
  // tải hết rồi lọc client - dữ liệu nhiều người/phòng ban nên field cần
  // nhiều hơn nghi-phep (của riêng mình): search theo tên/email người gửi +
  // lý do, phòng ban, loại phép; tab Lịch sử/Thùng rác có thêm Trạng thái +
  // khoảng ngày.
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingDept, setPendingDept] = useState<string | null>(null);
  const [pendingLeaveType, setPendingLeaveType] = useState<string | null>(null);

  const [historySearch, setHistorySearch] = useState('');
  const [historyDept, setHistoryDept] = useState<string | null>(null);
  const [historyLeaveType, setHistoryLeaveType] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [historyDateRange, setHistoryDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const [trashSearch, setTrashSearch] = useState('');
  const [trashDept, setTrashDept] = useState<string | null>(null);

  // Antd Hooks to fix "Static function" warning
  const { message: messageApi, modal } = App.useApp();
  const router = useRouter();
  const { can, isLoading: permissionsLoading } = useMyPermissions();

  // Loại phép lấy động từ BE (bảng leave_types, CRUD ở /quan-ly-loai-phep)
  // thay vì enum cứng - mirror đúng nghi-phep/page.tsx.
  const { leaveTypes } = useLeaveTypes();
  const leaveTypeMap = useMemo<Record<string, { text: string; color: string }>>(
    () => Object.fromEntries(leaveTypes.map((t) => [t.code, { text: t.name, color: t.color }])),
    [leaveTypes],
  );

  // ⚠️ ĐỔI: dropdown Phòng ban giờ lấy từ `useDepartments()` (nguồn thật,
  // danh sách ĐẦY ĐỦ mọi phòng ban) thay vì suy từ data đã tải - vì giờ mỗi
  // panel tuần chỉ tải ĐÚNG bản ghi của tuần đó (lazy), không còn "toàn bộ
  // danh sách đơn hiện có" trong RAM để suy ra nữa.
  const { departments } = useDepartments();
  const departmentOptions = useMemo(
    () =>
      departments.map((d) => ({
        value: String(d.id),
        label: <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>{d.name}</Tag>,
      })),
    [departments],
  );

  // Phân biệt quyền:
  // view = xem lịch sử duyệt (của người khác)
  // approve = xem danh sách chờ + có nút duyệt/từ chối
  const canView = can('leave_requests.view');
  const canApprove = can('leave_requests.approve');
  // edit = "sửa hộ" ngày/loại phép/lý do của 1 đơn PENDING/APPROVED (khác
  // hẳn approve/reject) - xem migration SeedLeaveRequestsEditPermission.
  const canEdit = can('leave_requests.edit');
  // Xoá mềm (Thùng rác) + xem/khôi phục - permission `leave_requests.delete`
  // (mặc định chỉ Admin, Admin tự mở rộng qua trang Phân quyền). Xoá VĨNH
  // VIỄN tách riêng permission `leave_requests.hard_delete`.
  const canDelete = can('leave_requests.delete');
  const canHardDelete = can('leave_requests.hard_delete');
  // Loại phép cho dropdown ở Modal sửa - mirror leaveTypeOptions ở nghi-phep/page.tsx
  const editLeaveTypeOptions = useMemo(
    () =>
      leaveTypes.map((t) => ({
        value: t.code,
        label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag>,
      })),
    [leaveTypes],
  );

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // PHA 1 dùng chung cho cả 3 tab - nhận endpoint (`getPending`/`getHistory`/
  // `getTrash`), state setter riêng của tab đó và bộ filter hiện tại, trả về
  // đúng shape `WeekTabState` mới. Tách hàm chung để không lặp lại 3 lần
  // cùng 1 khối try/catch/setState.
  const fetchTab = useCallback(
    async (
      endpoint: (params?: LeaveRequestsQuery) => Promise<ReturnType<typeof leaveRequestsApi.getAll> extends Promise<infer R> ? R : never>,
      setState: React.Dispatch<React.SetStateAction<WeekTabState>>,
      filters: LeaveRequestsQuery,
      errorMessage: string,
    ) => {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await endpoint(filters);
        setState((s) => ({
          ...s,
          weeks: res.weeks ?? [],
          weekFilters: filters,
          fetchToken: s.fetchToken + 1,
          total: res.total || 0,
          totalWeeks: res.totalWeeks || 0,
          page: filters.page ?? s.page,
          weeksPerPage: filters.weeksPerPage ?? s.weeksPerPage,
          loading: false,
        }));
      } catch (err: any) {
        if (err.response?.status !== 403) {
          messageApi.error(errorMessage);
        }
        setState((s) => ({ ...s, weeks: [], loading: false }));
      }
    },
    [messageApi],
  );

  const fetchPending = useCallback(
    (pg = pendingState.page, wpp = pendingState.weeksPerPage) =>
      fetchTab(leaveRequestsApi.getPending, setPendingState, {
        page: pg,
        weeksPerPage: wpp,
        search: pendingSearch.trim() || undefined,
        departmentId: pendingDept ? Number(pendingDept) : undefined,
        leaveType: pendingLeaveType || undefined,
      }, 'Không thể tải danh sách chờ duyệt'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchTab, pendingSearch, pendingDept, pendingLeaveType],
  );

  const fetchHistory = useCallback(
    (pg = historyState.page, wpp = historyState.weeksPerPage) =>
      fetchTab(leaveRequestsApi.getHistory, setHistoryState, {
        page: pg,
        weeksPerPage: wpp,
        search: historySearch.trim() || undefined,
        departmentId: historyDept ? Number(historyDept) : undefined,
        leaveType: historyLeaveType || undefined,
        status: historyStatus || undefined,
        dateFrom: historyDateRange?.[0] ? historyDateRange[0].format('YYYY-MM-DD') : undefined,
        dateTo: historyDateRange?.[1] ? historyDateRange[1].format('YYYY-MM-DD') : undefined,
      }, 'Không thể tải lịch sử phê duyệt'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchTab, historySearch, historyDept, historyLeaveType, historyStatus, historyDateRange],
  );

  const fetchTrash = useCallback(
    (pg = trashState.page, wpp = trashState.weeksPerPage) =>
      fetchTab(leaveRequestsApi.getTrash, setTrashState, {
        page: pg,
        weeksPerPage: wpp,
        search: trashSearch.trim() || undefined,
        departmentId: trashDept ? Number(trashDept) : undefined,
      }, 'Không thể tải thùng rác'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchTab, trashSearch, trashDept],
  );

  // PHA 2 dùng chung - lấy đúng bản ghi của 1 tuần khi panel được mở, dùng
  // lại filter PHA 1 gần nhất CỦA ĐÚNG TAB đó (không phải state filter hiện
  // tại - tránh lệch nếu người dùng đổi filter ngay khi 1 panel đang tải).
  const fetchWeekPending = useCallback(
    async (weekStart: string, weekPage: number, weekLimit: number) => {
      const r = await leaveRequestsApi.getPending({ ...pendingState.weekFilters, weekStart, weekPage, weekLimit });
      return { data: r.data ?? [], weekTotal: r.weekTotal };
    },
    [pendingState.weekFilters],
  );
  const fetchWeekHistory = useCallback(
    async (weekStart: string, weekPage: number, weekLimit: number) => {
      const r = await leaveRequestsApi.getHistory({ ...historyState.weekFilters, weekStart, weekPage, weekLimit });
      return { data: r.data ?? [], weekTotal: r.weekTotal };
    },
    [historyState.weekFilters],
  );
  const fetchWeekTrash = useCallback(
    async (weekStart: string, weekPage: number, weekLimit: number) => {
      const r = await leaveRequestsApi.getTrash({ ...trashState.weekFilters, weekStart, weekPage, weekLimit });
      return { data: r.data ?? [], weekTotal: r.weekTotal };
    },
    [trashState.weekFilters],
  );

  useEffect(() => {
    if (permissionsLoading) return;
    // Cần ít nhất 1 trong 2 quyền mới vào được trang này
    if (!canView && !canApprove) {
      messageApi.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
      return;
    }
    if (canApprove) fetchPending(1, pendingState.weeksPerPage);
    if (canView) fetchHistory(1, historyState.weeksPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, canApprove, permissionsLoading]);

  // Debounce 300ms cho ô tìm kiếm (setTimeout thuần, repo chưa cài `lodash`)
  // - Select/RangePicker fetch ngay lúc đổi, không cần debounce.
  const pendingSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canApprove) return;
    if (pendingSearchRef.current) clearTimeout(pendingSearchRef.current);
    pendingSearchRef.current = setTimeout(() => fetchPending(1, pendingState.weeksPerPage), 300);
    return () => { if (pendingSearchRef.current) clearTimeout(pendingSearchRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSearch]);
  useEffect(() => {
    if (!canApprove) return;
    fetchPending(1, pendingState.weeksPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDept, pendingLeaveType]);

  const historySearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canView) return;
    if (historySearchRef.current) clearTimeout(historySearchRef.current);
    historySearchRef.current = setTimeout(() => fetchHistory(1, historyState.weeksPerPage), 300);
    return () => { if (historySearchRef.current) clearTimeout(historySearchRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historySearch]);
  useEffect(() => {
    if (!canView) return;
    fetchHistory(1, historyState.weeksPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyDept, historyLeaveType, historyStatus, historyDateRange]);

  // Tab "Thùng rác" chỉ fetch LẦN ĐẦU khi người dùng thực sự mở tab đó
  // (lazy) - mirror `loginTabLoaded` ở audit-logs/page.tsx.
  const trashSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!trashTabLoaded || !canDelete) return;
    if (trashSearchRef.current) clearTimeout(trashSearchRef.current);
    trashSearchRef.current = setTimeout(() => fetchTrash(1, trashState.weeksPerPage), 300);
    return () => { if (trashSearchRef.current) clearTimeout(trashSearchRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashTabLoaded, trashSearch]);
  useEffect(() => {
    if (!trashTabLoaded || !canDelete) return;
    fetchTrash(1, trashState.weeksPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashDept]);

  // Refetch cả pending + history sau hành động duyệt/từ chối/sửa/xoá - gọi ở
  // trang hiện tại của MỖI tab (không reset về trang 1) trừ khi hành động đó
  // tự đứng ra reset (softDelete/restore/hardDelete reset về trang 1 vì bản
  // ghi vừa biến mất khỏi danh sách, giữ nguyên trang dễ lệch/trống).
  const refetchAfterAction = () => {
    if (canApprove) fetchPending(pendingState.page, pendingState.weeksPerPage);
    if (canView) fetchHistory(historyState.page, historyState.weeksPerPage);
  };

  const handleApprove = async (id: number) => {
    modal.confirm({
      title: 'Duyệt đơn nghỉ phép?',
      content: 'Xác nhận duyệt đơn này?',
      okButtonProps: { loading: isProcessing },
      onOk: async () => {
        setIsProcessing(true);
        try {
          await leaveRequestsApi.approve(id);
          messageApi.success('Đã duyệt đơn');
          refetchAfterAction();
        } catch (err: any) {
          if (err.response?.status !== 401) {
            messageApi.error(err.response?.data?.message || 'Duyệt đơn thất bại');
          }
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const openRejectModal = (id: number) => {
    setSelectedRequest(id);
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      messageApi.warning('Vui lòng nhập lý do từ chối');
      return;
    }
    setIsProcessing(true);
    try {
      await leaveRequestsApi.reject(selectedRequest!, rejectionReason);
      messageApi.success('Đã từ chối đơn');
      setRejectModalOpen(false);
      setRejectionReason('');
      setSelectedRequest(null);
      refetchAfterAction();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        messageApi.error('Từ chối đơn thất bại');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // ⚠️ FIX BUG THẬT (console warning "Instance created by useForm is not
  // connected to any Form element") - mirror ĐÚNG root cause + fix đã ghi ở
  // `CustomerAssignmentsTab.tsx` (openEdit/useEffect): Modal "Sửa đơn nghỉ
  // phép" dùng destroyOnHidden nên <Form form={editForm}> chỉ thực sự mount
  // SAU KHI editModalOpen=true re-render xong. Trước đây openEditModal() gọi
  // editForm.setFieldsValue() NGAY trong cùng lần gọi hàm với setEditModalOpen
  // (state update bất đồng bộ) - lúc setFieldsValue chạy, Modal vẫn đang
  // open=false, <Form> chưa tồn tại trong cây DOM -> "chưa kết nối" -> warning.
  // Dời sang useEffect để chỉ set giá trị SAU KHI React đã re-render và
  // Modal/Form đã mount xong.
  useEffect(() => {
    if (editModalOpen && editingRequest) {
      editForm.setFieldsValue({
        leaveType: editingRequest.leaveType,
        dateRange: [dayjs(editingRequest.startDate), dayjs(editingRequest.endDate)],
        duration: editingRequest.duration,
        reason: editingRequest.reason,
      });
    }
  }, [editModalOpen, editingRequest, editForm]);

  const openEditModal = (record: LeaveRequest) => {
    setEditingRequest(record);
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingRequest(null);
    editForm.resetFields();
  };

  const handleEditSubmit = async (values: any) => {
    if (!editingRequest) return;
    const [startDate, endDate] = values.dateRange;
    setEditSubmitting(true);
    try {
      await leaveRequestsApi.update(editingRequest.id, {
        leaveType: values.leaveType,
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD'),
        duration: values.duration,
        reason: values.reason,
      });
      messageApi.success('Đã cập nhật đơn nghỉ phép');
      closeEditModal();
      refetchAfterAction();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        messageApi.error(err.response?.data?.message || 'Cập nhật đơn thất bại');
      }
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── Xoá mềm / Khôi phục / Xoá vĩnh viễn (Thùng rác) ─────────────────────
  // `leave_requests.delete` (mặc định chỉ Admin, có thể mở rộng scope qua
  // trang Phân quyền). Xoá mềm áp dụng cho CẢ đơn đang chờ duyệt lẫn đã xử
  // lý (lịch sử) - đơn biến mất khỏi 2 tab đó, xuất hiện ở tab Thùng rác.
  const handleSoftDelete = (record: LeaveRequest) => {
    modal.confirm({
      title: 'Xoá đơn nghỉ phép?',
      content: `Đơn của "${record.requester.name}" sẽ được chuyển vào Thùng rác. Bạn có thể khôi phục lại sau.`,
      okButtonProps: { danger: true },
      okText: 'Xoá',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await leaveRequestsApi.softDelete(record.id);
          messageApi.success('Đã chuyển vào Thùng rác');
          refetchAfterAction();
          if (trashTabLoaded) fetchTrash(1, trashState.weeksPerPage);
        } catch (err: any) {
          if (err.response?.status !== 401) {
            messageApi.error(err.response?.data?.message || 'Xoá đơn thất bại');
          }
        }
      },
    });
  };

  const handleRestore = async (record: LeaveRequest) => {
    try {
      await leaveRequestsApi.restoreFromTrash(record.id);
      messageApi.success('Đã khôi phục đơn nghỉ phép');
      fetchTrash(1, trashState.weeksPerPage);
      refetchAfterAction();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        messageApi.error(err.response?.data?.message || 'Khôi phục thất bại');
      }
    }
  };

  // Xoá VĨNH VIỄN - permission riêng `leave_requests.hard_delete`, không thể
  // hoàn tác (mirror pattern `customers.hard_delete`) - luôn hỏi lại 2 lần
  // (modal.confirm với nội dung nhấn mạnh "không thể khôi phục").
  const handleHardDelete = (record: LeaveRequest) => {
    modal.confirm({
      title: 'Xoá VĨNH VIỄN đơn nghỉ phép?',
      content: `Đơn của "${record.requester.name}" sẽ bị xoá HOÀN TOÀN khỏi hệ thống, KHÔNG THỂ khôi phục. Bạn chắc chắn chứ?`,
      okButtonProps: { danger: true },
      okText: 'Xoá vĩnh viễn',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await leaveRequestsApi.hardDelete(record.id);
          messageApi.success('Đã xoá vĩnh viễn');
          fetchTrash(1, trashState.weeksPerPage);
        } catch (err: any) {
          if (err.response?.status !== 401) {
            messageApi.error(err.response?.data?.message || 'Xoá vĩnh viễn thất bại');
          }
        }
      },
    });
  };

  // ── desktop columns ─────────────────────────────────────────────────────
  const pendingColumns = [
    {
      title: 'Người gửi',
      dataIndex: ['requester', 'name'],
      width: 170,
      render: (name: string, record: LeaveRequest) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{record.requester.email}</div>
        </div>
      )
    },
    {
      title: 'Ngày gửi',
      dataIndex: 'createdAt',
      width: 110,
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Phòng ban',
      width: 120,
      render: (_: any, record: LeaveRequest) =>
        record.requester.department ? (
          <Tag color={resolveEntityColor(record.requester.department.color)}>{record.requester.department.name}</Tag>
        ) : (
          <Tag>Chưa gán</Tag>
        )
    },
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
      width: 100,
      render: (type: string, record: LeaveRequest) => {
        const info = leaveTypeMap[type] ?? { text: type, color: 'default' };
        return (
          <>
            <Tag color={info.color}>{info.text}</Tag>
            {record.isSupplementary && <Tag color="gold">Đơn bổ sung</Tag>}
          </>
        );
      }
    },
    {
      title: 'Thời gian',
      width: 130,
      render: (_: any, record: LeaveRequest) => (
        <div>
          <div>{dayjs(record.startDate).format('DD/MM/YYYY')}</div>
          <div style={{ fontSize: 12, color: '#888' }}>đến {dayjs(record.endDate).format('DD/MM/YYYY')}</div>
          <div style={{ fontSize: 12, color: '#1890ff' }}>{record.totalDays} ngày</div>
        </div>
      )
    },
    {
      title: 'Khung giờ',
      width: 110,
      render: (_: any, record: LeaveRequest) =>
        formatPeriodHours(record) ? (
          <span style={{ color: '#722ed1' }}>{formatPeriodHours(record)}</span>
        ) : '-'
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      width: 160,
      ellipsis: true,
      render: (reason: string) =>
        reason ? (
          <Tooltip title={reason}>
            <span style={REASON_ELLIPSIS_STYLE}>{reason}</span>
          </Tooltip>
        ) : '-'
    },
    {
      title: 'Đính kèm',
      width: 100,
      render: (_: any, record: LeaveRequest) => (
        <AttachmentsViewerButton requestId={record.id} count={record.attachmentCount} />
      )
    },
    {
      title: 'Thao tác',
      width: 220,
      render: (_: any, record: LeaveRequest) => (
        <Space>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record.id)}>
            Duyệt
          </Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => openRejectModal(record.id)}>
            Từ chối
          </Button>
          {canEdit && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              Sửa
            </Button>
          )}
          {canDelete && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleSoftDelete(record)}>
              Xoá
            </Button>
          )}
        </Space>
      )
    }
  ].filter((col: any) => canApprove || col.title !== 'Thao tác');
  // ⚠️ FIX BUG THẬT (2026-09-16, báo trực tiếp qua ảnh chụp): cột "Lý do"
  // ĐÃ có `width`/`ellipsis`/`Tooltip` từ trước nhưng KHÔNG hề bị cắt ngắn
  // trên UI - nguyên nhân là `<Table scroll={{ x: 'max-content' }}>` bên
  // dưới: 'max-content' ép AntD tự đo bề rộng THEO NỘI DUNG THẬT của từng
  // cột (bỏ qua `width` khai báo), dù đã có `tableLayout="fixed"`. Tính
  // tổng `width` các cột đang hiển thị (SAU khi `.filter()` ẩn/hiện "Thao
  // tác" theo quyền) làm `scroll.x` DẠNG SỐ PIXEL cụ thể thay cho
  // 'max-content' - lúc đó `tableLayout="fixed"` mới thực sự ép mỗi cột
  // đúng `width` đã khai, "Lý do" mới bị cắt (ellipsis) và cần hover mới
  // thấy đủ (Tooltip đã có sẵn, không cần sửa thêm).
  const pendingTableWidth = pendingColumns.reduce((sum: number, col: any) => sum + (col.width ?? 0), 0);

  const historyColumns = [
    {
      title: 'Người gửi',
      dataIndex: ['requester', 'name'],
      width: 170,
      render: (name: string, record: LeaveRequest) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{record.requester.email}</div>
        </div>
      )
    },
    {
      title: 'Ngày gửi',
      dataIndex: 'createdAt',
      width: 100,
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Phòng ban',
      width: 120,
      render: (_: any, record: LeaveRequest) =>
        record.requester.department ? (
          <Tag color={resolveEntityColor(record.requester.department.color)}>{record.requester.department.name}</Tag>
        ) : (
          <Tag>Chưa gán</Tag>
        )
    },
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
      width: 100,
      render: (type: string, record: LeaveRequest) => {
        const info = leaveTypeMap[type] ?? { text: type, color: 'default' };
        return (
          <>
            <Tag color={info.color}>{info.text}</Tag>
            {record.isSupplementary && <Tag color="gold">Đơn bổ sung</Tag>}
          </>
        );
      }
    },
    {
      title: 'Thời gian',
      width: 130,
      render: (_: any, record: LeaveRequest) => (
        <div>
          <div>{dayjs(record.startDate).format('DD/MM/YYYY')}</div>
          <div style={{ fontSize: 12, color: '#888' }}>đến {dayjs(record.endDate).format('DD/MM/YYYY')}</div>
          <div style={{ fontSize: 12, color: '#1890ff' }}>{record.totalDays} ngày</div>
        </div>
      )
    },
    {
      title: 'Khung giờ',
      width: 110,
      render: (_: any, record: LeaveRequest) =>
        formatPeriodHours(record) ? (
          <span style={{ color: '#722ed1' }}>{formatPeriodHours(record)}</span>
        ) : '-'
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => {
        const info = STATUS_MAP[status] ?? { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      width: 150,
      ellipsis: true,
      render: (reason: string) =>
        reason ? (
          <Tooltip title={reason}>
            <span style={REASON_ELLIPSIS_STYLE}>{reason}</span>
          </Tooltip>
        ) : '-'
    },
    {
      title: 'Người duyệt',
      dataIndex: ['approver', 'name'],
      width: 110,
      render: (name: string) => <b>{name || '-'}</b>
    },
    {
      title: 'Đính kèm',
      width: 100,
      render: (_: any, record: LeaveRequest) => (
        <AttachmentsViewerButton requestId={record.id} count={record.attachmentCount} />
      )
    },
    {
      title: 'Ngày xử lý',
      width: 130,
      render: (_: any, record: LeaveRequest) => {
        const date = record.approvedAt || record.rejectedAt;
        return date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '-';
      }
    },
    {
      title: 'Lý do từ chối',
      dataIndex: 'rejectionReason',
      width: 150,
      ellipsis: true,
      render: (reason: string) =>
        reason ? (
          <Tooltip title={reason}>
            <span style={{ ...REASON_ELLIPSIS_STYLE, color: '#f5222d', fontStyle: 'italic' }}>{reason}</span>
          </Tooltip>
        ) : '-'
    },
    {
      title: 'Thao tác',
      width: 160,
      render: (_: any, record: LeaveRequest) => (
        <Space>
          {canEdit && (record.status === 'pending' || record.status === 'approved') && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              Sửa
            </Button>
          )}
          {canDelete && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleSoftDelete(record)}>
              Xoá
            </Button>
          )}
        </Space>
      )
    }
  ].filter((col: any) => canEdit || canDelete || col.title !== 'Thao tác');
  // Cùng lý do với `pendingTableWidth` ở trên - `historyColumns` giờ cũng có
  // `.filter()` (ẩn "Thao tác" khi không có quyền `leave_requests.edit`/`leave_requests.delete`).
  const historyTableWidth = historyColumns.reduce((sum: number, col: any) => sum + (col.width ?? 0), 0);

  // Cột riêng cho tab "Thùng rác" - gọn hơn 2 bảng trên (không cần sửa/duyệt),
  // thêm "Người xoá"/"Ngày xoá" (mirror trang khách hàng - trash tab).
  const trashColumns = [
    {
      title: 'Người gửi',
      dataIndex: ['requester', 'name'],
      width: 170,
      render: (name: string, record: LeaveRequest) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{record.requester.email}</div>
        </div>
      )
    },
    {
      title: 'Phòng ban',
      width: 120,
      render: (_: any, record: LeaveRequest) =>
        record.requester.department ? (
          <Tag color={resolveEntityColor(record.requester.department.color)}>{record.requester.department.name}</Tag>
        ) : (
          <Tag>Chưa gán</Tag>
        )
    },
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
      width: 100,
      render: (type: string) => {
        const info = leaveTypeMap[type] ?? { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Thời gian nghỉ',
      width: 150,
      render: (_: any, record: LeaveRequest) => (
        <div>
          <div>{dayjs(record.startDate).format('DD/MM/YYYY')} → {dayjs(record.endDate).format('DD/MM/YYYY')}</div>
          <div style={{ fontSize: 12, color: '#1890ff' }}>{record.totalDays} ngày</div>
        </div>
      )
    },
    {
      title: 'Trạng thái (trước khi xoá)',
      dataIndex: 'status',
      width: 140,
      render: (status: string) => {
        const info = STATUS_MAP[status] ?? { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Người xoá',
      width: 130,
      render: (_: any, record: LeaveRequest) => record.deletedBy?.name || '-'
    },
    {
      title: 'Ngày xoá',
      width: 140,
      render: (_: any, record: LeaveRequest) => record.deletedAt ? dayjs(record.deletedAt).format('DD/MM/YYYY HH:mm') : '-'
    },
    {
      title: 'Thao tác',
      width: 200,
      render: (_: any, record: LeaveRequest) => (
        <Space>
          <Button size="small" icon={<UndoOutlined />} onClick={() => handleRestore(record)}>
            Khôi phục
          </Button>
          {canHardDelete && (
            <Button size="small" danger icon={<DeleteRowOutlined />} onClick={() => handleHardDelete(record)}>
              Xoá vĩnh viễn
            </Button>
          )}
        </Space>
      )
    }
  ];
  const trashTableWidth = trashColumns.reduce((sum: number, col: any) => sum + (col.width ?? 0), 0);

  // ── tab items ─────────────────────────────────────────────────────────────
  const tabItems = [
    canApprove ? {
      key: 'pending',
      label: (
        <span>
          <HourglassOutlined />
          {' '}Chờ phê duyệt{' '}
          {pendingRequests.length > 0 && <Badge count={pendingRequests.length} offset={[10, -5]} size="small" />}
        </span>
      ),
      children: (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Input
                allowClear
                placeholder="Tìm theo tên, email, lý do..."
                prefix={<SearchOutlined />}
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
              />
            </Col>
            <Col xs={12} sm={6} md={5}>
              <Select
                allowClear
                placeholder="Phòng ban"
                style={{ width: '100%' }}
                value={pendingDept}
                onChange={(v) => setPendingDept(v ?? null)}
                options={pendingDeptOptions}
              />
            </Col>
            <Col xs={12} sm={6} md={5}>
              <Select
                allowClear
                placeholder="Loại phép"
                style={{ width: '100%' }}
                value={pendingLeaveType}
                onChange={(v) => setPendingLeaveType(v ?? null)}
                options={leaveTypes.map((t) => ({
                  value: t.code,
                  label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag>,
                }))}
              />
            </Col>
          </Row>
          <WeekGroupedRequests
            records={filteredPending}
            isMobile={isMobile}
            loading={loading}
            columns={pendingColumns as any}
            tableWidth={pendingTableWidth}
            emptyText="✅ Không có đơn chờ duyệt"
            renderMobileCard={(record) => (
              <PendingMobileCard
                key={record.id}
                record={record}
                onApprove={handleApprove}
                onReject={openRejectModal}
                onEdit={openEditModal}
                canEdit={canEdit}
                leaveTypeMap={leaveTypeMap}
              />
            )}
          />
        </>
      )
    } : null,
    canView ? {
      key: 'history',
      label: (
        <span>
          <HistoryOutlined />
          {' '}Lịch sử phê duyệt
        </span>
      ),
      children: (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={7}>
              <Input
                allowClear
                placeholder="Tìm theo tên, email, lý do..."
                prefix={<SearchOutlined />}
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Select
                allowClear
                placeholder="Phòng ban"
                style={{ width: '100%' }}
                value={historyDept}
                onChange={(v) => setHistoryDept(v ?? null)}
                options={historyDeptOptions}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Select
                allowClear
                placeholder="Loại phép"
                style={{ width: '100%' }}
                value={historyLeaveType}
                onChange={(v) => setHistoryLeaveType(v ?? null)}
                options={leaveTypes.map((t) => ({
                  value: t.code,
                  label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag>,
                }))}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Select
                allowClear
                placeholder="Trạng thái"
                style={{ width: '100%' }}
                value={historyStatus}
                onChange={(v) => setHistoryStatus(v ?? null)}
                options={Object.entries(STATUS_MAP)
                  .filter(([code]) => code !== 'pending')
                  .map(([code, s]) => ({
                    value: code,
                    label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.text}</Tag>,
                  }))}
              />
            </Col>
            <Col xs={24} sm={12} md={5}>
              <DatePicker.RangePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                placeholder={['Từ ngày', 'Đến ngày']}
                value={historyDateRange as any}
                onChange={(vals) => setHistoryDateRange(vals as [Dayjs | null, Dayjs | null] | null)}
              />
            </Col>
          </Row>
          <WeekGroupedRequests
            records={filteredHistory}
            isMobile={isMobile}
            loading={loading}
            columns={historyColumns as any}
            tableWidth={historyTableWidth}
            emptyText="Chưa có lịch sử xử lý"
            renderMobileCard={(record) => (
              <HistoryMobileCard
                key={record.id}
                record={record}
                onEdit={openEditModal}
                canEdit={canEdit}
                leaveTypeMap={leaveTypeMap}
              />
            )}
          />
        </>
      )
    } : null,
  ].filter(Boolean) as any[];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">✅ Quản lý Nghỉ phép</h1>
      </div>

      <Tabs
        defaultActiveKey="pending"
        items={tabItems}
        type="card"
        className="bg-white p-4 rounded-lg shadow-sm"
      />

      {/* Reject Modal */}
      <Modal
        title="Từ chối đơn nghỉ phép"
        open={rejectModalOpen}
        confirmLoading={isProcessing}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectionReason('');
          setSelectedRequest(null);
        }}
        onOk={handleReject}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
            Lý do từ chối <span style={{ color: 'red' }}>*</span>
          </label>
          <TextArea
            rows={4}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Nhập lý do từ chối (bắt buộc)..."
          />
        </div>
      </Modal>

      {/* Edit Modal - "sửa hộ" ngày/loại phép/lý do (User báo lỡ set sai
          ngày). Không check overlap (đối xứng bypass ở BE create()). Nếu đơn
          đang APPROVED, BE tự cân bằng lại phép năm (hoàn số ngày cũ, trừ
          lại số ngày mới) - không cần xử lý gì thêm ở FE. */}
      <Modal
        title={`Sửa đơn nghỉ phép${editingRequest ? ` — ${editingRequest.requester.name}` : ''}`}
        open={editModalOpen}
        onCancel={closeEditModal}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleEditSubmit}
        >
          <Form.Item
            name="leaveType"
            label="Loại phép"
            rules={[{ required: true, message: 'Vui lòng chọn loại phép' }]}
          >
            <Select placeholder="Chọn loại phép" options={editLeaveTypeOptions} />
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="Thời gian nghỉ"
            rules={[{ required: true, message: 'Vui lòng chọn thời gian' }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          <Form.Item name="duration" label="Thời lượng" initialValue="full_day">
            <Select
              options={[
                { value: 'full_day', label: 'Cả ngày' },
                { value: 'half_day_am', label: 'Nửa ngày (Sáng)' },
                { value: 'half_day_pm', label: 'Nửa ngày (Chiều)' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="Lý do"
            rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}
          >
            <TextArea rows={4} placeholder="Nhập lý do xin nghỉ phép..." />
          </Form.Item>

          <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
            <Button onClick={closeEditModal} disabled={editSubmitting}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={editSubmitting}>Lưu thay đổi</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}