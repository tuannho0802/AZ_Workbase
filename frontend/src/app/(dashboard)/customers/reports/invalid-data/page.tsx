'use client';

import { useEffect, useState } from 'react';
import { Table, Card, Typography, Select, Space, Button } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { customersApi } from '@/lib/api/customers.api';
import { Customer } from '@/lib/types/customer.types';
import dayjs from 'dayjs';
import { ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export default function InvalidDataReportPage() {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [invalidType, setInvalidType] = useState<string>('future_date');
  
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 20,
    total: 0,
  });

  const fetchData = async (type: string, page: number, limit: number) => {
    setLoading(true);
    try {
      const res = await customersApi.getInvalidDataReport({
        invalidType: type,
        page,
        limit,
      });
      setData(res.data);
      setPagination({
        ...pagination,
        current: res.page,
        total: res.total,
        pageSize: res.limit,
      });
    } catch (error) {
      console.error('Failed to fetch invalid data report:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(invalidType, pagination.current || 1, pagination.pageSize || 20);
  }, [invalidType]); // Refetch when type changes

  const handleTableChange = (newPagination: TablePaginationConfig) => {
    fetchData(invalidType, newPagination.current || 1, newPagination.pageSize || 20);
  };

  const columns: ColumnsType<Customer> = [
    {
      title: 'Khách hàng',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{text || 'Không có tên'}</Text>
          <Text type="secondary" className="text-xs">{record.email}</Text>
        </Space>
      ),
    },
    {
      title: 'Số điện thoại',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'Ngày nhập data',
      dataIndex: 'inputDate',
      key: 'inputDate',
      render: (val) => val ? dayjs(val).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
    },
    {
      title: 'Sales',
      dataIndex: 'salesUser',
      key: 'salesUser',
      render: (_, record) => record.salesUser?.name || '-',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Title level={4} style={{ margin: 0 }}>Báo cáo dữ liệu không hợp lệ</Title>
          <Text type="secondary">Danh sách khách hàng có dữ liệu lỗi, thiếu sót hoặc không hợp lệ</Text>
        </div>
      </div>

      <Card>
        <Space className="mb-4" size="middle">
          <Text strong>Loại lỗi:</Text>
          <Select
            value={invalidType}
            onChange={(val) => {
              setInvalidType(val);
              setPagination(prev => ({ ...prev, current: 1 }));
            }}
            style={{ width: 200 }}
            options={[
              { value: 'future_date', label: 'Ngày nhập lớn hơn hiện tại' },
              { value: 'missing_phone', label: 'Thiếu số điện thoại' },
              { value: 'missing_email', label: 'Thiếu email' },
            ]}
          />
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => fetchData(invalidType, pagination.current || 1, pagination.pageSize || 20)}
          >
            Làm mới
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          pagination={pagination}
          loading={loading}
          onChange={handleTableChange}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}