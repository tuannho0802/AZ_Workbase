'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Space, Typography, Popconfirm, App, Card, Input } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { customersApi } from '@/lib/api/customers.api';
import { Withdrawal } from '@/lib/types/customer.types';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { toastApiError } from '@/lib/utils/error-message.util';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;

// Khớp @MaxLength ở backend/src/modules/customers/dto/update-withdrawal-note.dto.ts
const NOTE_MAX_LENGTH = 1000;

interface Props {
  customerId: number;
  refreshTrigger?: number;
  /** Gọi sau khi XOÁ phiếu thành công để cha cập nhật 3 chỉ số tài chính. */
  onChanged?: () => void;
}

export const CustomerWithdrawalTable = ({ customerId, refreshTrigger, onChanged }: Props) => {
  const [loading, setLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const { message } = App.useApp();
  const { can } = useMyPermissions();
  // Dùng lại key đã seed (KHÔNG permission/migration mới): xoá phiếu = customers.delete, sửa ghi chú = customers.edit.
  const canDelete = can('customers.delete');
  const canEditNote = can('customers.edit');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const fetchSeqRef = useRef(0); // chỉ áp dụng response của lần fetch MỚI NHẤT

  const fetchWithdrawals = useCallback(async () => {
    if (!customerId) return;
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    try {
      const data = await customersApi.getCustomerWithdrawals(customerId);
      if (seq === fetchSeqRef.current) setWithdrawals(data);
    } catch (error) {
      if (seq === fetchSeqRef.current) toastApiError(message, error, 'Lỗi khi lấy danh sách rút tiền');
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [customerId, message]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals, refreshTrigger]);

  const startEdit = (record: Withdrawal) => {
    setEditingId(record.id);
    setEditValue(record.note || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (id: number) => {
    if (editSaving) return; // chống bấm đúp
    setEditSaving(true);
    try {
      const trimmed = editValue.trim();
      const updated = await customersApi.updateWithdrawalNote(id, trimmed);
      setWithdrawals((prev) => prev.map((w) => (w.id === id ? { ...w, ...updated } : w)));
      message.success(trimmed ? 'Đã cập nhật ghi chú rút' : 'Đã xóa ghi chú rút');
      cancelEdit();
    } catch (error) {
      toastApiError(message, error, 'Lỗi khi sửa ghi chú rút');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await customersApi.deleteWithdrawal(id);
      message.success('Đã xóa phiếu rút tiền');
      fetchWithdrawals();
      onChanged?.();
    } catch (error) {
      toastApiError(message, error, 'Lỗi khi xóa phiếu rút');
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text strong>Phiếu rút gần nhất (tối đa 50)</Text>
        <Button type="text" icon={<ReloadOutlined />} onClick={fetchWithdrawals} loading={loading} size="small">
          Làm mới
        </Button>
      </div>

      {loading && withdrawals.length === 0 ? (
        <div style={{ padding: '16px 0', textAlign: 'center', color: '#8c8c8c' }}>Đang tải...</div>
      ) : withdrawals.length === 0 ? (
        <div style={{ padding: '16px 0', textAlign: 'center', color: '#8c8c8c' }}>Chưa có giao dịch rút tiền</div>
      ) : (
        withdrawals.map((record) => (
          <Card key={record.id} size="small" variant="outlined" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text strong>{dayjs(record.withdrawalDate).format('DD/MM/YYYY')}</Text>
              <Text strong style={{ color: '#d46b08' }}>
                -${Number(record.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
            </div>
            {editingId === record.id ? (
              <div style={{ marginBottom: 6 }}>
                <Input.TextArea
                  autoFocus
                  rows={2}
                  maxLength={NOTE_MAX_LENGTH}
                  showCount
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Ghi chú rút (để trống = xóa ghi chú)"
                />
                <Space size={4} style={{ marginTop: 6 }}>
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={editSaving}
                    onClick={() => saveEdit(record.id)}
                  >
                    Lưu
                  </Button>
                  <Button size="small" icon={<CloseOutlined />} disabled={editSaving} onClick={cancelEdit}>
                    Hủy
                  </Button>
                </Space>
              </div>
            ) : record.note ? (
              <Paragraph
                style={{
                  margin: '0 0 6px',
                  padding: '4px 8px',
                  background: '#fafafa',
                  borderRadius: 4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
                ellipsis={{ rows: 2, expandable: true, symbol: 'Xem thêm' }}
              >
                📝 {record.note}
              </Paragraph>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sàn: {record.broker || '-'} | Tạo bởi: {record.createdBy?.name || 'Hệ thống'}
              </Text>
              <Space size={0}>
                {canEditNote && editingId !== record.id && (
                  <Button
                    type="text"
                    size="small"
                    icon={record.note ? <EditOutlined /> : <PlusOutlined />}
                    onClick={() => startEdit(record)}
                    title={record.note ? 'Sửa ghi chú' : 'Thêm ghi chú'}
                  >
                    {record.note ? null : 'Ghi chú'}
                  </Button>
                )}
                {canDelete && (
                  <Popconfirm
                    title="Xóa phiếu rút"
                    description="Bạn có chắc chắn muốn xóa phiếu rút tiền này?"
                    onConfirm={() => handleDelete(record.id)}
                    okText="Xóa"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} size="small" title="Xóa phiếu rút" />
                  </Popconfirm>
                )}
              </Space>
            </div>
          </Card>
        ))
      )}
    </div>
  );
};
