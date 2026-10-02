'use client';

import { useEffect, useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Select, Skeleton, Switch, Tabs, Tag } from 'antd';
import { GuideMarkdown } from '@/lib/guides/GuideMarkdown';
import { GUIDE_DEMOS } from '@/lib/guides/guide-demos';
import { buildDemoFence } from '@/lib/guides/guide-markdown';
import {
  useCreateGuide,
  useGuideManageDetail,
  useGuideRoleOptions,
  useUpdateGuide,
} from '@/lib/hooks/useGuides';
import { toastApiError } from '@/lib/utils/error-message.util';

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = tạo mới. */
  guideId: number | null;
  /** Gọi sau khi lưu thành công, kèm slug thật BE trả về (để trang chuyển sang bài vừa lưu). */
  onSaved: (slug: string) => void;
}

interface FormValues {
  title: string;
  slug?: string;
  content: string;
  sortOrder: number;
  isPublished: boolean;
  roleIds: number[];
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Tạo / sửa Hướng dẫn: Markdown + xem trước, role được xem, thứ tự, xuất bản. BE vẫn gác `guides.manage`. */
export function GuideEditorModal({ open, onClose, guideId, onSaved }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const editing = guideId != null;
  const detail = useGuideManageDetail(open ? guideId : null);
  const { roles, isLoading: rolesLoading } = useGuideRoleOptions(open);
  const createMutation = useCreateGuide();
  const updateMutation = useUpdateGuide();
  const saving = createMutation.isPending || updateMutation.isPending;
  const content = Form.useWatch('content', form) ?? '';

  useEffect(() => {
    if (!open) return;
    if (!editing) {
      form.resetFields();
      form.setFieldsValue({ sortOrder: 0, isPublished: false, roleIds: [], content: '' });
    }
  }, [open, editing, form]);

  useEffect(() => {
    if (!open || !editing || !detail.data) return;
    const g = detail.data;
    form.setFieldsValue({
      title: g.title,
      slug: g.slug,
      content: g.content,
      sortOrder: g.sortOrder,
      isPublished: g.isPublished,
      roleIds: g.roleIds,
    });
  }, [open, editing, detail.data, form]);

  // Reset tab khi đóng (không setState trong effect - tránh render lan truyền).
  const handleClose = () => {
    setTab('edit');
    onClose();
  };

  const insertDemo = (id: string) => {
    form.setFieldValue('content', `${form.getFieldValue('content') ?? ''}${buildDemoFence(id)}`);
    setTab('edit');
  };

  const handleFinish = async (values: FormValues) => {
    const payload = {
      title: values.title.trim(),
      // Slug bỏ trống khi tạo mới = BE tự sinh; khi sửa luôn gửi slug hiện có.
      ...(values.slug?.trim() ? { slug: values.slug.trim() } : {}),
      content: values.content,
      sortOrder: values.sortOrder ?? 0,
      isPublished: !!values.isPublished,
      roleIds: values.roleIds ?? [],
    };
    try {
      const saved = editing
        ? await updateMutation.mutateAsync({ id: guideId as number, data: payload })
        : await createMutation.mutateAsync(payload);
      message.success(editing ? 'Đã cập nhật hướng dẫn' : 'Đã tạo hướng dẫn');
      onSaved(saved.slug);
      handleClose();
    } catch (err) {
      toastApiError(message, err, 'Không thể lưu hướng dẫn');
    }
  };

  const loadingDetail = editing && detail.isLoading;

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={editing ? 'Sửa hướng dẫn' : 'Tạo hướng dẫn'}
      okText="Lưu"
      cancelText="Huỷ"
      onOk={() => form.submit()}
      confirmLoading={saving}
      okButtonProps={{ disabled: loadingDetail || saving }}
      width={860}
      destroyOnHidden
      mask={{ closable: false }}
      // Trình soạn tự dùng Ctrl+K (chèn link) - nhường phím tắt cho command palette.
      data-no-command-palette
    >
      {loadingDetail ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Form form={form} layout="vertical" onFinish={handleFinish} disabled={saving}>
          <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, whitespace: true, message: 'Nhập tiêu đề' }, { max: 200 }]}>
            <Input placeholder="Cách thêm khách hàng mới" maxLength={200} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item
              name="slug"
              label="Slug (đường dẫn)"
              style={{ flex: '1 1 260px' }}
              extra="Bỏ trống để tự sinh từ tiêu đề. Chỉ chữ thường, số, gạch ngang."
              rules={[{ pattern: SLUG_PATTERN, message: 'Slug chỉ gồm chữ thường, số và dấu gạch ngang' }, { max: 100 }]}
            >
              <Input placeholder="them-khach-hang-moi" />
            </Form.Item>
            <Form.Item name="sortOrder" label="Thứ tự" extra="Số nhỏ hiện trước" style={{ width: 120 }}>
              <InputNumber min={0} max={100000} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="isPublished" label="Xuất bản" valuePropName="checked" extra="Tắt = bản nháp" style={{ width: 120 }}>
              <Switch />
            </Form.Item>
          </div>
          <Form.Item
            name="roleIds"
            label="Role được xem"
            extra="Để trống = mọi role đăng nhập đều xem được."
          >
            <Select
              mode="multiple"
              allowClear
              loading={rolesLoading}
              placeholder="Mọi role"
              optionFilterProp="label"
              options={roles.map((r) => ({ value: r.id, label: r.name }))}
              tagRender={({ value, label, closable, onClose: close }) => {
                const role = roles.find((r) => r.id === value);
                return (
                  <Tag color={role?.color} closable={closable} onClose={close} style={{ marginInlineEnd: 4 }}>
                    {label}
                  </Tag>
                );
              }}
            />
          </Form.Item>

          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as 'edit' | 'preview')}
            items={[
              {
                key: 'edit',
                label: 'Soạn Markdown',
                children: (
                  <>
                    <Select
                      placeholder="Chèn mẫu minh hoạ (component giống trang thật)"
                      style={{ width: '100%', marginBottom: 8 }}
                      value={null}
                      onChange={(id) => id && insertDemo(id)}
                      options={GUIDE_DEMOS.map((d) => ({ value: d.id, label: `${d.title} - ${d.description}` }))}
                    />
                    <Form.Item name="content" noStyle rules={[{ required: true, whitespace: true, message: 'Nhập nội dung' }, { max: 200000 }]}>
                      <Input.TextArea rows={16} placeholder="# Tiêu đề&#10;Nội dung Markdown..." style={{ fontFamily: 'monospace' }} />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'preview',
                label: 'Xem trước',
                children: (
                  <div style={{ minHeight: 320, maxHeight: 460, overflow: 'auto' }}>
                    {content.trim() ? <GuideMarkdown content={content} /> : <span style={{ color: '#999' }}>Chưa có nội dung</span>}
                  </div>
                ),
              },
            ]}
          />
        </Form>
      )}
    </Modal>
  );
}
