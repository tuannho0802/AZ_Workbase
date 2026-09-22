'use client';

import { useMemo, useState } from 'react';
import { Modal, Form, Input, Radio, Select, Alert, App, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '@/lib/api/users.api';
import { departmentsApi } from '@/lib/api/departments.api';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { usePreviewBroadcast, useSendBroadcast } from '@/lib/hooks/useNotificationBroadcasts';
import type { BroadcastAudienceType } from '@/lib/api/notification-broadcasts.api';

const { TextArea } = Input;
const { Text } = Typography;

interface UserOption {
  id: number;
  name: string;
  department?: { id: number; name: string };
  position?: { name: string };
}

interface SendBroadcastModalProps {
  open: boolean;
  onClose: () => void;
  /** Gọi sau khi gửi thành công (vd để chuyển tới trang "Đã gửi"). */
  onSent?: (result: { id: number; recipientCount: number }) => void;
}

/**
 * Soạn & gửi Thông báo thủ công (PLAN mục 7.7). Dạng Modal (thay vì trang
 * riêng) theo yêu cầu chủ dự án - `/thong-bao/gui` chỉ còn là trang mở sẵn
 * Modal này (permission gating vẫn ở trang), và `/thong-bao/da-gui` có nút
 * "Soạn thông báo mới" mở CÙNG Modal để không phải chuyển trang.
 *
 * ⚠️ Nút "Gửi" CHỈ bật sau khi đã bấm "Xem trước người nhận" thành công
 * (SKILL_NEXTJS_FRONTEND §8.2 chống bấm đúp) - đổi bất kỳ trường nào của
 * audience/tiêu đề/nội dung sau khi đã preview đều bắt preview lại, vì BE
 * chốt người nhận tại thời điểm gửi, không tin lại preview cũ.
 */
export function SendBroadcastModal({ open, onClose, onSent }: SendBroadcastModalProps) {
  const { message, modal } = App.useApp();
  const { scope } = useMyPermissions();
  const [form] = Form.useForm();
  const [audienceType, setAudienceType] = useState<BroadcastAudienceType>('USERS');
  const [previewResult, setPreviewResult] = useState<{
    recipientCount: number;
    sample: string[];
    excludedCount: number;
  } | null>(null);
  const [dirtySincePreview, setDirtySincePreview] = useState(false);

  // Scope thật của `notification_broadcasts.create` - CHỈ hiện "Toàn bộ nhân
  // viên" khi scope === 'all' (Manager scope 'department' không thấy option
  // này ở FE; BE vẫn tự kiểm lại, đây chỉ là UX - xem PLAN 7.7 mục 2).
  const canSelectAll = scope('notification_broadcasts.create') === 'all';

  const { data: users = [], isLoading: usersLoading } = useQuery<UserOption[]>({
    queryKey: ['users-for-select'],
    queryFn: () => usersApi.getAllForSelect(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });
  const { data: departments = [], isLoading: deptsLoading } = useQuery({
    queryKey: ['departments-for-select'],
    queryFn: () => departmentsApi.getAll(),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const preview = usePreviewBroadcast();
  const send = useSendBroadcast();

  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.id,
        label: u.name,
      })),
    [users],
  );
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const resetAndClose = () => {
    form.resetFields();
    setAudienceType('USERS');
    setPreviewResult(null);
    setDirtySincePreview(false);
    onClose();
  };

  const markDirty = () => {
    if (previewResult) setDirtySincePreview(true);
  };

  const buildAudiencePayload = () => {
    const values = form.getFieldsValue();
    if (audienceType === 'ALL') return { type: 'ALL' as const };
    if (audienceType === 'DEPARTMENTS') {
      return { type: 'DEPARTMENTS' as const, departmentIds: values.departmentIds ?? [] };
    }
    return { type: 'USERS' as const, userIds: values.userIds ?? [] };
  };

  const handlePreview = async () => {
    try {
      await form.validateFields(['title', 'body', 'userIds', 'departmentIds']);
    } catch {
      return;
    }
    const audience = buildAudiencePayload();
    if (audience.type === 'USERS' && !audience.userIds?.length) {
      message.warning('Chọn ít nhất 1 người nhận');
      return;
    }
    if (audience.type === 'DEPARTMENTS' && !audience.departmentIds?.length) {
      message.warning('Chọn ít nhất 1 phòng ban');
      return;
    }
    try {
      const result = await preview.mutateAsync(audience);
      setPreviewResult(result);
      setDirtySincePreview(false);
    } catch {
      // axios interceptor đã hiện message.error
    }
  };

  const doSend = async () => {
    const values = form.getFieldsValue();
    const audience = buildAudiencePayload();
    try {
      const result = await send.mutateAsync({ title: values.title, body: values.body, audience });
      message.success(`Đã gửi tới ${result.recipientCount} người`);
      resetAndClose();
      onSent?.(result);
    } catch {
      // axios interceptor đã hiện message.error
    }
  };

  const handleSend = () => {
    if (!previewResult || dirtySincePreview) {
      message.warning('Vui lòng "Xem trước người nhận" trước khi gửi');
      return;
    }
    // Xác nhận thêm nếu gửi cho số đông (Toàn bộ / nhiều người) - PLAN 7.7 mục 4.
    if (audienceType === 'ALL' || previewResult.recipientCount >= 20) {
      modal.confirm({
        title: 'Xác nhận gửi thông báo',
        content: `Thông báo sẽ được gửi tới ${previewResult.recipientCount} người. Bạn có chắc chắn?`,
        okText: 'Gửi',
        cancelText: 'Huỷ',
        onOk: doSend,
      });
      return;
    }
    doSend();
  };

  return (
    <Modal
      title="Soạn & gửi thông báo"
      open={open}
      onCancel={resetAndClose}
      okText={previewResult && !dirtySincePreview ? `Gửi tới ${previewResult.recipientCount} người` : 'Gửi'}
      cancelText="Huỷ"
      confirmLoading={send.isPending}
      okButtonProps={{ disabled: !previewResult || dirtySincePreview || send.isPending }}
      onOk={handleSend}
      destroyOnHidden
      width={620}
    >
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        title="Không đưa SĐT/email/số tiền của khách hàng vào nội dung. Người nhận được chốt tại thời điểm gửi."
      />
      <Form form={form} layout="vertical" onValuesChange={markDirty}>
        <Form.Item
          name="title"
          label="Tiêu đề"
          rules={[{ required: true, message: 'Nhập tiêu đề' }, { max: 200 }]}
        >
          <Input showCount maxLength={200} placeholder="Vd: Thông báo lịch nghỉ Tết" />
        </Form.Item>
        <Form.Item
          name="body"
          label="Nội dung"
          rules={[{ required: true, message: 'Nhập nội dung' }, { max: 2000 }]}
        >
          <TextArea rows={5} showCount maxLength={2000} placeholder="Nội dung thông báo (text thuần)..." />
        </Form.Item>

        <Form.Item label="Người nhận">
          <Radio.Group
            value={audienceType}
            onChange={(e) => {
              setAudienceType(e.target.value);
              markDirty();
            }}
          >
            <Radio.Button value="USERS">Chọn người nhận</Radio.Button>
            <Radio.Button value="DEPARTMENTS">Theo phòng ban</Radio.Button>
            {canSelectAll && <Radio.Button value="ALL">Toàn bộ nhân viên</Radio.Button>}
          </Radio.Group>
        </Form.Item>

        {audienceType === 'USERS' && (
          <Form.Item name="userIds" rules={[{ required: true, message: 'Chọn ít nhất 1 người nhận' }]}>
            <Select
              mode="multiple"
              showSearch
              allowClear
              loading={usersLoading}
              placeholder="Tìm và chọn nhân viên..."
              optionFilterProp="label"
              maxTagCount="responsive"
              options={userOptions}
            />
          </Form.Item>
        )}
        {audienceType === 'DEPARTMENTS' && (
          <Form.Item
            name="departmentIds"
            rules={[{ required: true, message: 'Chọn ít nhất 1 phòng ban' }]}
          >
            <Select
              mode="multiple"
              showSearch
              allowClear
              loading={deptsLoading}
              placeholder="Chọn phòng ban..."
              optionFilterProp="label"
              options={departmentOptions}
            />
          </Form.Item>
        )}
        {audienceType === 'ALL' && (
          <Text type="secondary">Gửi tới toàn bộ nhân viên đang hoạt động trong hệ thống.</Text>
        )}

        <Space>
          <a onClick={handlePreview} style={{ fontWeight: 500 }}>
            {preview.isPending ? 'Đang tính...' : 'Xem trước người nhận'}
          </a>
        </Space>

        {previewResult && (
          <Alert
            style={{ marginTop: 12 }}
            type={dirtySincePreview ? 'warning' : 'success'}
            showIcon
            message={
              dirtySincePreview
                ? 'Đã đổi nội dung/người nhận - bấm "Xem trước" lại trước khi gửi'
                : `Sẽ gửi tới ${previewResult.recipientCount} người${
                    previewResult.sample.length
                      ? ` (ví dụ: ${previewResult.sample.join(', ')}${
                          previewResult.recipientCount > previewResult.sample.length ? '…' : ''
                        })`
                      : ''
                  }${previewResult.excludedCount ? ` - đã loại ${previewResult.excludedCount} người không hợp lệ` : ''}`
            }
          />
        )}
      </Form>
    </Modal>
  );
}
