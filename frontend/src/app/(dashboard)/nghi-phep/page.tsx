'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button, Modal, Form, Select, DatePicker, TimePicker, Input, Tag, App, Card, Divider, Typography, Row, Col, Tooltip,
  Tabs, Badge, Space
} from 'antd';
import {
  PlusOutlined, CloseCircleOutlined, CalendarOutlined, ClockCircleOutlined, FileTextOutlined, UserOutlined,
  SearchOutlined, DeleteOutlined, UndoOutlined, DeleteRowOutlined,
} from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest, LeaveRequestsQuery, WeekBucketDto } from '@/lib/api/leave-requests.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useLeaveTypes } from '@/lib/hooks/useLeaveTypes';
import { AttachmentUploader, AttachmentUploaderHandle } from '@/components/leave-requests/AttachmentUploader';
import { AttachmentsViewerButton } from '@/components/leave-requests/AttachmentsViewerButton';
import { WeeklyLazySection } from '@/components/common/WeeklyLazySection';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;
const { RangePicker: TimeRangePicker } = TimePicker;
const { TextArea } = Input;
const { Text } = Typography;

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: 'Chờ duyệt', color: 'gold' },
  approved: { text: 'Đã duyệt', color: 'green' },
  rejected: { text: 'Từ chối', color: 'red' },
  cancelled: { text: 'Đã hủy', color: 'default' }
};

// Mirror `REASON_ELLIPSIS_STYLE` ở `duyet-phep/page.tsx`: ép chính `<span>`
// (đối tượng trigger Tooltip) tự cắt bằng overflow/textOverflow/maxWidth,
// tránh bug Tooltip định vị lệch do span không có maxWidth (xem JSDoc đầy đủ
// ở file đó).
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
// timestamp đầy đủ). Trả về null khi không dùng Period Hours.
function formatPeriodHours(record: LeaveRequest): string | null {
  if (!record.periodStartTime || !record.periodEndTime) return null;
  return `${record.periodStartTime.slice(0, 5)} - ${record.periodEndTime.slice(0, 5)}`;
}

/**
 * Mirror ĐÚNG `sumColumnWidths()` ở `duyet-phep/page.tsx` - cộng tổng
 * `width` các cột ĐANG HIỂN THỊ để làm `scroll.x` DẠNG SỐ PIXEL cụ thể
 * (KHÔNG dùng 'max-content'). Kết hợp `<Space wrap>` ở cột "Thao tác" làm 2
 * lớp bảo hiểm: cột không bao giờ tràn ra ngoài bảng dù sau này thêm nút
 * hay thêm cột (xem JSDoc đầy đủ ở file kia).
 */
function sumColumnWidths(columns: { width?: number }[]): number {
  return columns.reduce((sum, col) => sum + (col.width ?? 120), 0);
}

