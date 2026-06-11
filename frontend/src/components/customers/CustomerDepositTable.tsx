'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Typography, Popconfirm, App, Card } from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { customersApi } from '@/lib/api/customers.api';
import { Deposit } from '@/lib/types/customer.types';
import dayjs from 'dayjs';

const { Text } = Typography;

interface Props {
  customerId: number;
  refreshTrigger?: number;
}

export const CustomerDepositTable = ({ customerId, refreshTrigger }: Props) => {
  const [loading, setLoading] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const { message } = App.useApp();

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Sàn: {record.broker || '-'} | Tạo bởi: {record.createdBy?.name || 'Hệ thống'}
              </Text>
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
            </div>
          </Card>
        ))
      )}
    </div>
  );
};
