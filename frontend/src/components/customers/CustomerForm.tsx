'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, DatePicker, Row, Col, App, Tag } from 'antd';
import { customersApi } from '@/lib/api/customers.api';
import { useMediaSources } from '@/lib/hooks/useMediaSources';
import { SalesUserSelect } from './SalesUserSelect';
import { Customer } from '@/lib/types/customer.types';
import dayjs, { Dayjs } from 'dayjs';
import { isFutureVnDate } from '@/lib/utils/date-vn';

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
  // ⚠️ Trước đây danh sách "Nguồn" hardcode cứng trong component
  // (Facebook/TikTok/Google/Instagram/Other) - admin không có cách nào thêm
  // nguồn mới mà không sửa code. Giờ lấy động từ /media-sources (chỉ nguồn
  // đang MỞ - activeOnly=true) - quản lý tại trang /nguon-media.
  const { sources } = useMediaSources(true);
  const sourceOptions: { label: React.ReactNode; value: string; disabled?: boolean }[] =
    sources.map((s) => ({ label: s.name, value: s.name }));
  // Nếu đang SỬA 1 khách hàng có source đã bị KHOÁ/xoá khỏi danh sách đang
  // mở kể từ lúc tạo, vẫn cần hiện đúng giá trị đó (không để field trông
  // như trống/lỗi) - thêm nó vào options dưới dạng 1 lựa chọn riêng, gắn
  // Tag "Đã khoá" thay vì nối chữ vào label, và disable để không ai chọn
  // lại nguồn đã khoá cho khách hàng khác (chỉ giữ hiển thị cho khách này).
  if (customer?.source && !sourceOptions.some((o) => o.value === customer.source)) {
    sourceOptions.push({
      label: (
        <span>
          {customer.source} <Tag color="default" style={{ marginLeft: 4 }}>Đã khoá</Tag>
        </span>
      ),
      value: customer.source,
      disabled: true,
    });
  }


  useEffect(() => {
    if (open) {
      if (customer) {
        form.setFieldsValue({
          ...customer,
          inputDate: customer.inputDate ? dayjs(customer.inputDate) : dayjs(),
          assignedDate: customer.assignedDate ? dayjs(customer.assignedDate) : null,
          closedDate: customer.closedDate ? dayjs(customer.closedDate) : null,
          salesUserId: customer.salesUser?.id,
          marketingUserId: customer.marketingUser?.id,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: 'pending',
          inputDate: dayjs(),
          // Mặc định nguồn đầu tiên đang MỞ thay vì hardcode 'Facebook' -
          // nếu admin đã khoá/xoá Facebook, hardcode sẽ trỏ vào 1 option
          // không còn tồn tại trong dropdown.
          source: sources[0]?.name,
        });
      }
    }
  }, [open, customer, form, sources]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        salesUserId: values.salesUserId ? Number(values.salesUserId) : null,
        marketingUserId: values.marketingUserId ? Number(values.marketingUserId) : null,
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
              <Select options={sourceOptions} placeholder="Chọn nguồn" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="campaign" label="UTM">
              <Input placeholder="Ví dụ: D_T01_BOT_AP" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="salesUserId" label="Sales phụ trách">
              <SalesUserSelect />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="marketingUserId" label="Marketing phụ trách">
              <SalesUserSelect placeholder="Chọn Marketing đang hoạt động..." />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="inputDate"
              label="Ngày nhập data"
              rules={[
                { required: true, message: 'Vui lòng chọn ngày nhập data' },
                {
                  validator: (_rule, value: Dayjs | null) =>
                    isFutureVnDate(value)
                      ? Promise.reject(new Error('Ngày nhập data không được lớn hơn ngày hiện tại'))
                      : Promise.resolve(),
                },
              ]}
            >
              {/* disabledDate: chặn chọn ngày tương lai (so với chuẩn GMT+7,
                  đồng bộ với validation phía BE) ngay trên UI, thay vì để
                  người dùng chọn xong mới báo lỗi. */}
              <DatePicker
                style={{ width: '100%' }}
                format="DD/MM/YYYY"
                disabledDate={(current) => isFutureVnDate(current)}
              />
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
          <Select
            options={[
              { value: 'pending', label: 'Chờ xử lý' },
              { value: 'potential', label: 'Tiềm năng' },
              { value: 'closed', label: 'Đã chốt' },
              { value: 'lost', label: 'Mất' },
              { value: 'inactive', label: 'Ngừng chăm sóc' },
            ]}
          />
        </Form.Item>

        <Form.Item name="note" label="Ghi chú">
          <Input.TextArea rows={3} placeholder="Ghi chú quan trọng về khách hàng..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};