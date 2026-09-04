'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table, Card, Button, Space, Tag, Badge, Tabs, Modal, Input, App, Typography, Divider
} from 'antd';
import {
  CheckOutlined, CloseOutlined, HistoryOutlined, HourglassOutlined,
  UserOutlined, CalendarOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest } from '@/lib/api/leave-requests.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Text } = Typography;

// ── helpers ─────────────────────────────────────────────────────────────────
const LEAVE_TYPE_MAP: Record<string, { text: string; color: string }> = {
  annual:        { text: 'Phép năm',    color: 'blue' },
  sick:          { text: 'Nghỉ ốm',    color: 'orange' },
  maternity:     { text: 'Thai sản',   color: 'pink' },
  unpaid:        { text: 'Không lương',color: 'default' },
  compensatory:  { text: 'Nghỉ bù',   color: 'green' },
};

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  approved:  { text: 'Đã duyệt', color: 'success' },
  rejected:  { text: 'Từ chối',  color: 'error' },
  cancelled: { text: 'Đã hủy',  color: 'default' },
  pending:   { text: 'Chờ duyệt', color: 'processing' },
};

// ── mobile card – pending ────────────────────────────────────────────────────
function PendingMobileCard({
  record,
  onApprove,
  onReject,
}: {
  record: LeaveRequest;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const lt = LEAVE_TYPE_MAP[record.leaveType] ?? { text: record.leaveType, color: 'default' };
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
      </div>
    </Card>
  );
}

// ── mobile card – history ────────────────────────────────────────────────────
function HistoryMobileCard({ record }: { record: LeaveRequest }) {
  const lt = LEAVE_TYPE_MAP[record.leaveType] ?? { text: record.leaveType, color: 'default' };
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

  // Antd Hooks to fix "Static function" warning
  const { message: messageApi, modal } = App.useApp();
  const router = useRouter();
  const { can, isLoading: permissionsLoading } = useMyPermissions();

  // Phân biệt quyền:
  // view = xem lịch sử duyệt (của người khác)
  // approve = xem danh sách chờ + có nút duyệt/từ chối
  const canView = can('leave_requests.view');
  const canApprove = can('leave_requests.approve');

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

  // ── desktop columns ─────────────────────────────────────────────────────
  const pendingColumns = [
    {
      title: 'Người gửi',
      dataIndex: ['requester', 'name'],
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
      render: (date: string) => dayjs(date).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Phòng ban',
      render: (_: any, record: LeaveRequest) => (
        <Tag color="blue">{record.requester.department?.name || 'Chưa gán'}</Tag>
      )
    },
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
      render: (type: string) => {
        const info = LEAVE_TYPE_MAP[type] ?? { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Thời gian',
      render: (_: any, record: LeaveRequest) => (
        <div>
          <div>{dayjs(record.startDate).format('DD/MM/YYYY')}</div>
          <div style={{ fontSize: 12, color: '#888' }}>đến {dayjs(record.endDate).format('DD/MM/YYYY')}</div>
          <div style={{ fontSize: 12, color: '#1890ff' }}>{record.totalDays} ngày</div>
        </div>
      )
    },
    { title: 'Lý do', dataIndex: 'reason', ellipsis: true },
    {
      title: 'Thao tác',
      render: (_: any, record: LeaveRequest) => (
        <Space>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record.id)}>
            Duyệt
          </Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => openRejectModal(record.id)}>
            Từ chối
          </Button>
        </Space>
      )
    }
  ].filter((col: any) => canApprove || col.title !== 'Thao tác');

  const historyColumns = [
    {
      title: 'Người gửi',
      dataIndex: ['requester', 'name'],
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
      render: (date: string) => dayjs(date).format('DD/MM/YYYY')
    },
    {
      title: 'Phòng ban',
      render: (_: any, record: LeaveRequest) => (
        <Tag color="blue">{record.requester.department?.name || 'Chưa gán'}</Tag>
      )
    },
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
      render: (type: string) => {
        const info = LEAVE_TYPE_MAP[type] ?? { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Thời gian',
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
      render: (status: string) => {
        const info = STATUS_MAP[status] ?? { text: status, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
      }
    },
    {
      title: 'Người duyệt',
      dataIndex: ['approver', 'name'],
      render: (name: string) => <b>{name || '-'}</b>
    },
    {
      title: 'Ngày xử lý',
      render: (_: any, record: LeaveRequest) => {
        const date = record.approvedAt || record.rejectedAt;
        return date ? dayjs(date).format('DD/MM/YYYY HH:mm') : '-';
      }
    },
    {
      title: 'Lý do từ chối',
      dataIndex: 'rejectionReason',
      render: (reason: string) =>
        reason ? <span style={{ color: '#f5222d', fontStyle: 'italic' }}>{reason}</span> : '-'
    }
  ];

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
      children: isMobile ? (
        pendingRequests.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
            ✅ Không có đơn chờ duyệt
          </div>
        ) : (
          pendingRequests.map(r => (
            <PendingMobileCard
              key={r.id}
              record={r}
              onApprove={handleApprove}
              onReject={openRejectModal}
            />
          ))
        )
      ) : (
        <Table
          columns={pendingColumns}
          dataSource={pendingRequests}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '✅ Không có đơn chờ duyệt' }}
        />
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
      children: isMobile ? (
        historyRequests.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
            Chưa có lịch sử xử lý
          </div>
        ) : (
          historyRequests.map(r => (
            <HistoryMobileCard key={r.id} record={r} />
          ))
        )
      ) : (
        <Table
          columns={historyColumns}
          dataSource={historyRequests}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có lịch sử xử lý' }}
        />
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
    </div>
  );
}