'use client';

import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Typography, Popconfirm, App } from 'antd';
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

  const columns = [
    {
      title: 'Ngày nạp',
      dataIndex: 'depositDate',
      key: 'depositDate',
      render: (date: string) => dayjs(date).format('DD/MM/YYYY'),
    },
    {
      title: 'Số tiền',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <Text strong style={{ color: '#cf1322' }}>
          ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      title: 'Sàn',
      dataIndex: 'broker',
      key: 'broker',
      render: (text: string) => text || '-',
    },
    {
      title: 'Người tạo',
      dataIndex: ['createdByUser', 'name'],
      key: 'createdBy',
      render: (name: string) => name || 'Hệ thống',
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 80,
      render: (_: any, record: Deposit) => (
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
      ),
    },
  ];

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
      <Table
        dataSource={deposits}
        columns={columns}
        rowKey="id"
        pagination={false}
        loading={loading}
        size="small"
        bordered
      />
    </div>
  );
};
