'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Modal, Input, Tag, Space, Badge, Tabs, message, App } from 'antd';
import { CheckOutlined, CloseOutlined, HistoryOutlined, HourglassOutlined } from '@ant-design/icons';
import { leaveRequestsApi, LeaveRequest } from '@/lib/api/leave-requests.api';
import dayjs from 'dayjs';

const { TextArea } = Input;

export default function ApprovalPage() {
  const [pendingRequests, setPendingRequests] = useState<LeaveRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  
  // Antd Hooks to fix "Static function" warning
  const { message: messageApi, modal } = App.useApp();
  
  useEffect(() => {
    fetchAllData();
  }, []);
  
  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [pending, history] = await Promise.all([
        leaveRequestsApi.getPending(),
        leaveRequestsApi.getHistory()
      ]);
      setPendingRequests(pending);
      setHistoryRequests(history);
    } catch (err) {
      messageApi.error('Không thể tải danh sách đơn nghỉ phép');
    } finally {
      setLoading(false);
    }
  };
  
  const handleApprove = async (id: number) => {
    modal.confirm({
      title: 'Duyệt đơn nghỉ phép?',
      content: 'Xác nhận duyệt đơn này?',
      onOk: async () => {
        try {
          await leaveRequestsApi.approve(id);
          messageApi.success('Đã duyệt đơn');
          fetchAllData();
        } catch (err: any) {
          messageApi.error(err.response?.data?.message || 'Duyệt đơn thất bại');
        }
      }
    });
  };
  
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      messageApi.warning('Vui lòng nhập lý do từ chối');
      return;
    }
    
    try {
      await leaveRequestsApi.reject(selectedRequest!, rejectionReason);
      messageApi.success('Đã từ chối đơn');
      setRejectModalOpen(false);
      setRejectionReason('');
      setSelectedRequest(null);
      fetchAllData();
    } catch (err) {
      messageApi.error('Từ chối đơn thất bại');
    }
  };
  
  // Shared Columns
  const commonColumns = [
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
    }
  ];

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
    ...commonColumns.slice(1), // Loại phép, Thời gian, Lý do
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
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          approved: { text: 'Đã duyệt', color: 'success' },
          rejected: { text: 'Từ chối', color: 'error' },
          cancelled: { text: 'Đã hủy', color: 'default' }
        };
        const info = statusMap[status] || { text: status, color: 'default' };
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
      render: (reason: string) => reason ? <span style={{ color: '#f5222d', fontStyle: 'italic' }}>{reason}</span> : '-'
    }
  ];
  
  const tabItems = [
    {
      key: 'pending',
      label: (
        <span>
          <HourglassOutlined />
          Chờ phê duyệt {pendingRequests.length > 0 && <Badge count={pendingRequests.length} offset={[10, -5]} size="small" />}
        </span>
      ),
      children: (
        <Table
          columns={pendingColumns}
          dataSource={pendingRequests}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{ emptyText: '✅ Không có đơn chờ duyệt' }}
        />
      )
    },
    {
      key: 'history',
      label: (
        <span>
          <HistoryOutlined />
          Lịch sử phê duyệt
        </span>
      ),
      children: (
        <Table
          columns={historyColumns}
          dataSource={historyRequests}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có lịch sử xử lý' }}
        />
      )
    }
  ];
  
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
