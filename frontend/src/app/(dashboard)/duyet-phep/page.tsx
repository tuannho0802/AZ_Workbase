'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table, Card, Button, Space, Tag, Badge, Tabs, Modal, Input, App, Typography, Divider, Tooltip,
  Row, Col, Select, DatePicker, Form
} from 'antd';
import {
  CheckOutlined, CloseOutlined, HistoryOutlined, HourglassOutlined,
  UserOutlined, CalendarOutlined, ClockCircleOutlined, SearchOutlined, EditOutlined
} from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest } from '@/lib/api/leave-requests.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useLeaveTypes } from '@/lib/hooks/useLeaveTypes';
import { AttachmentsViewerButton } from '@/components/leave-requests/AttachmentsViewerButton';
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
        <AttachmentsViewerButton requestId={record.id} size="small" />
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
        <AttachmentsViewerButton requestId={record.id} size="small" />
        {canEdit && (record.status === 'pending' || record.status === 'approved') && (
          <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(record)}>
            Sửa
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function ApprovalPage() {
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
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

  // Filter: cả 2 tab đều là client-side (BE trả toàn bộ, không phân trang) -
  // dữ liệu nhiều người/phòng ban nên field cần nhiều hơn nghi-phep (của
  // riêng mình): search theo tên/email người gửi + lý do, phòng ban, loại
  // phép; tab Lịch sử có thêm Trạng thái + khoảng ngày (đã xử lý xong).
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingDept, setPendingDept] = useState<string | null>(null);
  const [pendingLeaveType, setPendingLeaveType] = useState<string | null>(null);

  const [historySearch, setHistorySearch] = useState('');
  const [historyDept, setHistoryDept] = useState<string | null>(null);
  const [historyLeaveType, setHistoryLeaveType] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<string | null>(null);
  const [historyDateRange, setHistoryDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

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

  // Phòng ban dùng cho dropdown filter - suy trực tiếp từ data đã tải (danh
  // sách đơn nghỉ, không có phòng ban nào lạ hơn danh sách này), tránh phải
  // gọi thêm 1 API riêng chỉ để phục vụ 1 dropdown lọc.
  const pendingDeptOptions = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    pendingRequests.forEach((r) => {
      if (r.requester.department) map.set(String(r.requester.department.id), { name: r.requester.department.name, color: r.requester.department.color });
    });
    return Array.from(map, ([value, info]) => ({
      value,
      label: <Tag color={resolveEntityColor(info.color)} style={{ marginInlineEnd: 0 }}>{info.name}</Tag>,
    }));
  }, [pendingRequests]);

  const historyDeptOptions = useMemo(() => {
    const map = new Map<string, { name: string; color?: string }>();
    historyRequests.forEach((r) => {
      if (r.requester.department) map.set(String(r.requester.department.id), { name: r.requester.department.name, color: r.requester.department.color });
    });
    return Array.from(map, ([value, info]) => ({
      value,
      label: <Tag color={resolveEntityColor(info.color)} style={{ marginInlineEnd: 0 }}>{info.name}</Tag>,
    }));
  }, [historyRequests]);

  const matchesRequesterSearch = (r: LeaveRequest, q: string) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      r.requester.name.toLowerCase().includes(s) ||
      r.requester.email.toLowerCase().includes(s) ||
      (r.reason || '').toLowerCase().includes(s)
    );
  };

  const filteredPending = useMemo(() => {
    return pendingRequests.filter((r) => {
      if (!matchesRequesterSearch(r, pendingSearch)) return false;
      if (pendingDept && String(r.requester.department?.id) !== pendingDept) return false;
      if (pendingLeaveType && r.leaveType !== pendingLeaveType) return false;
      return true;
    });
  }, [pendingRequests, pendingSearch, pendingDept, pendingLeaveType]);

  const filteredHistory = useMemo(() => {
    return historyRequests.filter((r) => {
      if (!matchesRequesterSearch(r, historySearch)) return false;
      if (historyDept && String(r.requester.department?.id) !== historyDept) return false;
      if (historyLeaveType && r.leaveType !== historyLeaveType) return false;
      if (historyStatus && r.status !== historyStatus) return false;
      if (historyDateRange && historyDateRange[0] && historyDateRange[1]) {
        const [from, to] = historyDateRange;
        const overlap = !dayjs(r.startDate).isAfter(to, 'day') && !dayjs(r.endDate).isBefore(from, 'day');
        if (!overlap) return false;
      }
      return true;
    });
  }, [historyRequests, historySearch, historyDept, historyLeaveType, historyStatus, historyDateRange]);

  // Phân biệt quyền:
  // view = xem lịch sử duyệt (của người khác)
  // approve = xem danh sách chờ + có nút duyệt/từ chối
  const canView = can('leave_requests.view');
  const canApprove = can('leave_requests.approve');
  // edit = "sửa hộ" ngày/loại phép/lý do của 1 đơn PENDING/APPROVED (khác
  // hẳn approve/reject) - xem migration SeedLeaveRequestsEditPermission.
  const canEdit = can('leave_requests.edit');
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
    fetchAllData();
  }, [canView, canApprove, permissionsLoading]);

  // Tách riêng: 403 ở 1 api không kill api kia
  const fetchAllData = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      canApprove ? leaveRequestsApi.getPending() : Promise.resolve([]),
      canView ? leaveRequestsApi.getHistory() : Promise.resolve([]),
    ]);
    if (results[0].status === 'fulfilled') setPendingRequests(results[0].value as LeaveRequest[]);
    if (results[1].status === 'fulfilled') setHistoryRequests(results[1].value as LeaveRequest[]);
    setLoading(false);
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
          await fetchAllData();
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
      await fetchAllData();
    } catch (err: any) {
      if (err.response?.status !== 401) {
        messageApi.error('Từ chối đơn thất bại');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditModal = (record: LeaveRequest) => {
    setEditingRequest(record);
    editForm.setFieldsValue({
      leaveType: record.leaveType,
      dateRange: [dayjs(record.startDate), dayjs(record.endDate)],
      duration: record.duration,
      reason: record.reason,
    });
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
      await fetchAllData();
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
        <AttachmentsViewerButton requestId={record.id} />
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
        <AttachmentsViewerButton requestId={record.id} />
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
      width: 100,
      render: (_: any, record: LeaveRequest) =>
        (record.status === 'pending' || record.status === 'approved') && (
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            Sửa
          </Button>
        )
    }
  ].filter((col: any) => canEdit || col.title !== 'Thao tác');
  // Cùng lý do với `pendingTableWidth` ở trên - `historyColumns` giờ cũng có
  // `.filter()` (ẩn "Thao tác" khi không có quyền `leave_requests.edit`).
  const historyTableWidth = historyColumns.reduce((sum: number, col: any) => sum + (col.width ?? 0), 0);

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
          {isMobile ? (
            filteredPending.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
            ✅ Không có đơn chờ duyệt
          </div>
        ) : (
                filteredPending.map(r => (
            <PendingMobileCard
              key={r.id}
              record={r}
              onApprove={handleApprove}
              onReject={openRejectModal}
                    onEdit={openEditModal}
                    canEdit={canEdit}
              leaveTypeMap={leaveTypeMap}
            />
          ))
        )
      ) : (
        <Table
          columns={pendingColumns}
                dataSource={filteredPending}
          rowKey="id"
          loading={loading}
          pagination={false}
            size="small"
            tableLayout="fixed"
                scroll={{ x: pendingTableWidth }}
          locale={{ emptyText: '✅ Không có đơn chờ duyệt' }}
        />
          )}
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
          {isMobile ? (
            filteredHistory.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
            Chưa có lịch sử xử lý
          </div>
        ) : (
                filteredHistory.map(r => (
                  <HistoryMobileCard
                    key={r.id}
                    record={r}
                    onEdit={openEditModal}
                    canEdit={canEdit}
                    leaveTypeMap={leaveTypeMap}
                  />
          ))
        )
      ) : (
        <Table
          columns={historyColumns}
                dataSource={filteredHistory}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
            size="small"
            tableLayout="fixed"
                scroll={{ x: historyTableWidth }}
          locale={{ emptyText: 'Chưa có lịch sử xử lý' }}
        />
          )}
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