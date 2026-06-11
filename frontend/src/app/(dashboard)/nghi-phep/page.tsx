'use client';

import { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Select, DatePicker, Input, Tag, Space, App, Card, Divider, Typography
} from 'antd';
import { PlusOutlined, CloseCircleOutlined, CalendarOutlined, FileTextOutlined, UserOutlined } from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest } from '@/lib/api/leave-requests.api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Text } = Typography;

const LEAVE_TYPE_MAP: Record<string, { text: string; color: string }> = {
  annual: { text: 'Phép năm', color: 'blue' },
  sick: { text: 'Nghỉ ốm', color: 'orange' },
  maternity: { text: 'Thai sản', color: 'pink' },
  unpaid: { text: 'Không lương', color: 'default' },
  compensatory: { text: 'Nghỉ bù', color: 'green' }
};

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: 'Chờ duyệt', color: 'gold' },
  approved: { text: 'Đã duyệt', color: 'green' },
  rejected: { text: 'Từ chối', color: 'red' },
  cancelled: { text: 'Đã hủy', color: 'default' }
};

// ── Mobile Card ──────────────────────────────────────────────────────────────
function MyLeaveMobileCard({
  record,
  onCancel,
}: {
  record: LeaveRequest;
  onCancel: (id: number) => void;
}) {
  const lt = LEAVE_TYPE_MAP[record.leaveType] || { text: record.leaveType, color: 'default' };
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
  const [isMobile, setIsMobile] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await leaveRequestsApi.getAll();
      setRequests(data);
    } catch (err) {
      message.error('Không thể tải danh sách đơn nghỉ phép');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (values: any) => {
    try {
      const [startDate, endDate] = values.dateRange;

      await leaveRequestsApi.create({
        leaveType: values.leaveType,
        startDate: startDate.format('YYYY-MM-DD'),
        endDate: endDate.format('YYYY-MM-DD'),
        duration: values.duration,
        reason: values.reason
      });

      message.success('Tạo đơn nghỉ phép thành công');
      setModalOpen(false);
      form.resetFields();
      fetchRequests();
    } catch (err: any) {
      message.error(err.message || 'Tạo đơn thất bại');
    }
  };

  const handleCancel = async (id: number) => {
    Modal.confirm({
      title: 'Hủy đơn nghỉ phép?',
      content: 'Bạn chắc chắn muốn hủy đơn này?',
      onOk: async () => {
        try {
          await leaveRequestsApi.cancel(id);
          message.success('Đã hủy đơn');
          fetchRequests();
        } catch (err) {
          message.error('Hủy đơn thất bại');
        }
      }
    });
  };

  const columns = [
    {
      title: 'Loại phép',
      dataIndex: 'leaveType',
      render: (type: string) => {
        const info = LEAVE_TYPE_MAP[type] || { text: type, color: 'default' };
        return <Tag color={info.color}>{info.text}</Tag>;
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
      title: 'Lý do',
      dataIndex: 'reason',
      ellipsis: true
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

      {isMobile ? (
        requests.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#8c8c8c' }}>
            Chưa có đơn nghỉ phép nào
          </div>
        ) : (
          requests.map(r => (
            <MyLeaveMobileCard
              key={r.id}
              record={r}
              onCancel={handleCancel}
            />
          ))
        )
      ) : (
        <Table
          columns={columns}
          dataSource={requests}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      )}

      {/* Create Modal */}
      <Modal
        title="Tạo đơn nghỉ phép"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
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
            <Select placeholder="Chọn loại phép">
              <Select.Option value="annual">Phép năm</Select.Option>
              <Select.Option value="sick">Nghỉ ốm</Select.Option>
              <Select.Option value="maternity">Thai sản</Select.Option>
              <Select.Option value="unpaid">Không lương</Select.Option>
              <Select.Option value="compensatory">Nghỉ bù</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="Thời gian nghỉ"
            rules={[{ required: true, message: 'Vui lòng chọn thời gian' }]}
          >
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              disabledDate={(current) => current && current < dayjs().startOf('day')}
            />
          </Form.Item>

          <Form.Item
            name="duration"
            label="Thời lượng"
            initialValue="full_day"
          >
            <Select>
              <Select.Option value="full_day">Cả ngày</Select.Option>
              <Select.Option value="half_day_am">Nửa ngày (Sáng)</Select.Option>
              <Select.Option value="half_day_pm">Nửa ngày (Chiều)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="reason"
            label="Lý do"
            rules={[{ required: true, message: 'Vui lòng nhập lý do' }]}
          >
            <TextArea rows={4} placeholder="Nhập lý do xin nghỉ phép..." />
          </Form.Item>

          <div className="flex justify-end gap-2" style={{ marginTop: 16 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit">Tạo đơn</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
