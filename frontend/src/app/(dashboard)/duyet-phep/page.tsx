'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Card, Button, Space, Tag, Badge, Tabs, Modal, Input, App, Typography, Divider, Tooltip,
  Row, Col, Select, DatePicker, Form, Checkbox
} from 'antd';
import {
  CheckOutlined, CloseOutlined, HistoryOutlined, HourglassOutlined,
  UserOutlined, CalendarOutlined, ClockCircleOutlined, SearchOutlined, EditOutlined,
  DeleteOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest, BulkLeaveResult } from '@/lib/api/leave-requests.api';
import { useIdSelection } from '@/lib/hooks/useIdSelection';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useLeaveTypes } from '@/lib/hooks/useLeaveTypes';
import { AttachmentsViewerButton } from '@/components/leave-requests/AttachmentsViewerButton';
import { WeeklyLazySection } from '@/components/common/WeeklyLazySection';
import { useLeaveWeekList, useInvalidateLeaveLists } from '@/lib/hooks/useLeaveWeekList';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { useDebounce } from '@/lib/hooks/useDebounce';
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

// Đơn trong THÙNG RÁC: nguồn gốc suy từ mốc thời gian đã có (không cần cột mới):
// có approvedAt = đã duyệt rồi bị xoá từ Lịch sử; có rejectedAt = tương tự đơn
// bị từ chối; không có cả 2 = chủ đơn tự huỷ khi còn chờ duyệt.
function trashOrigin(record: LeaveRequest): { text: string; color: string } {
  if (record.approvedAt) return { text: 'Đã duyệt', color: 'success' };
  if (record.rejectedAt) return { text: 'Từ chối', color: 'error' };
  return { text: 'Chờ duyệt (chủ đơn huỷ)', color: 'processing' };
}

