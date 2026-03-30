import React, { useState, useEffect } from 'react';
import { Modal, Select, Button, notification, message } from 'antd';
import axiosInstance from '@/lib/api/axios-instance';

interface BulkAssignModalProps {
  open: boolean;
  selectedIds: number[];
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkAssignModal: React.FC<BulkAssignModalProps> = ({ open, selectedIds, onClose, onSuccess }) => {
  const [salesUsers, setSalesUsers] = useState<any[]>([]);
  const [salesId, setSalesId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (open) {
      setSalesId(null);
      fetchSalesUsers();
    }
  }, [open]);

  const fetchSalesUsers = async () => {
    setFetching(true);
    try {
      const res = await axiosInstance.get('/users?role=employee');
      setSalesUsers(res.data);
    } catch (e) {
      message.error('Không lấy được danh sách nhân viên Sales');
    } finally {
      setFetching(false);
    }
  };

  const handleAssign = async () => {
    if (!salesId) return;
    setLoading(true);
    try {
      const payload = { customerIds: selectedIds, salesUserId: salesId };
      const res = await axiosInstance.patch('/customers/bulk-assign', payload);
      const data = res.data;
      
      const salesName = salesUsers.find(u => u.id === salesId)?.name || 'Nhân viên';
      notification.success({ message: `✅ Đã gán ${data.updatedCount} khách hàng cho ${salesName}` });
      if (data.skippedIds && data.skippedIds.length > 0) {
        notification.warning({ message: `⚠️ ${data.skippedIds.length} khách hàng không thể gán (không đủ quyền)` });
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      notification.error({ message: 'Lỗi gán khách hàng', description: e.response?.data?.message || 'Có lỗi xảy ra' });
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
        <Button key="submit" type="primary" loading={loading} disabled={!salesId || selectedIds.length === 0} onClick={handleAssign}>Xác nhận gán</Button>
      ]}
    >
      <div className="mb-4">
        Bạn đang gán <strong>{selectedIds.length}</strong> khách hàng đã chọn.
      </div>
      <Select
        showSearch
        style={{ width: '100%' }}
        placeholder="Tìm kiếm nhân viên..."
        loading={fetching}
        options={salesUsers.map(u => ({ label: `${u.name}`, value: u.id }))}
        value={salesId}
        onChange={val => setSalesId(val)}
        filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      />
    </Modal>
  );
};
