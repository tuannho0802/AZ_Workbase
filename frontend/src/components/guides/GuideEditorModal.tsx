'use client';

import { useEffect, useState } from 'react';
import { App, Form, Input, InputNumber, Modal, Select, Skeleton, Switch, Tabs } from 'antd';
import { GuideMarkdown } from '@/lib/guides/GuideMarkdown';
import { GUIDE_DEMOS } from '@/lib/guides/guide-demos';
import { buildDemoFence } from '@/lib/guides/guide-markdown';
import {
  useCreateGuide,
  useGuideManageDetail,
  useGuideDepartmentOptions,
  useGuidePermissionOptions,
  useGuidePositionOptions,
  useGuideRoleOptions,
  useUpdateGuide,
} from '@/lib/hooks/useGuides';
import { AudienceTag, AUDIENCE_META, type AudienceItem, type AudienceKind } from './GuideAudienceTags';
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
  positionIds: number[];
  departmentIds: number[];
  requiredPermission: string | null;
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
  const { positions, isLoading: positionsLoading } = useGuidePositionOptions(open);
  const { departments, isLoading: departmentsLoading } = useGuideDepartmentOptions(open);
  const { permissions, isLoading: permissionsLoading } = useGuidePermissionOptions(open);
  const createMutation = useCreateGuide();
  const updateMutation = useUpdateGuide();
  const saving = createMutation.isPending || updateMutation.isPending;
  const content = Form.useWatch('content', form) ?? '';

  useEffect(() => {
    if (!open) return;
    if (!editing) {
      form.resetFields();
      form.setFieldsValue({ sortOrder: 0, isPublished: false, roleIds: [], positionIds: [], departmentIds: [], requiredPermission: null, content: '' });
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
      positionIds: g.positionIds,
      departmentIds: g.departmentIds,
      requiredPermission: g.requiredPermission,
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
      positionIds: values.positionIds ?? [],
      departmentIds: values.departmentIds ?? [],
      // null = bỏ yêu cầu quyền (BE: không gửi = giữ nguyên, nên luôn gửi tường minh).
      requiredPermission: values.requiredPermission ?? null,
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
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <AudienceField kind="role" name="roleIds" items={roles} loading={rolesLoading} />
            <AudienceField kind="position" name="positionIds" items={positions} loading={positionsLoading} />
            <AudienceField kind="department" name="departmentIds" items={departments} loading={departmentsLoading} />
          </div>
          <Form.Item
            name="requiredPermission"
            label="Cần quyền để xem"
            extra="Chỉ người đang có quyền này (theo ma trận Phân quyền, đã tính override phòng ban/vị trí) mới thấy bài. Đổi ma trận quyền thì bài tự ẩn/hiện theo."
          >
            <Select
              allowClear
              showSearch
              loading={permissionsLoading}
              placeholder="Không yêu cầu quyền"
              filterOption={(input, option) =>
                `${option?.value ?? ''} ${option?.description ?? ''}`.toLowerCase().includes(input.toLowerCase())
              }
              options={permissions.map((p) => ({ value: p.key, label: p.key, description: p.description ?? '' }))}
              optionRender={(option) => (
                <div>
                  <div style={{ fontFamily: 'monospace' }}>{option.label}</div>
                  {option.data.description && <div style={{ color: '#8c8c8c', fontSize: 12 }}>{option.data.description}</div>}
                </div>
              )}
            />
          </Form.Item>
          <div style={{ color: '#8c8c8c', fontSize: 12, margin: '-8px 0 16px' }}>
            Để trống một ô = không giới hạn theo mục đó; để trống cả 3 ô và "Cần quyền" = mọi người đăng nhập đều xem được.
            Chọn nhiều mục thì người xem phải thoả TẤT CẢ mục đã chọn (vd Role = Nhân viên, Vị trí = Sales và có quyền đã chọn).
            Người có quyền "guides.manage" luôn xem được mọi bài đã xuất bản.
          </div>

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

/** Ô chọn nhiều role / vị trí / phòng ban: mỗi lựa chọn (cả trong danh sách thả xuống lẫn tag đã chọn) hiện đúng màu cấu hình. */
function AudienceField({
  kind,
  name,
  items,
  loading,
}: {
  kind: AudienceKind;
  name: 'roleIds' | 'positionIds' | 'departmentIds';
  items: AudienceItem[];
  loading: boolean;
}) {
  const meta = AUDIENCE_META[kind];
  return (
    <Form.Item name={name} label={`${meta.label} được xem`} style={{ flex: '1 1 240px', minWidth: 0 }}>
      <Select
        mode="multiple"
        allowClear
        loading={loading}
        placeholder={`Mọi ${meta.label.toLowerCase()}`}
        optionFilterProp="label"
        options={items.map((i) => ({ value: i.id, label: i.name, color: i.color }))}
        optionRender={(option) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden
              style={{ width: 10, height: 10, borderRadius: '50%', background: option.data.color, display: 'inline-block' }}
            />
            {option.label}
          </span>
        )}
        tagRender={({ value, closable, onClose: close }) => {
          const item = items.find((i) => i.id === value);
          // Mục đã bị xoá khỏi hệ thống: vẫn hiện (xám) để người soạn thấy và gỡ được.
          return (
            <AudienceTag
              kind={kind}
              item={item ?? { id: Number(value), name: `#${value}`, color: 'default' }}
              closable={closable}
              onClose={close}
            />
          );
        }}
      />
    </Form.Item>
  );
}