// Thanh thao tác hàng loạt - chỉ hiện khi đang chọn >= 1 đơn.
function BulkBar({
  count,
  actionLabel,
  onAction,
  onClear,
  loading,
}: {
  count: number;
  actionLabel: string;
  onAction: () => void;
  onClear: () => void;
  loading: boolean;
}) {
  if (count === 0) return null;
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '8px 12px', marginBottom: 12, background: '#fff1f0',
        border: '1px solid #ffccc7', borderRadius: 6,
      }}
    >
      <Text>Đã chọn <b>{count}</b> đơn</Text>
      <Button danger size="small" icon={<DeleteOutlined />} loading={loading} onClick={onAction}>
        {actionLabel}
      </Button>
      <Button type="link" size="small" disabled={loading} onClick={onClear}>Bỏ chọn</Button>
    </div>
  );
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
  canDelete,
  onTrash,
  selected,
  onToggleSelect,
  leaveTypeMap,
}: {
  record: LeaveRequest;
    onEdit: (record: LeaveRequest) => void;
    canEdit: boolean;
  canDelete: boolean;
  onTrash: (id: number) => void;
  selected: boolean;
  onToggleSelect: (id: number, selected: boolean) => void;
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
        <div style={{ display: 'flex', gap: 8 }}>
          {canDelete && (
            <Checkbox checked={selected} onChange={(e) => onToggleSelect(record.id, e.target.checked)} />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{record.requester.name}</div>
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>{record.requester.email}</div>
          </div>
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
        {canDelete && (
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onTrash(record.id)}>
            Huỷ
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── mobile card – trash ──────────────────────────────────────────────────────
function TrashMobileCard({
  record,
  canDelete,
  onHardDelete,
  selected,
  onToggleSelect,
  leaveTypeMap,
}: {
  record: LeaveRequest;
  canDelete: boolean;
  onHardDelete: (id: number) => void;
  selected: boolean;
  onToggleSelect: (id: number, selected: boolean) => void;
  leaveTypeMap: Record<string, { text: string; color: string }>;
}) {
  const lt = leaveTypeMap[record.leaveType] ?? { text: record.leaveType, color: 'default' };
  const origin = trashOrigin(record);
  return (
    <Card variant="outlined" style={{ marginBottom: 10 }} styles={{ body: { padding: '12px 14px' } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {canDelete && (
            <Checkbox checked={selected} onChange={(e) => onToggleSelect(record.id, e.target.checked)} />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{record.requester.name}</div>
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>{record.requester.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <Tag color={lt.color}>{lt.text}</Tag>
          <Tag color={origin.color}>{origin.text}</Tag>
        </div>
      </div>
      <Divider style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Text style={{ fontSize: 12 }}>
          {dayjs(record.startDate).format('DD/MM/YYYY')} → {dayjs(record.endDate).format('DD/MM/YYYY')}
          <Text strong style={{ color: '#1890ff', marginLeft: 6 }}>{record.totalDays} ngày</Text>
        </Text>
        {record.reason && (
          <Text style={{ fontSize: 12, color: '#595959', fontStyle: 'italic' }}>Lý do: {record.reason}</Text>
        )}
        {record.cancelledAt && (
          <Text style={{ fontSize: 12, color: '#8c8c8c' }}>
            Ngày xoá: {dayjs(record.cancelledAt).format('DD/MM/YYYY HH:mm')}
          </Text>
        )}
      </div>
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <AttachmentsViewerButton requestId={record.id} size="small" count={record.attachmentCount} />
        {canDelete && (
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onHardDelete(record.id)}>
            Xoá vĩnh viễn
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function ApprovalPage() {
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

  // Filter + phân trang: cả 2 tab chạy ở SERVER (BE `GET /leave-requests/
  // pending/paged` & `/history/paged`, week-mode) - client chỉ giữ 1 tuần/lần
  // (lazy-load khi mở panel) nên không còn lọc client-side trên toàn bộ dữ
  // liệu được nữa. Field nhiều hơn nghi-phep vì là dữ liệu nhiều người/phòng
  // ban: search theo tên/email người gửi + lý do, phòng ban, loại phép; tab
  // Lịch sử thêm Trạng thái + khoảng ngày. Mỗi tab có trang TUẦN riêng.
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingDept, setPendingDept] = useState<number | null>(null);
  const [pendingLeaveType, setPendingLeaveType] = useState<string | null>(null);

  const [historySearch, setHistorySearch] = useState('');
  const [historyDept, setHistoryDept] = useState<number | null>(null);
  const [historyLeaveType, setHistoryLeaveType] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [historyDateRange, setHistoryDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingWeeksPerPage, setPendingWeeksPerPage] = useState(4);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyWeeksPerPage, setHistoryWeeksPerPage] = useState(4);

  // Thùng rác (đơn có cancelledAt) - filter/phân trang tuần riêng như 2 tab kia.
  const [trashSearch, setTrashSearch] = useState('');
  const [trashDept, setTrashDept] = useState<number | null>(null);
  const [trashLeaveType, setTrashLeaveType] = useState<string | null>(null);
  const [trashDateRange, setTrashDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [trashPage, setTrashPage] = useState(1);
  const [trashWeeksPerPage, setTrashWeeksPerPage] = useState(4);

  // Chọn nhiều đơn để thao tác hàng loạt (xuyên tuần) - mỗi tab 1 bộ riêng.
  const historySel = useIdSelection();
  const trashSel = useIdSelection();
  const [bulkProcessing, setBulkProcessing] = useState(false);

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

  // Phân biệt quyền:
  // view = xem lịch sử duyệt (của người khác)
  // approve = xem danh sách chờ + có nút duyệt/từ chối
  const canView = can('leave_requests.view');
  const canApprove = can('leave_requests.approve');
  // edit = "sửa hộ" ngày/loại phép/lý do của 1 đơn PENDING/APPROVED (khác
  // hẳn approve/reject) - xem migration SeedLeaveRequestsEditPermission.
  const canEdit = can('leave_requests.edit');
  // delete = (1) Huỷ (xoá mềm) đơn đã duyệt/từ chối ở tab Lịch sử, (2) Xoá vĩnh
  // viễn đơn ở tab Thùng rác, (3) 2 thao tác đó hàng loạt. Có scope ở BE
  // (mặc định chỉ Admin). Đơn PENDING KHÔNG có nút huỷ ở đây - chỉ chủ đơn huỷ
  // được, ở trang /nghi-phep. Xem Thùng rác dùng chung quyền `view`.
  const canDelete = can('leave_requests.delete');
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

  useEffect(() => {
    if (permissionsLoading) return;
    // Cần ít nhất 1 trong 2 quyền mới vào được trang này
    if (!canView && !canApprove) {
      messageApi.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
      return;
    }
  }, [canView, canApprove, permissionsLoading]);

  // ── Danh sách week-mode 2 pha (xem `useLeaveWeekList`) ────────────────────
  // Mỗi tab tự fetch độc lập (403 ở 1 tab không kill tab kia - tương đương
  // Promise.allSettled cũ) và chỉ chạy khi có quyền tương ứng.
  const invalidateLeaveLists = useInvalidateLeaveLists();
  const debouncedPendingSearch = useDebounce(pendingSearch, 400);
  const debouncedHistorySearch = useDebounce(historySearch, 400);
  const pendingFilters = useMemo(
    () => ({
      search: debouncedPendingSearch.trim() || undefined,
      departmentId: pendingDept ?? undefined,
      leaveType: pendingLeaveType ?? undefined,
    }),
    [debouncedPendingSearch, pendingDept, pendingLeaveType],
  );
  const historyFilters = useMemo(
    () => ({
      search: debouncedHistorySearch.trim() || undefined,
      departmentId: historyDept ?? undefined,
      leaveType: historyLeaveType ?? undefined,
      status: historyStatus ?? undefined,
      fromDate: historyDateRange?.[0]?.format('YYYY-MM-DD'),
      toDate: historyDateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [debouncedHistorySearch, historyDept, historyLeaveType, historyStatus, historyDateRange],
  );
  const debouncedTrashSearch = useDebounce(trashSearch, 400);
  const trashFilters = useMemo(
    () => ({
      search: debouncedTrashSearch.trim() || undefined,
      departmentId: trashDept ?? undefined,
      leaveType: trashLeaveType ?? undefined,
      fromDate: trashDateRange?.[0]?.format('YYYY-MM-DD'),
      toDate: trashDateRange?.[1]?.format('YYYY-MM-DD'),
    }),
    [debouncedTrashSearch, trashDept, trashLeaveType, trashDateRange],
  );
  const pendingList = useLeaveWeekList('pending', pendingFilters, pendingPage, pendingWeeksPerPage, !permissionsLoading && canApprove);
  const historyList = useLeaveWeekList('history', historyFilters, historyPage, historyWeeksPerPage, !permissionsLoading && canView);
  const trashList = useLeaveWeekList('trash', trashFilters, trashPage, trashWeeksPerPage, !permissionsLoading && canView);

  // Đổi filter/trang -> bỏ lựa chọn cũ (tránh xoá nhầm đơn không còn nhìn thấy).
  const { clear: clearHistorySel } = historySel;
  const { clear: clearTrashSel } = trashSel;
  useEffect(() => { clearHistorySel(); }, [historyFilters, historyPage, historyWeeksPerPage, clearHistorySel]);
  useEffect(() => { clearTrashSel(); }, [trashFilters, trashPage, trashWeeksPerPage, clearTrashSel]);

  // Badge tab "Chờ phê duyệt" = TỔNG đơn đang chờ (không phụ thuộc filter/trang
  // hiện tại) - dùng CHUNG queryKey + endpoint COUNT với badge sidebar.
  const pendingCountQuery = useQuery({
    queryKey: ['badge-count', 'duyet-phep'],
    queryFn: () => leaveRequestsApi.getPendingCount(),
    enabled: !permissionsLoading && canApprove,
    staleTime: 30_000,
  });
  const pendingCount = pendingCountQuery.data ?? 0;

  // Dropdown phòng ban: lấy từ danh sách phòng ban (trước đây suy từ data đã
  // tải - không còn khả thi khi data được lazy-load từng tuần).
  const { departments } = useDepartments();
  const departmentOptions = useMemo(
    () =>
      departments.map((d) => ({
        value: d.id,
        label: <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>{d.name}</Tag>,
      })),
    [departments],
  );

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
          invalidateLeaveLists();
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

  // ── Xoá mềm / xoá vĩnh viễn (đơn lẻ + hàng loạt) ─────────────────────────
  const reportBulk = (verb: string, res: BulkLeaveResult) => {
    if (res.succeeded.length > 0) messageApi.success(`Đã ${verb} ${res.succeeded.length} đơn`);
    if (res.failed.length > 0) {
      modal.warning({
        title: `${res.failed.length} đơn không xử lý được`,
        content: (
          <ul style={{ paddingLeft: 18, margin: 0, maxHeight: 240, overflow: 'auto' }}>
            {res.failed.slice(0, 20).map((f) => (
              <li key={f.id}>Đơn #{f.id}: {f.reason}</li>
            ))}
            {res.failed.length > 20 && <li>... và {res.failed.length - 20} đơn khác</li>}
          </ul>
        ),
      });
    }
  };

  const TRASH_CONTENT =
    'Đơn sẽ chuyển vào tab Thùng rác. Nếu đơn đã được duyệt, số ngày phép năm đã trừ (nếu loại phép có trừ phép năm) sẽ được hoàn lại cho nhân viên.';
  const HARD_DELETE_CONTENT = 'Đơn bị xoá vĩnh viễn cùng ảnh đính kèm và KHÔNG thể khôi phục.';

  const confirmTrash = (ids: number[]) => {
    const many = ids.length > 1;
    modal.confirm({
      title: many ? `Chuyển ${ids.length} đơn vào thùng rác?` : 'Chuyển đơn vào thùng rác?',
      icon: <ExclamationCircleOutlined />,
      content: TRASH_CONTENT,
      okText: 'Chuyển vào thùng rác',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBulkProcessing(true);
        try {
          let res: BulkLeaveResult;
          if (many) {
            res = await leaveRequestsApi.bulkTrash(ids);
          } else {
            await leaveRequestsApi.trash(ids[0]);
            res = { succeeded: [ids[0]], failed: [] };
          }
          reportBulk('chuyển vào thùng rác', res);
          historySel.clear();
          invalidateLeaveLists();
        } catch (err: any) {
          if (err.response?.status !== 401) {
            messageApi.error(err.response?.data?.message || 'Không thể chuyển đơn vào thùng rác');
          }
        } finally {
          setBulkProcessing(false);
        }
      },
    });
  };

  const confirmHardDelete = (ids: number[]) => {
    const many = ids.length > 1;
    modal.confirm({
      title: many ? `Xoá vĩnh viễn ${ids.length} đơn?` : 'Xoá vĩnh viễn đơn này?',
      icon: <ExclamationCircleOutlined />,
      content: HARD_DELETE_CONTENT,
      okText: 'Xoá vĩnh viễn',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBulkProcessing(true);
        try {
          let res: BulkLeaveResult;
          if (many) {
            res = await leaveRequestsApi.bulkHardDelete(ids);
          } else {
            await leaveRequestsApi.hardDelete(ids[0]);
            res = { succeeded: [ids[0]], failed: [] };
          }
          reportBulk('xoá vĩnh viễn', res);
          trashSel.clear();
          invalidateLeaveLists();
        } catch (err: any) {
          if (err.response?.status !== 401) {
            messageApi.error(err.response?.data?.message || 'Không thể xoá đơn');
          }
        } finally {
          setBulkProcessing(false);
        }
      },
    });
  };

  // rowSelection cho <Table> của từng tuần - cập nhật theo delta (xem useIdSelection).
  const buildRowSelection = (sel: ReturnType<typeof useIdSelection>) => ({
    selectedRowKeys: sel.keys,
    onSelect: (record: LeaveRequest, selected: boolean) => sel.toggle(record.id, selected),
    onSelectAll: (selected: boolean, _rows: LeaveRequest[], changeRows: LeaveRequest[]) =>
      sel.setMany(changeRows.map((r) => r.id), selected),
  });

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
      invalidateLeaveLists();
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
      invalidateLeaveLists();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        messageApi.error(err.response?.data?.message || 'Cập nhật đơn thất bại');
      }
    } finally {
      setEditSubmitting(false);
    }
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
      width: canEdit && canDelete ? 170 : 100,
      render: (_: any, record: LeaveRequest) => (
        <Space size={4}>
          {canEdit && (record.status === 'pending' || record.status === 'approved') && (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              Sửa
            </Button>
          )}
          {/* Nút Huỷ (xoá mềm) CHỈ có ở Lịch sử (đơn đã duyệt/từ chối). Tab Chờ
              duyệt không có - đơn pending chỉ chủ đơn huỷ được. */}
          {canDelete && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmTrash([record.id])}>
              Huỷ
            </Button>
          )}
        </Space>
      )
    }
  ].filter((col: any) => canEdit || canDelete || col.title !== 'Thao tác');
  // Cùng lý do với `pendingTableWidth` ở trên - `historyColumns` giờ cũng có
  // `.filter()` (ẩn "Thao tác" khi không có quyền `leave_requests.edit`).
  const historyTableWidth = historyColumns.reduce((sum: number, col: any) => sum + (col.width ?? 0), 0);

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
      render: (type: string) => {
        const info = leaveTypeMap[type] ?? { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
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
      title: 'Trước khi xoá',
      width: 170,
      render: (_: any, record: LeaveRequest) => {
        const o = trashOrigin(record);
        return <Tag color={o.color}>{o.text}</Tag>;
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
      title: 'Đính kèm',
      width: 100,
      render: (_: any, record: LeaveRequest) => (
        <AttachmentsViewerButton requestId={record.id} count={record.attachmentCount} />
      )
    },
    {
      title: 'Ngày xoá',
      dataIndex: 'cancelledAt',
      width: 130,
      render: (date?: string | null) => (date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '-')
    },
    {
      title: 'Thao tác',
      width: 140,
      render: (_: any, record: LeaveRequest) => (
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => confirmHardDelete([record.id])}>
          Xoá vĩnh viễn
        </Button>
      )
    }
  ].filter((col: any) => canDelete || col.title !== 'Thao tác');
  const trashTableWidth = trashColumns.reduce((sum: number, col: any) => sum + (col.width ?? 0), 0);

  // ── tab items ─────────────────────────────────────────────────────────────
  const tabItems = [
    canApprove ? {
      key: 'pending',
      label: (
        <span>
          <HourglassOutlined />
          {' '}Chờ phê duyệt{' '}
          {pendingCount > 0 && <Badge count={pendingCount} offset={[10, -5]} size="small" />}
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
                onChange={(e) => { setPendingSearch(e.target.value); setPendingPage(1); }}
              />
            </Col>
            <Col xs={12} sm={6} md={5}>
              <Select
                allowClear
                placeholder="Phòng ban"
                style={{ width: '100%' }}
                value={pendingDept}
                onChange={(v) => { setPendingDept(v ?? null); setPendingPage(1); }}
                options={departmentOptions}
              />
            </Col>
            <Col xs={12} sm={6} md={5}>
              <Select
                allowClear
                placeholder="Loại phép"
                style={{ width: '100%' }}
                value={pendingLeaveType}
                onChange={(v) => { setPendingLeaveType(v ?? null); setPendingPage(1); }}
                options={leaveTypes.map((t) => ({
                  value: t.code,
                  label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag>,
                }))}
              />
            </Col>
          </Row>
          <WeeklyLazySection<LeaveRequest>
            weeks={pendingList.weeks}
            fetchWeek={pendingList.fetchWeek}
            resetKey={pendingList.resetKey}
            rowKey="id"
            columns={pendingColumns as any}
            scroll={{ x: pendingTableWidth }}
            size="small"
            isMobile={isMobile}
            loading={pendingList.isFetching}
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
            pagination={{
              current: pendingPage,
              pageSize: pendingWeeksPerPage,
              total: pendingList.totalWeeks,
              showSizeChanger: true,
              // Số TUẦN/trang (không phải số bản ghi/trang).
              pageSizeOptions: ['2', '4', '8'],
              showTotal: (t) => `Tổng cộng ${t} tuần (${pendingList.totalRecords.toLocaleString()} đơn)`,
              onChange: (p, ps) => {
                setPendingPage(ps !== pendingWeeksPerPage ? 1 : p);
                setPendingWeeksPerPage(ps);
              },
            }}
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
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Select
                allowClear
                placeholder="Phòng ban"
                style={{ width: '100%' }}
                value={historyDept}
                onChange={(v) => { setHistoryDept(v ?? null); setHistoryPage(1); }}
                options={departmentOptions}
              />
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Select
                allowClear
                placeholder="Loại phép"
                style={{ width: '100%' }}
                value={historyLeaveType}
                onChange={(v) => { setHistoryLeaveType(v ?? null); setHistoryPage(1); }}
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
                onChange={(v) => { setHistoryStatus(v ?? null); setHistoryPage(1); }}
                options={Object.entries(STATUS_MAP)
                  // BE history chỉ trả approved/rejected - 'cancelled' không bao giờ khớp.
                  .filter(([code]) => code === 'approved' || code === 'rejected')
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
                onChange={(vals) => { setHistoryDateRange(vals as [Dayjs | null, Dayjs | null] | null); setHistoryPage(1); }}
              />
            </Col>
          </Row>
          {canDelete && (
            <BulkBar
              count={historySel.count}
              actionLabel="Chuyển vào thùng rác"
              loading={bulkProcessing}
              onAction={() => confirmTrash(historySel.keys)}
              onClear={historySel.clear}
            />
          )}
          <WeeklyLazySection<LeaveRequest>
            weeks={historyList.weeks}
            fetchWeek={historyList.fetchWeek}
            resetKey={historyList.resetKey}
            rowKey="id"
            columns={historyColumns as any}
            rowSelection={canDelete ? buildRowSelection(historySel) : undefined}
            scroll={{ x: historyTableWidth }}
            size="small"
            isMobile={isMobile}
            loading={historyList.isFetching}
            emptyText="Chưa có lịch sử xử lý"
            renderMobileCard={(record) => (
              <HistoryMobileCard
                key={record.id}
                record={record}
                onEdit={openEditModal}
                canEdit={canEdit}
                canDelete={canDelete}
                onTrash={(id) => confirmTrash([id])}
                selected={historySel.ids.has(record.id)}
                onToggleSelect={historySel.toggle}
                leaveTypeMap={leaveTypeMap}
              />
            )}
            pagination={{
              current: historyPage,
              pageSize: historyWeeksPerPage,
              total: historyList.totalWeeks,
              showSizeChanger: true,
              pageSizeOptions: ['2', '4', '8'],
              showTotal: (t) => `Tổng cộng ${t} tuần (${historyList.totalRecords.toLocaleString()} đơn)`,
              onChange: (p, ps) => {
                setHistoryPage(ps !== historyWeeksPerPage ? 1 : p);
                setHistoryWeeksPerPage(ps);
              },
            }}
          />
        </>
      )
    } : null,
    canView ? {
      key: 'trash',
      label: (
        <span>
          <DeleteOutlined />
          {' '}Thùng rác
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
                value={trashSearch}
                onChange={(e) => { setTrashSearch(e.target.value); setTrashPage(1); }}
              />
            </Col>
            <Col xs={12} sm={6} md={5}>
              <Select
                allowClear
                placeholder="Phòng ban"
                style={{ width: '100%' }}
                value={trashDept}
                onChange={(v) => { setTrashDept(v ?? null); setTrashPage(1); }}
                options={departmentOptions}
              />
            </Col>
            <Col xs={12} sm={6} md={5}>
              <Select
                allowClear
                placeholder="Loại phép"
                style={{ width: '100%' }}
                value={trashLeaveType}
                onChange={(v) => { setTrashLeaveType(v ?? null); setTrashPage(1); }}
                options={leaveTypes.map((t) => ({
                  value: t.code,
                  label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag>,
                }))}
              />
            </Col>
            <Col xs={24} sm={12} md={7}>
              <DatePicker.RangePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                placeholder={['Từ ngày', 'Đến ngày']}
                value={trashDateRange as any}
                onChange={(vals) => { setTrashDateRange(vals as [Dayjs | null, Dayjs | null] | null); setTrashPage(1); }}
              />
            </Col>
          </Row>
          {canDelete && (
            <BulkBar
              count={trashSel.count}
              actionLabel="Xoá vĩnh viễn"
              loading={bulkProcessing}
              onAction={() => confirmHardDelete(trashSel.keys)}
              onClear={trashSel.clear}
            />
          )}
          <WeeklyLazySection<LeaveRequest>
            weeks={trashList.weeks}
            fetchWeek={trashList.fetchWeek}
            resetKey={trashList.resetKey}
            rowKey="id"
            columns={trashColumns as any}
            rowSelection={canDelete ? buildRowSelection(trashSel) : undefined}
            scroll={{ x: trashTableWidth }}
            size="small"
            isMobile={isMobile}
            loading={trashList.isFetching}
            emptyText="Thùng rác trống"
            renderMobileCard={(record) => (
              <TrashMobileCard
                key={record.id}
                record={record}
                canDelete={canDelete}
                onHardDelete={(id) => confirmHardDelete([id])}
                selected={trashSel.ids.has(record.id)}
                onToggleSelect={trashSel.toggle}
                leaveTypeMap={leaveTypeMap}
              />
            )}
            pagination={{
              current: trashPage,
              pageSize: trashWeeksPerPage,
              total: trashList.totalWeeks,
              showSizeChanger: true,
              pageSizeOptions: ['2', '4', '8'],
              showTotal: (t) => `Tổng cộng ${t} tuần (${trashList.totalRecords.toLocaleString()} đơn)`,
              onChange: (p, ps) => {
                setTrashPage(ps !== trashWeeksPerPage ? 1 : p);
                setTrashWeeksPerPage(ps);
              },
            }}
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