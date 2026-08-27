import React, { useState, useEffect } from 'react';
import { Modal, Button, Select, Input, Typography, App } from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import axiosInstance from '@/lib/api/axios-instance';
import { usersApi } from '@/lib/api/users.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface BulkAssignModalProps {
  open: boolean;
  selectedRowKeys: React.Key[];
  onClose: () => void;
  onSuccess: () => void;
}

interface UserOption {
  id: number;
  name: string;
  email: string;
}

/**
 * ⚠️ FIX BUG THẬT (phát hiện khi rà lại code): trước đây modal này gửi
 * `{ customerIds, salesUserId: salesId }` (field SỐ ÍT, chỉ 1 sales) - nhưng
 * backend (BulkAssignDto) yêu cầu đúng field `salesUserIds` (SỐ NHIỀU, mảng).
 * ValidationPipe bật `forbidNonWhitelisted: true` nên request cũ này LUÔN bị
 * từ chối 400 - modal này thực chất KHÔNG BAO GIỜ gán được, kể cả cho 1 sales
 * duy nhất. Sửa đồng thời 2 việc: đúng field, và cho phép chọn NHIỀU sales
 * cùng lúc (yêu cầu mới) - dùng chung 1 lần sửa vì cùng chạm code này.
 */
export const BulkAssignModal: React.FC<BulkAssignModalProps> = ({
  open,
  selectedRowKeys = [],
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  const [salesUserIds, setSalesUserIds] = useState<number[]>([]);
  const [reason, setReason] = useState('');

  const { data: users = [], isLoading: loadingUsers } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (open) {
      setSalesUserIds([]);
      setReason('');
    }
  }, [open]);

  const handleAssign = async () => {
    if (salesUserIds.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        customerIds: selectedRowKeys,
        salesUserIds, // ✅ đúng field backend yêu cầu (mảng, không phải salesUserId đơn)
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };
      const res = await axiosInstance.patch('/customers/bulk-assign', payload);

      message.success(
        res.data?.message ||
          `✅ Đã gán ${selectedRowKeys.length} khách hàng cho ${salesUserIds.length} nhân viên`,
      );

      onSuccess();
      onClose();
    } catch (e) {
      message.error(getApiErrorMessage(e, 'Lỗi gán khách hàng'));
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
        <Button key="cancel" onClick={onClose}>
          Hủy
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={<UserAddOutlined />}
          loading={loading}
          disabled={salesUserIds.length === 0 || selectedRowKeys.length === 0}
          onClick={handleAssign}
        >
          Xác nhận gán {salesUserIds.length > 0 ? `cho ${salesUserIds.length} người` : ''}
        </Button>,
      ]}
      destroyOnHidden
    >
      <div style={{ marginBottom: 16 }}>
        Bạn đang gán <Text strong>{selectedRowKeys.length}</Text> khách hàng đã chọn.
      </div>

      <div style={{ marginBottom: 8 }}>
        <Text strong>Chọn Sales nhận data (có thể chọn nhiều):</Text>
      </div>
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        placeholder="Tìm tên hoặc email sales..."
        value={salesUserIds}
        onChange={setSalesUserIds}
        loading={loadingUsers}
        options={users.map((u) => ({ value: u.id, label: u.name || u.email }))}
        showSearch={{
          filterOption: (input, option) => {
            const u = users.find((u) => u.id === option?.value);
            const q = input.toLowerCase();
            return (u?.name?.toLowerCase().includes(q) || u?.email?.toLowerCase().includes(q)) ?? false;
          },
        }}
        maxTagCount="responsive"
      />
      {salesUserIds.length > 1 && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Mỗi khách hàng sẽ được gán cho cả {salesUserIds.length} sales (chia sẻ, không phải chia đều).
        </Text>
      )}

      <div style={{ marginTop: 16, marginBottom: 8 }}>
        <Text strong>Lý do (tuỳ chọn):</Text>
      </div>
      <Input.TextArea
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Vd: Chia data từ batch tháng 4"
      />
    </Modal>
  );
};