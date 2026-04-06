'use client';

import { useState } from 'react';
import { Card, Form, Input, Space, Select, Switch, Button, List, Tag, Typography, Empty, App } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { CustomerNote } from '@/lib/types/customer.types';
import { customersApi } from '@/lib/api/customers.api';
import dayjs from 'dayjs';

const { Text } = Typography;

interface Props {
  customerId: number;
  notes: CustomerNote[];
  onNoteAdded: () => void;
}

export const CustomerNotesTab = ({ customerId, notes, onNoteAdded }: Props) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      await customersApi.createNote(customerId, values);
      message.success('Đã thêm ghi chú');
      form.resetFields();
      onNoteAdded();
    } catch (error) {
      message.error('Lỗi khi thêm ghi chú');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '0px 8px' }}>
      <Card size="small" title="Thêm ghi chú mới" style={{ marginBottom: 16 }}>
        <Form form={form} onFinish={handleSubmit} layout="vertical">
          <Form.Item name="note" rules={[{ required: true, message: 'Vui lòng nhập nội dung' }]}>
            <Input.TextArea placeholder="Nhập ghi chú quan trọng..." rows={3} />
          </Form.Item>
          <Space>
            <Form.Item name="noteType" initialValue="general" style={{ marginBottom: 0 }}>
              <Select style={{ width: 120 }}>
                <Select.Option value="general">Chung</Select.Option>
                <Select.Option value="call">Cuộc gọi</Select.Option>
                <Select.Option value="meeting">Cuộc họp</Select.Option>
                <Select.Option value="follow_up">Theo dõi</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="isImportant" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren="🔥" unCheckedChildren="Bình thường" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} icon={<PlusOutlined />}>
              Thêm
            </Button>
          </Space>
        </Form>
      </Card>

      <div className="notes-list" style={{ marginTop: 16 }}>
        {notes.length === 0 ? (
          <Empty description="Chưa có ghi chú nào" />
        ) : (
          notes.map((item: CustomerNote) => (
            <div key={item.id} style={{ 
              padding: '12px', 
              borderBottom: '1px solid #f0f0f0',
              backgroundColor: item.isImportant ? '#fff1f0' : 'transparent',
              borderRadius: item.isImportant ? '4px' : '0'
            }}>
              <Space style={{ marginBottom: 4 }}>
                <Text strong>{item.createdByUser?.name || 'Hệ thống'}</Text>
                <Tag color={item.isImportant ? 'error' : 'default'}>{item.noteType}</Tag>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')}
                </Text>
              </Space>
              <div style={{ whiteSpace: 'pre-wrap', color: '#262626', fontSize: '14px' }}>
                {item.note}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};
