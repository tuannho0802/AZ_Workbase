import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, App } from 'antd';
import axiosInstance from '@/lib/api/axios-instance';
import { SalesUserSelect } from './SalesUserSelect';

interface BulkAssignModalProps {
  open: boolean;
  selectedRowKeys: React.Key[];
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkAssignModal: React.FC<BulkAssignModalProps> = ({ open, selectedRowKeys = [], onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const salesId = selectedUser?.id || null;
  useEffect(() => {
    if (open) {
      setSelectedUser(null);
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
      
      const salesName = selectedUser?.name || 'Nhân viên';
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
      <SalesUserSelect
        value={salesId}
        onChange={(id, user) => setSelectedUser(user)}
      />
    </Modal>
  );
};
