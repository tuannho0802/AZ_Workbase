import React, { useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, Row, Col, Space, Button, App } from 'antd';
import { customersApi } from '@/lib/api/customers.api';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { useUsers, useUsersList } from '@/lib/hooks/useUsers';
import dayjs from 'dayjs';

interface CustomerFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CustomerForm: React.FC<CustomerFormProps> = ({ open, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();
  
  const { departments, isLoading: deptsLoading } = useDepartments();
  const { users: salesUsers, isLoading: usersLoading } = useUsersList('employee');



  // Debug từng user object
  salesUsers?.forEach((user: any, index: number) => {

  });



  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        inputDate: values.inputDate.format('YYYY-MM-DD'),
      };
      console.log('[CUSTOMER FORM] Creating customer:', payload);
      await customersApi.createCustomer(payload);
      message.success('Thêm khách hàng thành công');
      form.resetFields();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Customer create error:', error.response?.data);
      const errorData = error.response?.data;
      if (errorData?.message) {
        if (Array.isArray(errorData.message)) {
          errorData.message.forEach((msg: string) => message.error(msg));
        } else {
          message.error(errorData.message);
        }
      } else {
        message.error('Có lỗi xảy ra khi thêm khách hàng');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Thêm khách hàng mới"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={loading}
      width={700}
      okText="Thêm khách hàng"
      cancelText="Hủy"
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          status: 'pending',
          inputDate: dayjs(),
          source: 'Facebook'
        }}
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
              label="Số điện thoại" 
              rules={[
                { required: true, message: 'Vui lòng nhập SĐT' },
                { pattern: /^(09|08|07|03|05)[0-9]{8}$/, message: 'SĐT không hợp lệ' }
              ]}
            >
              <Input placeholder="0912345678" />
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
              <Select>
                <Select.Option value="Facebook">Facebook</Select.Option>
                <Select.Option value="TikTok">TikTok</Select.Option>
                <Select.Option value="Google">Google</Select.Option>
                <Select.Option value="Instagram">Instagram</Select.Option>
                <Select.Option value="Other">Khác</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="departmentId" label="Phòng ban" rules={[{ required: true }]}>
              <Select 
                placeholder="Chọn phòng ban" 
                loading={deptsLoading}
                options={departments.map((d: any) => ({ label: d.name, value: d.id }))} 
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="salesUserId" label="Sales phụ trách" rules={[{ required: true }]}>
              <Select 
                placeholder="Chọn sales" 
                loading={usersLoading}
                showSearch
                filterOption={(input, option) => (String(option?.label) ?? '').toLowerCase().includes(input.toLowerCase())}
                options={salesUsers?.map((u: any) => ({ 
                  label: u.name, 
                  value: u.id 
                })) || []}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="inputDate" label="Ngày nhập data" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="status" label="Trạng thái">
              <Select>
                <Select.Option value="pending">Chờ xử lý</Select.Option>
                <Select.Option value="potential">Tiềm năng</Select.Option>
                <Select.Option value="closed">Đã chốt</Select.Option>
                <Select.Option value="lost">Mất</Select.Option>
                <Select.Option value="inactive">Ngừng chăm sóc</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Ghi chú quan trọng về khách hàng..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};
