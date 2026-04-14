'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker, Row, Col, App } from 'antd';
import { customersApi } from '@/lib/api/customers.api';
import { SalesUserSelect } from './SalesUserSelect';
import { Customer } from '@/lib/types/customer.types';
import dayjs from 'dayjs';

interface CustomerFormProps {
  open: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({ open, customer, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  

  useEffect(() => {
    if (open) {
      if (customer) {
        form.setFieldsValue({
          ...customer,
          inputDate: customer.inputDate ? dayjs(customer.inputDate) : dayjs(),
          assignedDate: customer.assignedDate ? dayjs(customer.assignedDate) : null,
          closedDate: customer.closedDate ? dayjs(customer.closedDate) : null,
          salesUserId: customer.salesUser?.id,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: 'pending',
          inputDate: dayjs(),
          source: 'Facebook'
        });
      }
    }
  }, [open, customer, form]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        salesUserId: values.salesUserId ? Number(values.salesUserId) : null,
        inputDate: values.inputDate.format('YYYY-MM-DD'),
        assignedDate: values.assignedDate?.format('YYYY-MM-DD') || null,
        closedDate: values.closedDate?.format('YYYY-MM-DD') || null,
      };

      if (customer) {
        await customersApi.updateCustomer(customer.id, payload);
        message.success('Cập nhật khách hàng thành công');
      } else {
        await customersApi.createCustomer(payload);
        message.success('Thêm khách hàng thành công');
      }
      
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorData = error.response?.data;
      const errorMsg = errorData?.message || 'Có lỗi xảy ra';
      if (Array.isArray(errorMsg)) {
        errorMsg.forEach((msg: string) => message.error(msg));
      } else {
        message.error(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={customer ? `Chỉnh sửa: ${customer.name}` : "Thêm khách hàng mới"}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      width={700}
      okText={customer ? "Lưu thay đổi" : "Thêm khách hàng"}
      cancelText="Hủy"
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ marginTop: 16 }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="Họ tên" rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}>
              <Input placeholder="Nguyễn Văn A" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item 
              name="phone" 
              label="Số điện thoại (Tuỳ chọn)" 
              rules={[
                { pattern: /^(09|08|07|03|05)[0-9]{8}$/, message: 'SĐT không hợp lệ' }
              ]}
            >
              <Input placeholder="Số điện thoại (Không bắt buộc)" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
              <Input placeholder="example@gmail.com" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="source" label="Nguồn" rules={[{ required: true }]}>
              <Select options={[
                { label: 'Facebook', value: 'Facebook' },
                { label: 'TikTok', value: 'TikTok' },
                { label: 'Google', value: 'Google' },
                { label: 'Instagram', value: 'Instagram' },
                { label: 'Khác', value: 'Other' },
              ]} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="salesUserId" label="Sales phụ trách">
              <SalesUserSelect />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="inputDate" label="Ngày nhập data" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="assignedDate" label="Ngày nhận KH">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Chưa nhận" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="closedDate" label="Ngày chốt">
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="Chưa chốt" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="status" label="Trạng thái">
          <Select>
            <Select.Option value="pending">Chờ xử lý</Select.Option>
            <Select.Option value="potential">Tiềm năng</Select.Option>
            <Select.Option value="closed">Đã chốt</Select.Option>
            <Select.Option value="lost">Mất</Select.Option>
            <Select.Option value="inactive">Ngừng chăm sóc</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Ghi chú quan trọng về khách hàng..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
