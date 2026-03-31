'use client';

import { useState, useEffect } from 'react';
import { 
  Drawer, Tabs, Descriptions, Table, Tag, 
  Button, Form, Input, Select, Switch, Space, App, Typography, List, Divider, Empty,
  DatePicker, Row, Col, Card
} from 'antd';
import { 
  InfoCircleOutlined, 
  FileTextOutlined, 
  DollarOutlined, 
  PlusOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { Customer, CustomerNote, Deposit } from '@/lib/types/customer.types';
import { customersApi } from '@/lib/api/customers.api';
import dayjs from 'dayjs';

const { TabPane } = Tabs;
const { Text } = Typography;

interface CustomerDetailDrawerProps {
  open: boolean;
  customerId: number | null;
  onClose: () => void;
}

export const CustomerDetailDrawer = ({ open, customerId, onClose }: CustomerDetailDrawerProps) => {
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab ] = useState('info');
  const { message } = App.useApp();
  const [noteForm] = Form.useForm();
  const [depositForm] = Form.useForm();
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchDetail = async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const data = await customersApi.getCustomer(customerId);
      setCustomer(data);
    } catch (error) {
      message.error('Không thể lấy thông tin khách hàng');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && customerId) {
      fetchDetail();
    } else {
      setCustomer(null);
      setActiveTab('info');
    }
  }, [open, customerId]);

  const handleAddNote = async (values: any) => {
    if (!customerId) return;
    setSubmitLoading(true);
    try {
      await customersApi.createNote(customerId, values);
      message.success('Đã thêm ghi chú');
      noteForm.resetFields();
      fetchDetail();
    } catch (error) {
      message.error('Lỗi khi thêm ghi chú');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAddDeposit = async (values: any) => {
    if (!customerId) return;
    setSubmitLoading(true);
    try {
      await customersApi.createDeposit(customerId, {
        ...values,
        depositDate: values.depositDate.format('YYYY-MM-DD')
      });
      message.success('Đã nạp tiền thành công');
      depositForm.resetFields();
      fetchDetail();
    } catch (error) {
      message.error('Lỗi khi nạp tiền');
    } finally {
      setSubmitLoading(false);
    }
  };

  const renderInfo = () => (
    <Descriptions bordered column={1} size="small">
      <Descriptions.Item label="Họ tên">{customer?.name}</Descriptions.Item>
      <Descriptions.Item label="Số điện thoại">{customer?.phone}</Descriptions.Item>
      <Descriptions.Item label="Email">{customer?.email || '-'}</Descriptions.Item>
      <Descriptions.Item label="Nguồn">
        <Tag color="blue">{customer?.source}</Tag>
      </Descriptions.Item>
      <Descriptions.Item label="Chiến dịch">{customer?.campaign || '-'}</Descriptions.Item>
      <Descriptions.Item label="Sales phụ trách">{customer?.salesUser?.name}</Descriptions.Item>
      <Descriptions.Item label="Phòng ban">{customer?.department?.name}</Descriptions.Item>
      <Descriptions.Item label="Broker">{customer?.broker || '-'}</Descriptions.Item>
      <Descriptions.Item label="Ngày chốt">
        {customer?.closedDate ? dayjs(customer.closedDate).format('DD/MM/YYYY') : '-'}
      </Descriptions.Item>
      <Descriptions.Item label="Ghi chú hệ thống">{customer?.note || '-'}</Descriptions.Item>
      <Descriptions.Item label="Ngày tạo">
        {dayjs(customer?.createdAt).format('DD/MM/YYYY HH:mm')}
      </Descriptions.Item>
    </Descriptions>
  );

  const renderNotes = () => (
    <div style={{ padding: '0px 8px' }}>
      <Card size="small" title="Thêm ghi chú mới" style={{ marginBottom: 16 }}>
        <Form form={noteForm} onFinish={handleAddNote} layout="vertical">
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
            <Button type="primary" htmlType="submit" loading={submitLoading} icon={<PlusOutlined />}>
              Thêm
            </Button>
          </Space>
        </Form>
      </Card>

      <List
        dataSource={customer?.notes || []}
        renderItem={(item: CustomerNote) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Space>
                  <Text strong>{item.createdByUser?.name || 'Hệ thống'}</Text>
                  <Tag color={item.isImportant ? 'error' : 'default'}>{item.noteType}</Tag>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {dayjs(item.createdAt).format('DD/MM/YYYY HH:mm')}
                  </Text>
                </Space>
              }
              description={<div style={{ whiteSpace: 'pre-wrap', color: '#262626' }}>{item.note}</div>}
            />
          </List.Item>
        )}
        locale={{ emptyText: <Empty description="Chưa có ghi chú nào" /> }}
      />
    </div>
  );

  const renderDeposits = () => (
    <div>
      <Card size="small" title="Nạp thêm tiền (ADMIN/MANAGER)" style={{ marginBottom: 16 }}>
        <Form form={depositForm} onFinish={handleAddDeposit} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="amount" label="Số tiền (USD)" rules={[{ required: true }]}>
                <Input type="number" prefix="$" step="0.01" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="depositDate" label="Ngày nạp" rules={[{ required: true }]} initialValue={dayjs()}>
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="broker" label="Sàn giao dịch">
            <Input placeholder="XM, Exness..." />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitLoading} block>
            Xác nhận nạp tiền
          </Button>
        </Form>
      </Card>

      <Table
        size="small"
        dataSource={customer?.deposits || []}
        rowKey="id"
        pagination={false}
        columns={[
          {
            title: 'Ngày',
            dataIndex: 'depositDate',
            render: (d) => dayjs(d).format('DD/MM/YYYY')
          },
          {
            title: 'Số tiền',
            dataIndex: 'amount',
            render: (a) => <Text strong style={{ color: '#cf1322' }}>${a.toLocaleString()}</Text>
          },
          {
            title: 'Sàn',
            dataIndex: 'broker'
          }
        ]}
        summary={(data) => {
          const total = data.reduce((acc, curr) => acc + Number(curr.amount), 0);
          return (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>Tổng cộng</Table.Summary.Cell>
              <Table.Summary.Cell index={1}>
                <Text type="danger" strong>${total.toLocaleString()}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} />
            </Table.Summary.Row>
          );
        }}
      />
    </div>
  );

  return (
    <Drawer
      title={customer?.name ? `Khách hàng: ${customer.name}` : 'Đang tải...'}
      placement="right"
      size="large"
      onClose={onClose}
      open={open}
      loading={loading}
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={<span><InfoCircleOutlined />Chi tiết</span>} key="info">
          {renderInfo()}
        </TabPane>
        <TabPane tab={<span><FileTextOutlined />Ghi chú ({customer?.notes?.length || 0})</span>} key="notes">
          {renderNotes()}
        </TabPane>
        <TabPane tab={<span><DollarOutlined />Nạp tiền ({customer?.deposits?.length || 0})</span>} key="deposits">
          {renderDeposits()}
        </TabPane>
      </Tabs>
    </Drawer>
  );
};