// ── Mobile Card ──────────────────────────────────────────────────────────────
function MyLeaveMobileCard({
  record,
  onCancel,
  onSelfDelete,
  leaveTypeMap,
}: {
  record: LeaveRequest;
  onCancel: (id: number) => void;
    // Xoá mềm (vào Thùng rác) đơn CỦA CHÍNH MÌNH - KHÁC hẳn onCancel (chỉ đổi
    // status), chỉ áp dụng khi đơn đang PENDING (BE tự chặn nếu không).
    onSelfDelete: (id: number) => void;
    leaveTypeMap: Record<string, { text: string; color: string }>;
}) {
  const lt = leaveTypeMap[record.leaveType] || { text: record.leaveType, color: 'default' };
  const st = STATUS_MAP[record.status] || { text: record.status, color: 'default' };

  return (
    <Card
      variant="outlined"
      style={{ marginBottom: 10 }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <Tag color={lt.color}>{lt.text}</Tag>
        <Tag color={st.color}>{st.text}</Tag>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
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
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <FileTextOutlined style={{ color: '#8c8c8c', fontSize: 12, marginTop: 3 }} />
            <Text style={{ fontSize: 12, color: '#595959' }}>{record.reason}</Text>
          </div>
        )}
        {record.approver && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <UserOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
            <Text style={{ fontSize: 12, color: '#595959' }}>
              Người duyệt: <Text strong>{record.approver.name}</Text>
            </Text>
          </div>
        )}
        {record.rejectionReason && (
          <Text style={{ fontSize: 12, color: '#f5222d', fontStyle: 'italic' }}>
            Lý do từ chối: {record.rejectionReason}
          </Text>
        )}
      </div>

      <AttachmentsViewerButton requestId={record.id} size="small" count={record.attachmentCount} />

      {record.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <Button
            danger
            type="primary"
            size="small"
            icon={<CloseCircleOutlined />}
            style={{ flex: 1, minWidth: 110 }}
            onClick={() => onCancel(record.id)}
          >
            Hủy đơn
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            style={{ flex: 1, minWidth: 90 }}
            onClick={() => onSelfDelete(record.id)}
          >
            Xoá
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Mobile Card - Thùng rác (tự phục vụ) ────────────────────────────────────
function MyTrashMobileCard({
  record,
  onRestore,
  onHardDelete,
  leaveTypeMap,
}: {
  record: LeaveRequest;
  onRestore: (record: LeaveRequest) => void;
  onHardDelete: (record: LeaveRequest) => void;
  leaveTypeMap: Record<string, { text: string; color: string }>;
}) {
  const lt = leaveTypeMap[record.leaveType] || { text: record.leaveType, color: 'default' };
  const st = STATUS_MAP[record.status] || { text: record.status, color: 'default' };

  return (
    <Card
      variant="outlined"
      style={{ marginBottom: 10 }}
      styles={{ body: { padding: '12px 14px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <Tag color={lt.color}>{lt.text}</Tag>
        <Tag color={st.color}>{st.text}</Tag>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <CalendarOutlined style={{ color: '#1890ff', fontSize: 12 }} />
          <Text style={{ fontSize: 12 }}>
            {dayjs(record.startDate).format('DD/MM/YYYY')} → {dayjs(record.endDate).format('DD/MM/YYYY')}
            <Text strong style={{ color: '#1890ff', marginLeft: 6 }}>{record.totalDays} ngày</Text>
          </Text>
        </div>
        {record.reason && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <FileTextOutlined style={{ color: '#8c8c8c', fontSize: 12, marginTop: 3 }} />
            <Text style={{ fontSize: 12, color: '#595959' }}>{record.reason}</Text>
          </div>
        )}
        {record.deletedAt && (
          <Text style={{ fontSize: 12, color: '#8c8c8c' }}>
            Ngày xoá: {dayjs(record.deletedAt).format('DD/MM/YYYY HH:mm')}
          </Text>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          size="small"
          icon={<UndoOutlined />}
          style={{ flex: 1, minWidth: 110 }}
          onClick={() => onRestore(record)}
        >
          Khôi phục
        </Button>
        <Button
          danger
          size="small"
          icon={<DeleteRowOutlined />}
          style={{ flex: 1, minWidth: 110 }}
          onClick={() => onHardDelete(record)}
        >
          Xoá vĩnh viễn
        </Button>
      </div>
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function LeaveRequestsPage() {
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [attachmentUploaderKey, setAttachmentUploaderKey] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  // ⚠️ ĐỔI sang PHÂN TRANG THEO TUẦN thật ở BE (yêu cầu "1 trang chỉ chứa 4
  // tuần") thay vì tải tối đa 100 đơn/lần rồi lọc client - mirror ĐÚNG
  // `audit-logs/page.tsx` (`WeeklyLazySection` 2 pha): `weeks` = PHA 1 (đếm
  // theo tuần của trang hiện tại), `fetchToken` = khoá bỏ cache các tuần khi
  // filter/trang đổi, `weekFilters` = bộ lọc PHA 1 gần nhất (PHA 2 dùng lại
  // khi mở 1 panel tuần cụ thể).
  const [weeks, setWeeks] = useState<WeekBucketDto[]>([]);
  const [weekFilters, setWeekFilters] = useState<LeaveRequestsQuery>({});
  const [fetchToken, setFetchToken] = useState(0);
  const [page, setPage] = useState(1);
  const [weeksPerPage, setWeeksPerPage] = useState(4);
  const [totalWeeks, setTotalWeeks] = useState(0);
  const [total, setTotal] = useState(0);
  // Filter - giờ lọc SERVER-SIDE (gửi kèm mỗi lần fetch page/tuần), khớp
  // đúng field `QueryLeaveRequestsDto` ở BE. Trường ít vì đây là dữ liệu CỦA
  // CHÍNH mình (không cần lọc theo người/phòng ban như duyet-phep).
  const [searchText, setSearchText] = useState('');
  const [filterLeaveType, setFilterLeaveType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterDateRange, setFilterDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // ── Tab "Thùng rác" (tự phục vụ) - CHỈ đơn CỦA CHÍNH MÌNH, mirror ĐÚNG
  // pattern PHA 1/PHA 2 của tab "Đơn của tôi" ở trên (weeks/fetchToken/
  // page/weeksPerPage/totalWeeks/total riêng). Lazy - chỉ fetch LẦN ĐẦU khi
  // người dùng thực sự mở tab (mirror `trashTabLoaded` ở duyet-phep/page.tsx).
  const [trashWeeks, setTrashWeeks] = useState<WeekBucketDto[]>([]);
  const [trashWeekFilters, setTrashWeekFilters] = useState<LeaveRequestsQuery>({});
  const [trashFetchToken, setTrashFetchToken] = useState(0);
  const [trashPage, setTrashPage] = useState(1);
  const [trashWeeksPerPage, setTrashWeeksPerPage] = useState(4);
  const [trashTotalWeeks, setTrashTotalWeeks] = useState(0);
  const [trashTotal, setTrashTotal] = useState(0);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashTabLoaded, setTrashTabLoaded] = useState(false);
  const [trashSearch, setTrashSearch] = useState('');
  // Ảnh đính kèm giờ chỉ nằm trong RAM trình duyệt (xem AttachmentUploader) -
  // component cha gọi `uploadAll()` qua ref đúng lúc submit, KHÔNG còn bind
  // value/onChange kiểu controlled field qua Form nữa.
  const attachmentUploaderRef = useRef<AttachmentUploaderHandle>(null);
  // Theo dõi realtime giá trị "Loại phép" trong Form để truyền xuống
  // AttachmentUploader - BE (`PresignAttachmentDto.leaveType`) bắt buộc
  // phải có giá trị này ngay khi presign, không thể lấy sau.
  const selectedLeaveType = Form.useWatch('leaveType', form);
  const { message, modal } = App.useApp();
  const router = useRouter();
  const { can, isLoading: permissionsLoading } = useMyPermissions();

  // Loại phép giờ lấy động từ BE (bảng leave_types, CRUD ở /quan-ly-loai-phep)
  // thay vì enum cứng - mirror đúng cách `useCustomerStatuses()` được dùng ở
  // trang khách hàng. `leaveTypeMap`: tra cứu {text, color} theo `code` để
  // hiển thị Tag (cột bảng + mobile card); `leaveTypeOptions`: options cho
  // Select khi tạo đơn, sắp theo `sortOrder` (đã có sẵn từ hook).
  const { leaveTypes } = useLeaveTypes();
  const leaveTypeMap = useMemo<Record<string, { text: string; color: string }>>(
    () => Object.fromEntries(leaveTypes.map((t) => [t.code, { text: t.name, color: t.color }])),
    [leaveTypes],
  );
  // ⚠️ MỚI - dropdown "Loại phép" ở Modal tạo đơn trước đây chỉ hiện text
  // trơn (label: t.name), không có Tag màu như ở cột "Loại phép" của bảng
  // hay ở dropdown filter Trạng thái/Nguồn (xem CustomerFilters.tsx -
  // `options={...map(s => ({ value: s.code, label: <Tag color={s.color}>...}))}`).
  // Đồng bộ đúng pattern đó: label giờ là <Tag> màu theo `t.color` (đã có sẵn
  // từ BE qua bảng leave_types), thay vì chuỗi text đơn thuần.
  const leaveTypeOptions = useMemo(
    () =>
      leaveTypes.map((t) => ({
        value: t.code,
        label: <Tag color={t.color} style={{ marginInlineEnd: 0 }}>{t.name}</Tag>,
      })),
    [leaveTypes],
  );

  // Quyền: request = xem + tạo đơn của bản thân; view = xem thêm đơn người khác (không liên quan trang này)
  const canRequest = can('leave_requests.request');

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!permissionsLoading && !canRequest) {
      message.warning('Bạn không có quyền truy cập trang này');
      router.replace('/customers');
      return;
    }
    if (!permissionsLoading && canRequest) {
      fetchRequests(1, weeksPerPage);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest, permissionsLoading]);

  // PHA 1: đếm theo tuần cho trang `pg` (không kéo bản ghi nào ngoài tuần
  // mới nhất - `WeeklyLazySection` tự mở panel đầu tiên và trigger PHA 2 qua
  // `fetchWeek`). Nhận `pg`/`wpp` làm tham số (không chỉ đọc từ state) để
  // handler gọi lại ngay được với giá trị MỚI mà không cần chờ re-render.
  const fetchRequests = async (pg = page, wpp = weeksPerPage) => {
    setLoading(true);
    try {
      const filters: LeaveRequestsQuery = {
        page: pg,
        weeksPerPage: wpp,
        search: searchText.trim() || undefined,
        leaveType: filterLeaveType || undefined,
        status: filterStatus || undefined,
        dateFrom: filterDateRange?.[0] ? filterDateRange[0].format('YYYY-MM-DD') : undefined,
        dateTo: filterDateRange?.[1] ? filterDateRange[1].format('YYYY-MM-DD') : undefined,
      };
      const res = await leaveRequestsApi.getAll(filters);
      setWeeks(res.weeks ?? []);
      setWeekFilters(filters);
      setFetchToken((t) => t + 1);
      setTotal(res.total || 0);
      setTotalWeeks(res.totalWeeks || 0);
    } catch {
      message.error('Không thể tải danh sách đơn nghỉ phép');
      setWeeks([]);
    } finally {
      setLoading(false);
    }
  };

  // PHA 2: lấy đúng bản ghi của 1 tuần khi panel được mở (dùng lại filter
  // của PHA 1 gần nhất, KHÔNG phải state filter hiện tại - tránh lệch nếu
  // người dùng đổi filter ngay khi 1 panel khác đang tải).
  const fetchWeek = useCallback(
    async (weekStart: string, weekPage: number, weekLimit: number) => {
      const r = await leaveRequestsApi.getAll({ ...weekFilters, weekStart, weekPage, weekLimit });
      return { data: r.data ?? [], weekTotal: r.weekTotal };
    },
    [weekFilters],
  );

  // PHA 1 cho tab "Thùng rác" - mirror ĐÚNG `fetchRequests()` ở trên, dùng
  // `getMyTrash()` (CHỈ đơn của chính mình, gate `leave_requests.request` -
  // xem LeaveRequestsController.findMyTrash() ở BE).
  const fetchMyTrash = async (pg = trashPage, wpp = trashWeeksPerPage) => {
    setTrashLoading(true);
    try {
      const filters: LeaveRequestsQuery = {
        page: pg,
        weeksPerPage: wpp,
        search: trashSearch.trim() || undefined,
      };
      const res = await leaveRequestsApi.getMyTrash(filters);
      setTrashWeeks(res.weeks ?? []);
      setTrashWeekFilters(filters);
      setTrashFetchToken((t) => t + 1);
      setTrashTotal(res.total || 0);
      setTrashTotalWeeks(res.totalWeeks || 0);
    } catch {
      message.error('Không thể tải thùng rác');
      setTrashWeeks([]);
    } finally {
      setTrashLoading(false);
    }
  };

  // PHA 2 cho tab "Thùng rác" - mirror ĐÚNG `fetchWeek()` ở trên.
  const fetchWeekMyTrash = useCallback(
    async (weekStart: string, weekPage: number, weekLimit: number) => {
      const r = await leaveRequestsApi.getMyTrash({ ...trashWeekFilters, weekStart, weekPage, weekLimit });
      return { data: r.data ?? [], weekTotal: r.weekTotal };
    },
    [trashWeekFilters],
  );

  // Tìm kiếm debounce 300ms (setTimeout thuần - repo chưa có dependency
  // `lodash` cài sẵn, tránh thêm package mới chỉ vì 1 chỗ debounce) - các
  // filter còn lại (Select/RangePicker) fetch ngay lúc đổi, không cần debounce.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canRequest) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      fetchRequests(1, weeksPerPage);
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  useEffect(() => {
    if (!canRequest) return;
    setPage(1);
    fetchRequests(1, weeksPerPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLeaveType, filterStatus, filterDateRange]);

  // Tab "Thùng rác" chỉ fetch LẦN ĐẦU khi người dùng thực sự mở tab đó
  // (lazy) - mirror ĐÚNG `trashTabLoaded` ở duyet-phep/page.tsx.
  const trashSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!trashTabLoaded || !canRequest) return;
    if (trashSearchDebounceRef.current) clearTimeout(trashSearchDebounceRef.current);
    trashSearchDebounceRef.current = setTimeout(() => {
      setTrashPage(1);
      fetchMyTrash(1, trashWeeksPerPage);
    }, 300);
    return () => {
      if (trashSearchDebounceRef.current) clearTimeout(trashSearchDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trashTabLoaded, trashSearch]);

  /**
   * Đóng/huỷ Modal tạo đơn KHÔNG qua bấm "Tạo đơn" (nút "Hủy" hoặc bấm X).
   * ⚠️ Khác bản cũ: ảnh đính kèm (nếu có) CHƯA từng chạm B2 ở bước này (chỉ
   * là `File` object giữ cục bộ trong AttachmentUploader) - KHÔNG còn cần
   * gọi `discardAttachments()` nữa, chỉ cần remount component (đổi key) để
   * giải phóng state, trình duyệt tự dọn.
   */
  const closeModal = () => {
    setModalOpen(false);
    form.resetFields();
    setAttachmentUploaderKey((k) => k + 1);
  };

  /**
   * Cảnh báo khi Ngày bắt đầu nghỉ được chọn SỚM HƠN hôm nay (quá khứ) -
   * RangePicker không còn disabledDate chặn cứng (xem comment ở Form.Item
   * "dateRange"). Chỉ cảnh báo dựa trên `dates[0]` (Ngày bắt đầu) - đúng
   * điều kiện BE tính `isSupplementary` (`computeIsSupplementary()` so
   * `startDate` với hôm nay, KHÔNG liên quan `endDate`).
   * Bấm "Huỷ" ở modal -> xoá lựa chọn (clear field), bắt chọn lại. Bấm
   * "Xác nhận" -> giữ nguyên giá trị đã chọn (không làm gì thêm, Form đã tự
   * cập nhật state qua trigger onChange mặc định).
   */
  const handleDateRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    const startDate = dates?.[0];
    const endDate = dates?.[1];

    if (startDate && startDate.isBefore(dayjs().startOf('day'))) {
      modal.confirm({
        title: 'Chọn ngày nghỉ trong quá khứ',
        content:
          `Ngày bắt đầu nghỉ (${startDate.format('DD/MM/YYYY')}) đã qua so với hôm nay. ` +
          'Đơn này sẽ được hệ thống tự động đánh dấu là "Đơn bổ sung" (tạo bù cho ngày đã nghỉ). ' +
          'Bạn có chắc chắn muốn tiếp tục?',
        okText: 'Xác nhận',
        cancelText: 'Huỷ',
        onCancel: () => {
          form.setFieldValue('dateRange', null);
        },
      });
      // Ưu tiên cảnh báo ngày quá khứ trước - tránh hiện chồng 2 Modal cùng
      // lúc nếu người dùng chọn 1 khoảng vừa ở quá khứ vừa dài hơn 7 ngày.
      // Người dùng chọn lại ngày sau khi xử lý cảnh báo này sẽ tự kích hoạt
      // lại handleDateRangeChange và được kiểm tra >7 ngày ở lượt sau.
      return;
    }

    // MỚI - Cảnh báo khi tổng thời gian nghỉ được chọn > 7 ngày. Tính theo
    // lịch (bao gồm cả ngày bắt đầu + kết thúc), KHÔNG trừ cuối tuần - mirror
    // đúng cách BE tính ở `LeaveRequestsService.calculateDays()` (chỉ khác:
    // ở đây chưa biết `duration`, nhưng half-day chỉ áp dụng khi đúng 1 ngày
    // nên không ảnh hưởng ngưỡng >7). Chỉ NHẮC NHỞ, không chặn tạo đơn - nêu
    // rõ khoảng ngày cụ thể + tổng số ngày, cho phép Tiếp tục tạo đơn hoặc
    // Chọn lại ngày (giống UX của cảnh báo ngày quá khứ ở trên).
    if (startDate && endDate) {
      const totalDays = endDate.startOf('day').diff(startDate.startOf('day'), 'day') + 1;
      if (totalDays > 7) {
        modal.confirm({
          title: 'Thời gian nghỉ dài hơn 7 ngày',
          content: (
            <>
              Bạn đang chọn nghỉ từ <b>{startDate.format('DD/MM/YYYY')}</b> đến{' '}
              <b>{endDate.format('DD/MM/YYYY')}</b>, tổng cộng <b>{totalDays} ngày</b> (vượt quá 7
              ngày). Bạn có muốn tiếp tục tạo đơn với khoảng thời gian này không?
            </>
          ),
          okText: 'Tiếp tục tạo đơn',
          cancelText: 'Chọn lại ngày',
          onCancel: () => {
            form.setFieldValue('dateRange', null);
          },
        });
      }
    }
  };

  const handleCreateRequest = async (values: any) => {
    // Giữ lại key vừa upload (nếu có) ở scope ngoài try - cần để dọn rác
    // trong catch nếu bước tạo đơn thất bại SAU KHI ảnh đã lỡ lên B2 rồi.
    let uploadedKeys: string[] = [];
    setSubmitting(true);
    try {
      const [startDate, endDate] = values.dateRange;
      // Period Hours (Optional) - values.periodHours là mảng [Dayjs, Dayjs]
      // từ TimeRangePicker, hoặc undefined nếu người dùng không chọn. Chỉ
      // gửi lên BE khi có đủ cặp - BE tự validate lại (xem
      // LeaveRequestsService.validatePeriodHours()).
      const [periodStart, periodEnd] = values.periodHours || [];

      // Bước duy nhất trong toàn bộ luồng tạo đơn thật sự đụng tới B2: chỉ
      // presign + PUT đúng lúc người dùng bấm "Tạo đơn" (xem AttachmentUploader.uploadAll).
      if (attachmentUploaderRef.current?.hasFiles()) {
        uploadedKeys = await attachmentUploaderRef.current.uploadAll();
      }

      await leaveRequestsApi.create({
        leaveType: values.leaveType,
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD'),
        duration: values.duration,
        reason: values.reason,
        periodStartTime: periodStart ? periodStart.format('HH:mm') : undefined,
        periodEndTime: periodEnd ? periodEnd.format('HH:mm') : undefined,
        attachmentKeys: uploadedKeys,
      });

      message.success('Tạo đơn nghỉ phép thành công');
      setModalOpen(false);
      form.resetFields();
      setAttachmentUploaderKey((k) => k + 1);
      fetchRequests();
    } catch (err: any) {
      // Ảnh đã PUT lên B2 xong (uploadAll thành công) nhưng bước tạo đơn
      // sau đó lại lỗi (network/validate BE...) -> ảnh mồ côi, dọn ngay
      // tránh rác vĩnh viễn. Best-effort - không chặn UI nếu dọn lỗi.
      if (uploadedKeys.length > 0) {
        leaveRequestsApi.discardAttachments(uploadedKeys).catch(() => undefined);
      }
      message.error(err.response?.data?.message || 'Tạo đơn thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: number) => {
    modal.confirm({
      title: 'Hủy đơn nghỉ phép?',
      content: 'Bạn chắc chắn muốn hủy đơn này?',
      onOk: async () => {
        try {
          await leaveRequestsApi.cancel(id);
          message.success('Đã hủy đơn');
          fetchRequests();
        } catch {
          message.error('Hủy đơn thất bại');
        }
      }
    });
  };

  // ── Xoá mềm / Khôi phục / Xoá vĩnh viễn (Thùng rác - tự phục vụ) ────────
  // Xoá mềm CHỈ áp dụng cho đơn đang PENDING (BE tự chặn nếu không - xem
  // LeaveRequestsService.selfSoftDelete()) - KHÁC hẳn handleCancel() (chỉ
  // đổi status, KHÔNG đưa vào Thùng rác).
  const handleSelfDelete = (id: number) => {
    modal.confirm({
      title: 'Xoá đơn nghỉ phép?',
      content: 'Đơn sẽ được chuyển vào Thùng rác. Bạn có thể khôi phục lại sau.',
      okButtonProps: { danger: true },
      okText: 'Xoá',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await leaveRequestsApi.selfSoftDelete(id);
          message.success('Đã chuyển vào Thùng rác');
          fetchRequests();
          if (trashTabLoaded) fetchMyTrash(1, trashWeeksPerPage);
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Xoá đơn thất bại');
        }
      },
    });
  };

  const handleSelfRestore = async (record: LeaveRequest) => {
    try {
      await leaveRequestsApi.selfRestoreFromTrash(record.id);
      message.success('Đã khôi phục đơn nghỉ phép');
      fetchMyTrash(1, trashWeeksPerPage);
      fetchRequests();
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Khôi phục thất bại');
    }
  };

  // Xoá VĨNH VIỄN - không thể hoàn tác, luôn hỏi lại rõ ràng (mirror pattern
  // `handleHardDelete` ở duyet-phep/page.tsx).
  const handleSelfHardDelete = (record: LeaveRequest) => {
    modal.confirm({
      title: 'Xoá VĨNH VIỄN đơn nghỉ phép?',
      content: 'Đơn sẽ bị xoá HOÀN TOÀN khỏi hệ thống, KHÔNG THỂ khôi phục. Bạn chắc chắn chứ?',
      okButtonProps: { danger: true },
      okText: 'Xoá vĩnh viễn',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await leaveRequestsApi.selfHardDelete(record.id);
          message.success('Đã xoá vĩnh viễn');
          fetchMyTrash(1, trashWeeksPerPage);
        } catch (err: any) {
          message.error(err.response?.data?.message || 'Xoá vĩnh viễn thất bại');
        }
      },
    });
  };

  // ⚠️ FIX BUG THẬT (báo qua ảnh chụp - mirror ĐÚNG bug ở duyet-phep/page.tsx):
  // trước đây KHÔNG cột nào khai `width`, bảng không có `scroll` -> antd
  // không ép `tableLayout: fixed` thật sự, nội dung Ô (đặc biệt cột "Thao
  // tác" khi có ≥2 nút) tự do tràn ra ngoài biên bảng. Giờ MỌI cột đều khai
  // `width` cố định + bảng truyền `scroll.x = sumColumnWidths(columns)`
  // (số pixel cụ thể, KHÔNG dùng 'max-content') + cột "Thao tác" dùng
  // `<Space wrap>` làm lớp bảo hiểm thứ 2 - đảm bảo KHÔNG BAO GIỜ tràn dù
  // sau này thêm nút hay thêm cột (xem JSDoc `sumColumnWidths` ở trên).
  const columns = [
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
      width: 150,
      render: (type: string, record: LeaveRequest) => {
        const info = leaveTypeMap[type] || { text: type, color: 'default' };
        return (
          <>
            <Tag color={info.color}>{info.text}</Tag>
            {record.isSupplementary && <Tag color="gold">Đơn bổ sung</Tag>}
          </>
        );
      }
    },
    {
      title: 'Từ ngày',
      dataIndex: 'startDate',
      width: 100,
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Đến ngày',
      dataIndex: 'endDate',
      width: 100,
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Số ngày',
      dataIndex: 'totalDays',
      width: 90,
      render: (days: number) => `${days} ngày`
    },
    {
      title: 'Khung giờ',
      width: 110,
      render: (_: any, record: LeaveRequest) => {
        const hours = formatPeriodHours(record);
        return hours ? <span style={{ color: '#722ed1' }}>{hours}</span> : '-';
      }
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
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Người duyệt',
      dataIndex: ['approver', 'name'],
      width: 130,
      render: (name: string) => name || '-'
    },
    {
      title: 'Lý do từ chối',
      dataIndex: 'rejectionReason',
      width: 150,
      ellipsis: true,
      render: (rejectionReason: string | null, record: LeaveRequest) =>
        record.status === 'rejected' && rejectionReason ? (
          <Tooltip title={rejectionReason}>
            <span style={{ ...REASON_ELLIPSIS_STYLE, color: '#f5222d', fontStyle: 'italic' }}>{rejectionReason}</span>
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
      width: 160,
      render: (_: any, record: LeaveRequest) => (
        record.status === 'pending' && (
          <Space wrap size={[6, 6]}>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleSelfDelete(record.id)}
            >
              Xoá
            </Button>
          </Space>
        )
      )
    }
  ];

  // Cột riêng cho tab "Thùng rác" (tự phục vụ) - gọn hơn (không cần
  // Người duyệt/Người gửi vì tất cả đều là đơn CỦA CHÍNH MÌNH), thêm
  // "Ngày xoá" - mirror `trashColumns` ở duyet-phep/page.tsx.
  const trashColumns = [
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
      width: 150,
      render: (type: string, record: LeaveRequest) => {
        const info = leaveTypeMap[type] || { text: type, color: 'default' };
        return (
          <>
            <Tag color={info.color}>{info.text}</Tag>
            {record.isSupplementary && <Tag color="gold">Đơn bổ sung</Tag>}
          </>
        );
      }
    },
    {
      title: 'Thời gian nghỉ',
      width: 170,
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
      width: 160,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      width: 180,
      ellipsis: true,
      render: (reason: string) =>
        reason ? (
          <Tooltip title={reason}>
            <span style={REASON_ELLIPSIS_STYLE}>{reason}</span>
          </Tooltip>
        ) : '-'
    },
    {
      title: 'Ngày xoá',
      width: 150,
      render: (_: any, record: LeaveRequest) => record.deletedAt ? dayjs(record.deletedAt).format('DD/MM/YYYY HH:mm') : '-'
    },
    {
      title: 'Thao tác',
      width: 240,
      render: (_: any, record: LeaveRequest) => (
        <Space wrap size={[6, 6]}>
          <Button size="small" icon={<UndoOutlined />} onClick={() => handleSelfRestore(record)}>
            Khôi phục
          </Button>
          <Button size="small" danger icon={<DeleteRowOutlined />} onClick={() => handleSelfHardDelete(record)}>
            Xoá vĩnh viễn
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">📅 Đơn nghỉ phép của tôi</h1>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          Tạo đơn mới
        </Button>
      </div>

      <Tabs
        defaultActiveKey="my"
        type="card"
        className="bg-white p-4 rounded-lg shadow-sm"
        onChange={(key) => {
          // Tab "Thùng rác" chỉ fetch LẦN ĐẦU khi thực sự mở (lazy) - mirror
          // ĐÚNG pattern `trashTabLoaded` ở duyet-phep/page.tsx.
          if (key === 'trash' && !trashTabLoaded) {
            setTrashTabLoaded(true);
            fetchMyTrash(1, trashWeeksPerPage);
          }
        }}
        items={[
          {
            key: 'my',
            label: (
              <span>
                <CalendarOutlined />
                {' '}Đơn của tôi
              </span>
            ),
            children: (
              <>
                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                  <Col xs={24} sm={12} md={6}>
                    <Input
                      allowClear
                      placeholder="Tìm theo lý do..."
                      prefix={<SearchOutlined />}
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                    />
                  </Col>
                  <Col xs={12} sm={6} md={4}>
                    <Select
                      allowClear
                      placeholder="Loại phép"
                      style={{ width: '100%' }}
                      value={filterLeaveType}
                      onChange={(v) => setFilterLeaveType(v ?? null)}
                      options={leaveTypeOptions}
                    />
                  </Col>
                  <Col xs={12} sm={6} md={4}>
                    <Select
                      allowClear
                      placeholder="Trạng thái"
                      style={{ width: '100%' }}
                      value={filterStatus}
                      onChange={(v) => setFilterStatus(v ?? null)}
                      options={Object.entries(STATUS_MAP).map(([code, s]) => ({
                        value: code,
                        label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.text}</Tag>,
                      }))}
                    />
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <RangePicker
                      style={{ width: '100%' }}
                      format="DD/MM/YYYY"
                      placeholder={['Từ ngày', 'Đến ngày']}
                      value={filterDateRange as any}
                      onChange={(vals) => setFilterDateRange(vals as [Dayjs | null, Dayjs | null] | null)}
                    />
                  </Col>
                </Row>

                <WeeklyLazySection<LeaveRequest>
                  weeks={weeks}
                  fetchWeek={fetchWeek}
                  resetKey={fetchToken}
                  rowKey="id"
                  columns={columns as any}
                  scroll={{ x: sumColumnWidths(columns) }}
                  size="small"
                  isMobile={isMobile}
                  loading={loading}
                  emptyText="Chưa có đơn nghỉ phép nào"
                  renderMobileCard={(record) => (
                    <MyLeaveMobileCard
                      key={record.id}
                      record={record}
                      onCancel={handleCancel}
                      onSelfDelete={handleSelfDelete}
                      leaveTypeMap={leaveTypeMap}
                    />
                  )}
                  pagination={{
                    current: page,
                    pageSize: weeksPerPage,
                    total: totalWeeks,
                    pageSizeOptions: ['2', '4', '8'],
                    showTotal: (t) => `${t} tuần (${total.toLocaleString()} đơn)`,
                    onChange: (p, ps) => {
                      setPage(p);
                      setWeeksPerPage(ps || weeksPerPage);
                      fetchRequests(p, ps || weeksPerPage);
                    },
                  }}
                />
              </>
            ),
          },
          {
            key: 'trash',
            label: (
              <span>
                <DeleteOutlined />
                {' '}Thùng rác{' '}
                {trashTabLoaded && trashTotal > 0 && (
                  <Badge count={trashTotal} offset={[10, -5]} size="small" />
                )}
              </span>
            ),
            children: (
              <>
                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                  <Col xs={24} sm={12} md={8}>
                    <Input
                      allowClear
                      placeholder="Tìm theo lý do..."
                      prefix={<SearchOutlined />}
                      value={trashSearch}
                      onChange={(e) => setTrashSearch(e.target.value)}
                    />
                  </Col>
                </Row>

                <WeeklyLazySection<LeaveRequest>
                  weeks={trashWeeks}
                  fetchWeek={fetchWeekMyTrash}
                  resetKey={trashFetchToken}
                  rowKey="id"
                  columns={trashColumns as any}
                  scroll={{ x: sumColumnWidths(trashColumns) }}
                  size="small"
                  isMobile={isMobile}
                  loading={trashLoading}
                  emptyText="🗑️ Thùng rác trống"
                  renderMobileCard={(record) => (
                    <MyTrashMobileCard
                      key={record.id}
                      record={record}
                      onRestore={handleSelfRestore}
                      onHardDelete={handleSelfHardDelete}
                      leaveTypeMap={leaveTypeMap}
                    />
                  )}
                  pagination={{
                    current: trashPage,
                    pageSize: trashWeeksPerPage,
                    total: trashTotalWeeks,
                    pageSizeOptions: ['2', '4', '8'],
                    showTotal: (t) => `${t} tuần (${trashTotal.toLocaleString()} đơn)`,
                    onChange: (p, ps) => {
                      setTrashPage(p);
                      setTrashWeeksPerPage(ps || trashWeeksPerPage);
                      fetchMyTrash(p, ps || trashWeeksPerPage);
                    },
                  }}
                />
              </>
            ),
          },
        ]}
      />

      {/* Create Modal */}
      <Modal
        title="Tạo đơn nghỉ phép"
        open={modalOpen}
        onCancel={closeModal}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateRequest}
        >
          <Form.Item
            name="leaveType"
            label="Loại phép"
            rules={[{ required: true, message: 'Vui lòng chọn loại phép' }]}
          >
            <Select
              placeholder="Chọn loại phép"
              options={leaveTypeOptions}
            />
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="Thời gian nghỉ"
            rules={[{ required: true, message: 'Vui lòng chọn thời gian' }]}
          >
            {/* ⚠️ MỚI - cho phép chọn Ngày bắt đầu ở QUÁ KHỨ (trước đây bị
              disabledDate chặn cứng < hôm nay) - phục vụ case "Nghỉ phép Bổ
              sung" (xem is_supplementary ở entity/migration): User quên tạo
              đơn trước ngày nghỉ, giờ vào tạo bù. KHÔNG còn disabledDate -
              cảnh báo bằng modal.confirm ở onChange thay vì chặn hẳn ở UI,
              để User biết trước hậu quả (đơn sẽ bị đánh dấu "Đơn bổ sung")
              nhưng vẫn được chọn tiếp nếu đúng ý. */}
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              onChange={handleDateRangeChange}
            />
          </Form.Item>

          <Form.Item
            name="duration"
            label="Thời lượng"
            initialValue="full_day"
          >
            <Select
              options={[
                { value: 'full_day', label: 'Cả ngày' },
                { value: 'half_day_am', label: 'Nửa ngày (Sáng)' },
                { value: 'half_day_pm', label: 'Nửa ngày (Chiều)' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="periodHours"
            label="Khung giờ (Period Hours) - Không bắt buộc"
            extra="Nếu cần nghỉ theo khung giờ cụ thể trong ngày (vd 14:00 - 17:00), chọn cả Từ giờ và Đến giờ. Bỏ trống nếu không cần."
          >
            <TimeRangePicker
              style={{ width: '100%' }}
              format="HH:mm"
              minuteStep={15}
              placeholder={['Từ giờ', 'Đến giờ']}
              allowEmpty={[true, true]}
            />
          </Form.Item>

          <Form.Item
            name="reason"
            label="Lý do"
            rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}
          >
            <TextArea rows={4} placeholder="Nhập lý do xin nghỉ phép..." />
          </Form.Item>

          <Form.Item
            label="Ảnh đính kèm (nếu có)"
            extra={!selectedLeaveType ? 'Chọn Loại phép trước để có thể đính kèm ảnh' : undefined}
          >
            <AttachmentUploader
              key={attachmentUploaderKey}
              ref={attachmentUploaderRef}
              leaveType={selectedLeaveType}
            />
          </Form.Item>

          <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
            <Button onClick={closeModal} disabled={submitting}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>Tạo đơn</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}