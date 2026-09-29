'use client';

import { useState } from 'react';
import { Form, Row, Col, Input, DatePicker, Button, Card, App, InputNumber } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { customersApi } from '@/lib/api/customers.api';

// Khớp @MaxLength ở backend/src/modules/customers/dto/create-deposit.dto.ts
const NOTE_MAX_LENGTH = 1000;

interface Props {
  customerId: number;
  onSuccess: () => void;
}

export const DepositForm = ({ customerId, onSuccess }: Props) => {
  const [form] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);
  const { message } = App.useApp();

  const sanitizeAmount = (value: any): number => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    // Strip $, commas, and spaces
    const cleanValue = String(value).replace(/[\$,\s]/g, '');
    return parseFloat(cleanValue) || 0;
  };

  const handleSubmit = async (values: any) => {
    setSubmitLoading(true);
    try {
      const sanitizedAmount = sanitizeAmount(values.amount);
      
      // Ghi chú nạp (cột `deposits.note`): trim, rỗng -> không gửi (tránh lưu chuỗi '')
      const trimmedNote = typeof values.note === 'string' ? values.note.trim() : '';

      await customersApi.createDeposit(customerId, {
        ...values,
        note: trimmedNote || undefined,
        amount: sanitizedAmount,
        depositDate: values.depositDate.format('YYYY-MM-DD')
      });
      message.success('Đã nạp tiền thành công');
      form.resetFields();
      onSuccess();
    } catch (error: any) {
      console.error('[DEPOSIT ERROR]', error);
      message.error(error.response?.data?.message || 'Lỗi khi nạp tiền');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <Card size="small" title="Nạp thêm tiền (ADMIN/MANAGER)" style={{ marginBottom: 16 }}>
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="amount" label="Số tiền (USD)" rules={[{ required: true, message: 'Nhập số tiền' }]}>
              <InputNumber 
                style={{ width: '100%' }} 
                prefix="$" 
                placeholder="0.00"
                precision={2}
                step={0.01}
                formatter={(value) => value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                parser={(value) => value!.replace(/\$\s?|(,*)/g, '')}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="depositDate" label="Ngày nạp" rules={[{ required: true }]} initialValue={dayjs()}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="broker" label="Sàn giao dịch">
          <Input placeholder="BCR, OEXN..." />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú nạp">
          <Input.TextArea
            rows={2}
            maxLength={NOTE_MAX_LENGTH}
            showCount
            placeholder="Nội dung giao dịch, mã tham chiếu, lưu ý..."
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={submitLoading} block icon={<PlusOutlined />}>
          Xác nhận nạp tiền
        </Button>
      </Form>
    </Card>
  );
};
