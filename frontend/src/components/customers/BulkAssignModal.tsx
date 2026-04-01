import React, { useState, useEffect } from 'react';
import { Modal, Select, Button, notification, message, Form, App } from 'antd';
import axiosInstance from '@/lib/api/axios-instance';
import { useUsersList } from '@/lib/hooks/useUsers';

interface BulkAssignModalProps {
  open: boolean;
  selectedRowKeys: React.Key[];
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkAssignModal: React.FC<BulkAssignModalProps> = ({ open, selectedRowKeys = [], onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const { users: salesUsers, isLoading: usersLoading } = useUsersList('employee');
  const [salesId, setSalesId] = useState<number | null>(null);



  // Debug từng user object
  salesUsers?.forEach((user: any, index: number) => {

  });



  useEffect(() => {
    if (open) {
      setSalesId(null);
    }
  }, [open]);

  const handleAssign = async () => {
    if (!salesId) return;
    setLoading(true);
    try {
      const payload = { 
        customerIds: selectedRowKeys, 
        salesUserId: salesId 
      };
      const res = await axiosInstance.patch('/customers/bulk-assign', payload);
      const data = res.data;
      
      const salesName = salesUsers.find((u: any) => u.id === salesId)?.name || 'Nhân viên';
      message.success(`✅ Đã gán ${data.updatedCount} khách hàng cho ${salesName}`);
      
      onSuccess();
      onClose();
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Lỗi gán khách hàng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Gán khách hàng cho Sales"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>Hủy</Button>,
        <Button key="submit" type="primary" loading={loading} disabled={!salesId || selectedRowKeys.length === 0} onClick={handleAssign}>Xác nhận gán</Button>
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        Bạn đang gán <strong>{selectedRowKeys.length}</strong> khách hàng đã chọn.
      </div>
      <Select
        showSearch
        style={{ width: '100%' }}
        placeholder="Tìm kiếm nhân viên..."
        loading={usersLoading}
        options={salesUsers?.map((u: any) => ({ 
          label: u.name, 
          value: u.id 
        })) || []}
        value={salesId}
        onChange={val => setSalesId(val)}
        filterOption={(input: string, option: any) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      />
    </Modal>
  );
};
