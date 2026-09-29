'use client';

import { useEffect } from 'react';
import { App, Form, Input, Modal, Radio } from 'antd';
import type { UtmView, UtmVisibility } from '@/lib/api/utms.api';
import { useCreateUtm, useUpdateUtm } from '@/lib/hooks/useUtms';
import { ColorPickerField } from '@/components/common/ColorPickerField';
import { toastApiError } from '@/lib/utils/error-message.util';

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = tạo mới. */
  utm: UtmView | null;
}

interface FormValues {
  name: string;
  description?: string;
  color?: string;
  visibility?: UtmVisibility;
}

/**
 * Tạo / sửa UTM. Khi sửa: tên + phạm vi hiển thị chỉ Quản lý chính hoặc quyền rộng đổi được
 * (`capabilities.canEditIdentity`), Quản lý phụ chỉ đổi được mô tả/màu (`canEditMeta`). BE vẫn chặn 403.
 */
export function UtmFormModal({ open, onClose, utm }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const createMutation = useCreateUtm();
  const updateMutation = useUpdateUtm();
  const editing = !!utm;
  const canIdentity = !utm || utm.capabilities.canEditIdentity;
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (utm) {
      form.setFieldsValue({
        name: utm.name,
        description: utm.description ?? '',
        color: utm.color,
        visibility: utm.visibility,
      });
    } else {
      form.setFieldsValue({ visibility: 'shared' });
    }
  }, [open, utm, form]);

  const handleFinish = (values: FormValues) => {
    const payload = {
      // Quản lý phụ không được gửi name/visibility (BE trả 403) → chỉ gửi khi có quyền đổi danh tính.
      ...(canIdentity ? { name: values.name.trim(), visibility: values.visibility } : {}),
      description: values.description?.trim() ? values.description.trim() : null,
      color: values.color,
    };
    const done = (text: string) => {
      message.success(text);
      onClose();
    };
    if (utm) {
      updateMutation.mutate(
        { id: utm.id, data: payload },
        { onSuccess: () => done('Đã cập nhật UTM'), onError: (e) => toastApiError(message, e, 'Cập nhật UTM thất bại') },
      );
    } else {
      createMutation.mutate(
        { ...payload, name: values.name.trim() },
        { onSuccess: () => done('Đã tạo UTM'), onError: (e) => toastApiError(message, e, 'Tạo UTM thất bại') },
      );
    }
  };

  return (
    <Modal
      title={editing ? `Sửa UTM: ${utm?.name}` : 'Tạo UTM mới'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? 'Lưu' : 'Tạo'}
      cancelText="Huỷ"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="name"
          label="Tên UTM"
          rules={[
            { required: true, whitespace: true, message: 'Nhập tên UTM' },
            { max: 100, message: 'Tối đa 100 ký tự' },
          ]}
          extra={
            editing && canIdentity
              ? 'Đổi tên sẽ cập nhật tên UTM hiển thị trên mọi khách hàng đang dùng UTM này.'
              : 'Tên không phân biệt hoa/thường và dấu (vd "Mua" và "Múa" là một).'
          }
        >
          <Input placeholder="Ví dụ: D_T01_BOT_AP" disabled={!canIdentity} maxLength={100} />
        </Form.Item>
        <Form.Item name="description" label="Mô tả" rules={[{ max: 255, message: 'Tối đa 255 ký tự' }]}>
          <Input.TextArea rows={2} maxLength={255} showCount />
        </Form.Item>
        <ColorPickerField extra="Màu Tag UTM ở bảng khách hàng và dropdown." />
        <Form.Item
          name="visibility"
          label="Ai được chọn UTM này?"
          extra="“Riêng tư” chỉ Quản lý chính/phụ (và người có quyền xem rộng) mới chọn được cho khách hàng."
        >
          <Radio.Group disabled={!canIdentity}>
            <Radio value="shared">Mọi người</Radio>
            <Radio value="restricted">Riêng tư</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}
