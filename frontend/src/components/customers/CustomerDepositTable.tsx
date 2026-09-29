'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Space, Typography, Popconfirm, App, Card, Input } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { customersApi } from '@/lib/api/customers.api';
import { Deposit } from '@/lib/types/customer.types';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import dayjs from 'dayjs';

const { Text, Paragraph } = Typography;

// Khớp @MaxLength ở backend/src/modules/customers/dto/update-deposit-note.dto.ts
const NOTE_MAX_LENGTH = 1000;

interface Props {
  customerId: number;
  refreshTrigger?: number;
}

export const CustomerDepositTable = ({ customerId, refreshTrigger }: Props) => {
  const [loading, setLoading] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const { message } = App.useApp();
  const { can } = useMyPermissions();
  // ⚠️ FIX BUG THẬT (rà soát permission 2026-09): comment cũ ghi
  // "@Roles(Role.ADMIN)" - ĐÃ STALE, BE thực tế dùng
  // @RequirePermission('customers.delete') động (xem
  // customers.controller.ts `deleteDeposit`) - CÙNG permission key với nút
  // xoá khách hàng ở chia-data/page.tsx. Trước đây FE hardcode
  // role==='admin' khiến nút Xoá không hiện cho role tuỳ chỉnh dù Admin đã
  // cấp customers.delete qua trang Phân quyền.
  const canDelete = can('customers.delete');
  // Sửa GHI CHÚ phiếu nạp dùng lại `customers.edit` (cùng key với tạo phiếu nạp,
  // KHÔNG permission key mới/migration). Số tiền cố định - không có UI sửa số tiền.
  const canEditNote = can('customers.edit');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const fetchDeposits = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const data = await customersApi.getCustomerDeposits(customerId);
      setDeposits(data);
    } catch (error: any) {
      message.error('Lỗi khi lấy danh sách nạp tiền');
    } finally {
      setLoading(false);
    }
  }, [customerId, message]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits, refreshTrigger]);

  const startEdit = (record: Deposit) => {
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
      const updated = await customersApi.updateDepositNote(id, trimmed);
      // Dùng response của PATCH để cập nhật NGAY tại chỗ (không chờ refetch)
      setDeposits((prev) => prev.map((d) => (d.id === id ? { ...d, ...updated } : d)));
      message.success(trimmed ? 'Đã cập nhật ghi chú nạp' : 'Đã xóa ghi chú nạp');
      cancelEdit();
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Lỗi khi sửa ghi chú nạp'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await customersApi.deleteDeposit(id);
      message.success('Đã xóa bản ghi nạp tiền');
      fetchDeposits();
    } catch (error: any) {
      message.error('Lỗi khi xóa bản ghi');
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text strong>5 Giao dịch gần nhất</Text>
        <Button 
          type="text" 
          icon={<ReloadOutlined />} 
          onClick={fetchDeposits} 
          loading={loading}
          size="small"
        >
          Làm mới
        </Button>
      </div>
      
      {loading && deposits.length === 0 ? (
        <div style={{ padding: '16px 0', textAlign: 'center', color: '#8c8c8c' }}>
          Đang tải...
        </div>
      ) : deposits.length === 0 ? (
        <div style={{ padding: '16px 0', textAlign: 'center', color: '#8c8c8c' }}>
          Chưa có giao dịch nạp tiền
        </div>
      ) : (
        deposits.map((record) => (
          <Card
            key={record.id}
            size="small"
            variant="outlined"
            style={{ marginBottom: 8 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text strong>{dayjs(record.depositDate).format('DD/MM/YYYY')}</Text>
              <Text strong style={{ color: '#cf1322' }}>
                ${Number(record.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                  placeholder="Ghi chú nạp (để trống = xóa ghi chú)"
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
                  title="Xóa bản ghi"
                  description="Bạn có chắc chắn muốn xóa bản ghi nạp tiền này?"
                  onConfirm={() => handleDelete(record.id)}
                  okText="Xóa"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                >
                  <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    size="small"
                  />
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