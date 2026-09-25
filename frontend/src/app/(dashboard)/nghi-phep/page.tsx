'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table, Button, Modal, Form, Select, DatePicker, TimePicker, Input, Tag, App, Card, Divider, Typography, Row, Col, Tooltip
} from 'antd';
import { PlusOutlined, CloseCircleOutlined, CalendarOutlined, ClockCircleOutlined, FileTextOutlined, UserOutlined, SearchOutlined } from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest } from '@/lib/api/leave-requests.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useLeaveTypes } from '@/lib/hooks/useLeaveTypes';
import { AttachmentUploader, AttachmentUploaderHandle } from '@/components/leave-requests/AttachmentUploader';
import { AttachmentsViewerButton } from '@/components/leave-requests/AttachmentsViewerButton';
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

// ── Mobile Card ──────────────────────────────────────────────────────────────
function MyLeaveMobileCard({
  record,
  onCancel,
  leaveTypeMap,
}: {
  record: LeaveRequest;
  onCancel: (id: number) => void;
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
        <Button
          danger
          type="primary"
          size="small"
          icon={<CloseCircleOutlined />}
          style={{ width: '100%', marginTop: 4 }}
          onClick={() => onCancel(record.id)}
        >
          Hủy đơn
        </Button>
      )}
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [attachmentUploaderKey, setAttachmentUploaderKey] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  // Filter: đơn nghỉ của tôi thường không quá nhiều, nên lọc CLIENT-SIDE
  // (BE /leave-requests trả toàn bộ, không phân trang) - đủ nhẹ, không cần
  // thêm query param BE. Trường ít vì đây là dữ liệu CỦA CHÍNH mình (không
  // cần lọc theo người/phòng ban như duyet-phep).
  const [searchText, setSearchText] = useState('');
  const [filterLeaveType, setFilterLeaveType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterDateRange, setFilterDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
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
      fetchRequests();
    }
  }, [canRequest, permissionsLoading]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await leaveRequestsApi.getAll();
      setRequests(data);
    } catch {
      message.error('Không thể tải danh sách đơn nghỉ phép');
    } finally {
      setLoading(false);
    }
  };

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

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (filterLeaveType && r.leaveType !== filterLeaveType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        if (!(r.reason || '').toLowerCase().includes(q)) return false;
      }
      if (filterDateRange && filterDateRange[0] && filterDateRange[1]) {
        const [from, to] = filterDateRange;
        // Đơn "trong khoảng" nếu khoảng nghỉ [startDate,endDate] giao với [from,to]
        const overlap = !dayjs(r.startDate).isAfter(to, 'day') && !dayjs(r.endDate).isBefore(from, 'day');
        if (!overlap) return false;
      }
      return true;
    });
  }, [requests, filterLeaveType, filterStatus, searchText, filterDateRange]);

  const columns = [
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
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
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Đến ngày',
      dataIndex: 'endDate',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Số ngày',
      dataIndex: 'totalDays',
      render: (days: number) => `${days} ngày`
    },
    {
      title: 'Khung giờ',
      render: (_: any, record: LeaveRequest) => {
        const hours = formatPeriodHours(record);
        return hours ? <span style={{ color: '#722ed1' }}>{hours}</span> : '-';
      }
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
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
      render: (status: string) => {
        const info = STATUS_MAP[status] || { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Người duyệt',
      dataIndex: ['approver', 'name'],
      render: (name: string) => name || '-'
    },
    {
      title: 'Lý do từ chối',
      dataIndex: 'rejectionReason',
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
      render: (_: any, record: LeaveRequest) => (
        <AttachmentsViewerButton requestId={record.id} count={record.attachmentCount} />
      )
    },
    {
      title: 'Thao tác',
      render: (_: any, record: LeaveRequest) => (
        record.status === 'pending' && (
          <Button
            type="link"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => handleCancel(record.id)}
          >
            Hủy
          </Button>
        )
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

      {isMobile ? (
        filteredRequests.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
            Chưa có đơn nghỉ phép nào
          </div>
        ) : (
            filteredRequests.map(r => (
            <MyLeaveMobileCard
              key={r.id}
              record={r}
              onCancel={handleCancel}
              leaveTypeMap={leaveTypeMap}
            />
          ))
        )
      ) : (
        <Table
          columns={columns}
            dataSource={filteredRequests}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      )}

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