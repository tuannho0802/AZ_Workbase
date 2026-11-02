'use client';

import { useRef, useState } from 'react';
import { Form, Row, Col, Input, DatePicker, Button, Card, App, InputNumber } from 'antd';
import { MinusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { customersApi } from '@/lib/api/customers.api';
import { toastApiError } from '@/lib/utils/error-message.util';

// Khớp @MaxLength ở backend/src/modules/customers/dto/create-withdrawal.dto.ts
const NOTE_MAX_LENGTH = 1000;
const BROKER_MAX_LENGTH = 100;
// Khớp @Min/@Max ở create-withdrawal.dto.ts (khai kiểu `number` để parser của InputNumber không bị thu hẹp về literal)
const MIN_AMOUNT: number = 0.01;
const MAX_AMOUNT: number = 999999999.99;

interface WithdrawalFormValues {
  amount: number;
  withdrawalDate: Dayjs;
  broker?: string;
  note?: string;
}

interface Props {
  customerId: number;
  onSuccess: () => void;
}

export const WithdrawalForm = ({ customerId, onSuccess }: Props) => {
  const [form] = Form.useForm<WithdrawalFormValues>();
  const [submitLoading, setSubmitLoading] = useState(false);
  const submittingRef = useRef(false); // chặn bấm đúp (state chưa kịp cập nhật giữa 2 click nhanh)
  const { message } = App.useApp();

  const handleSubmit = async (values: WithdrawalFormValues) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitLoading(true);
    try {
      const note = typeof values.note === 'string' ? values.note.trim() : '';
      const broker = typeof values.broker === 'string' ? values.broker.trim() : '';
      await customersApi.createWithdrawal(customerId, {
        amount: Number(values.amount),
        withdrawalDate: values.withdrawalDate.format('YYYY-MM-DD'),
        broker: broker || undefined,
        note: note || undefined, // rỗng -> không gửi (tránh lưu chuỗi '')
      });
      message.success('Đã ghi nhận rút tiền');
      form.resetFields();
      onSuccess();
    } catch (error) {
      toastApiError(message, error, 'Lỗi khi ghi nhận rút tiền');
    } finally {
      submittingRef.current = false;
      setSubmitLoading(false);
    }
  };

  return (
    <Card size="small" title="Ghi nhận rút tiền" style={{ marginBottom: 16 }}>
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="amount"
              label="Số tiền rút (USD)"
              rules={[{ required: true, message: 'Nhập số tiền' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                prefix="$"
                placeholder="0.00"
                min={MIN_AMOUNT}
                max={MAX_AMOUNT}
                precision={2}
                step={0.01}
                formatter={(value) => (value ? `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
                parser={(value) => Number((value ?? '').replace(/\$\s?|(,*)/g, ''))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="withdrawalDate"
              label="Ngày rút"
              rules={[{ required: true, message: 'Chọn ngày rút' }]}
              initialValue={dayjs()}
            >
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="broker" label="Sàn giao dịch">
          <Input placeholder="BCR, OEXN..." maxLength={BROKER_MAX_LENGTH} />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú rút">
          <Input.TextArea
            rows={2}
            maxLength={NOTE_MAX_LENGTH}
            showCount
            placeholder="Nội dung giao dịch, mã tham chiếu, lưu ý..."
          />
        </Form.Item>
        <Button type="primary" danger htmlType="submit" loading={submitLoading} block icon={<MinusOutlined />}>
          Xác nhận rút tiền
        </Button>
      </Form>
    </Card>
  );
};
