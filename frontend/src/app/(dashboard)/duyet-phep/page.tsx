'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Modal, Input, Tag, Space, Badge, App } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest } from '@/lib/api/leave-requests.api';
import dayjs from 'dayjs';

const { TextArea } = Input;

export default function ApprovalPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const { message } = App.useApp();
  
  useEffect(() => {
    fetchPendingRequests();
  }, []);
  
  const fetchPendingRequests = async () => {
    setLoading(true);
    try {
      const data = await leaveRequestsApi.getPending();
      setRequests(data);
    } catch (err) {
      message.error('Không thể tải danh sách đơn chờ duyệt');
    } finally {
      setLoading(false);
    }
  };
  
  const handleApprove = async (id: number) => {
    Modal.confirm({
      title: 'Duyệt đơn nghỉ phép?',
      content: 'Xác nhận duyệt đơn này?',
      onOk: async () => {
        try {
          await leaveRequestsApi.approve(id);
          message.success('Đã duyệt đơn');
          fetchPendingRequests();
        } catch (err: any) {
          message.error(err.message || 'Duyệt đơn thất bại');
        }
      }
    });
  };
  
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      message.warning('Vui lòng nhập lý do từ chối');
      return;
    }
    
    try {
      await leaveRequestsApi.reject(selectedRequest!, rejectionReason);
      message.success('Đã từ chối đơn');
      setRejectModalOpen(false);
      setRejectionReason('');
      setSelectedRequest(null);
      fetchPendingRequests();
    } catch (err) {
      message.error('Từ chối đơn thất bại');
    }
  };
  
  const columns = [
    {
      title: 'Nhân viên',
      dataIndex: ['requester', 'name'],
      render: (name: string, record: LeaveRequest) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{record.requester.email}</div>
        </div>
      )
    },
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
      title: 'Thời gian',
      render: (_: any, record: LeaveRequest) => (
        <div>
          <div>{dayjs(record.startDate).format('DD/MM/YYYY')}</div>
          <div style={{ fontSize: 12, color: '#888' }}>
            đến {dayjs(record.endDate).format('DD/MM/YYYY')}
          </div>
          <div style={{ fontSize: 12, color: '#1890ff' }}>{record.totalDays} ngày</div>
        </div>
      )
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      ellipsis: true
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'createdAt',
      render: (date: string) => dayjs(date).format('DD/MM HH:mm')
    },
    {
      title: 'Thao tác',
      render: (_: any, record: LeaveRequest) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            onClick={() => handleApprove(record.id)}
          >
            Duyệt
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            onClick={() => {
              setSelectedRequest(record.id);
              setRejectModalOpen(true);
            }}
          >
            Từ chối
          </Button>
        </Space>
      )
    }
  ];
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold" style={{ display: 'flex', alignItems: 'center' }}>
          ✅ Duyệt đơn nghỉ phép
          {requests.length > 0 && (
            <Badge count={requests.length} style={{ marginLeft: 16 }} />
          )}
        </h1>
      </div>
      
      <Table
        columns={columns}
        dataSource={requests}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{
          emptyText: (
            <div style={{ padding: '32px 0', color: '#888' }}>
              ✅ Không có đơn chờ duyệt
            </div>
          )
        }}
      />
      
      {/* Reject Modal */}
      <Modal
        title="Từ chối đơn nghỉ phép"
        open={rejectModalOpen}
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
