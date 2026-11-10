'use client';

import { useEffect } from 'react';
import { App, Form, Input, Modal, Select, Switch } from 'antd';
import {
  useCreateFanpage,
  useFanpageOwnerOptions,
  useFanpagePlatforms,
  useUpdateFanpage,
} from '@/lib/hooks/useFanpages';
import type { Fanpage } from '@/lib/api/fanpages.api';
import { toastApiError } from '@/lib/utils/error-message.util';

interface FormValues {
  platformId: number;
  name: string;
  url: string;
  ownerId?: number;
  isActive?: boolean;
}

interface Props {
  open: boolean;
  /** undefined = tạo mới; có giá trị = sửa. */
  fanpage?: Fanpage;
  /** Có hiện ô "Người phụ trách" không (chỉ khi BE cho phép giao Page cho người khác). */
  canAssignOwner: boolean;
  onClose: () => void;
}

export function FanpageFormModal({ open, fanpage, canAssignOwner, onClose }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const isEdit = !!fanpage;

  // Khi sửa: lấy cả nền tảng đã khoá để Page cũ vẫn hiện đúng tên, nhưng disable lựa chọn khoá (trừ nền tảng hiện tại).
  const { platforms } = useFanpagePlatforms(false, open);
  const { owners } = useFanpageOwnerOptions(open && canAssignOwner);
  const createMut = useCreateFanpage();
  const updateMut = useUpdateFanpage();
  const saving = createMut.isPending || updateMut.isPending;

  useEffect(() => {
    if (!open) return;
    if (fanpage) {
      form.setFieldsValue({
        platformId: fanpage.platformId,
        name: fanpage.name,
        url: fanpage.url,
        ownerId: fanpage.ownerId ?? undefined,
        isActive: fanpage.isActive,
      });
    } else {
      form.resetFields();
    }
  }, [open, fanpage, form]);

  const handleFinish = async (values: FormValues) => {
    try {
      if (fanpage) {
        await updateMut.mutateAsync({
          id: fanpage.id,
          data: {
            platformId: values.platformId,
            name: values.name.trim(),
            url: values.url.trim(),
            ...(canAssignOwner && values.ownerId != null ? { ownerId: values.ownerId } : {}),
            isActive: values.isActive,
          },
        });
        message.success('Đã cập nhật Page');
      } else {
        await createMut.mutateAsync({
          platformId: values.platformId,
          name: values.name.trim(),
          url: values.url.trim(),
          ...(canAssignOwner && values.ownerId != null ? { ownerId: values.ownerId } : {}),
        });
        message.success('Đã thêm Page');
      }
      onClose();
    } catch (err) {
      toastApiError(message, err, isEdit ? 'Không thể cập nhật Page' : 'Không thể thêm Page');
    }
  };

  return (
    <Modal
      title={isEdit ? `Sửa Page: ${fanpage?.name}` : 'Thêm Page mới'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={isEdit ? 'Lưu' : 'Thêm'}
      cancelText="Huỷ"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="platformId" label="Nền tảng" rules={[{ required: true, message: 'Chọn nền tảng' }]}>
          <Select
            placeholder="Chọn nền tảng"
            options={platforms.map((p) => ({
              value: p.id,
              label: p.isActive ? p.name : `${p.name} (đã khoá)`,
              disabled: !p.isActive && p.id !== fanpage?.platformId,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="name"
          label="Tên Page"
          rules={[
            { required: true, whitespace: true, message: 'Nhập tên Page' },
            { max: 150, message: 'Tối đa 150 ký tự' },
          ]}
        >
          <Input placeholder="VD: Fanpage Review Sàn A" />
        </Form.Item>
        <Form.Item
          name="url"
          label="Link Page"
          rules={[
            { required: true, whitespace: true, message: 'Nhập link Page' },
            { type: 'url', message: 'Link phải bắt đầu bằng http:// hoặc https://' },
            { max: 500, message: 'Tối đa 500 ký tự' },
          ]}
        >
          <Input placeholder="https://facebook.com/ten-page" />
        </Form.Item>
        {canAssignOwner && (
          <Form.Item name="ownerId" label="Người phụ trách" extra={isEdit ? undefined : 'Bỏ trống = chính bạn.'}>
            <Select
              showSearch
              allowClear={!isEdit}
              placeholder="Chọn nhân viên"
              optionFilterProp="label"
              options={owners.map((u) => ({ value: u.id, label: u.employeeCode ? `${u.name} (${u.employeeCode})` : u.name }))}
            />
          </Form.Item>
        )}
        {isEdit && (
          <Form.Item name="isActive" label="Đang theo dõi" valuePropName="checked" extra="Tắt = ngừng theo dõi (vẫn giữ lịch sử bài đăng/ghi chú).">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}