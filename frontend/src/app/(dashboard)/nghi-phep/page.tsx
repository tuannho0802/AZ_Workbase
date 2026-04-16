'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Select, DatePicker, Input, Tag, Space, App } from 'antd';
import { PlusOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest } from '@/lib/api/leave-requests.api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

export default function LeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  
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
        const typeMap: Record<string, { text: string; color: string }> = {
          annual: { text: 'Phép năm', color: 'blue' },
          sick: { text: 'Nghỉ ốm', color: 'orange' },
          maternity: { text: 'Thai sản', color: 'pink' },
          unpaid: { text: 'Không lương', color: 'default' },
          compensatory: { text: 'Nghỉ bù', color: 'green' }
        };
        const info = typeMap[type] || { text: type, color: 'default' };
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
        const statusMap: Record<string, { text: string; color: string }> = {
          pending: { text: 'Chờ duyệt', color: 'gold' },
          approved: { text: 'Đã duyệt', color: 'green' },
          rejected: { text: 'Từ chối', color: 'red' },
          cancelled: { text: 'Đã hủy', color: 'default' }
        };
        const info = statusMap[status] || { text: status, color: 'default' };
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
      
      <Table
        columns={columns}
        dataSource={requests}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
      
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
