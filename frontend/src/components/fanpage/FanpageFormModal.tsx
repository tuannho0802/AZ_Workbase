'use client';

import { useEffect, useMemo } from 'react';
import { App, Form, Input, InputNumber, Modal, Select, Switch, Tag } from 'antd';
import {
  useCreateFanpage,
  useFanpageHealthStatuses,
  useFanpageOwnerOptions,
  useFanpagePlatforms,
  useUpdateFanpage,
} from '@/lib/hooks/useFanpages';
import type { Fanpage, FanpageUserBrief } from '@/lib/api/fanpages.api';
import { OwnerTag } from './OwnerTag';
import { PlatformTag } from './PlatformTag';
import { sortOwnersPrimaryFirst } from '@/lib/utils/fanpageColors';
import { toastApiError } from '@/lib/utils/error-message.util';
import { detectPlatformByUrl } from '@/lib/utils/fanpageUrl';

interface FormValues {
  platformId: number;
  name: string;
  url: string;
  /** Phần tử đầu = người phụ trách chính. */
  ownerIds?: number[];
  isActive?: boolean;
  healthStatusId?: number;
  healthNote?: string;
  targetPostsPerWeek?: number | null;
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
  const { statuses } = useFanpageHealthStatuses(false, open);
  const { owners } = useFanpageOwnerOptions(open && canAssignOwner);
  const createMut = useCreateFanpage();
  const updateMut = useUpdateFanpage();
  const saving = createMut.isPending || updateMut.isPending;
  const watchedOwnerIds = Form.useWatch('ownerIds', form);

  // Gộp người phụ trách hiện tại của Page vào danh sách chọn: scope hẹp (department) không thấy người ngoài phòng ban
  // trong owner-options, nhưng Page đang có họ thì vẫn phải hiện đúng tên (không hiện ID trần).
  const ownerPool = useMemo<FanpageUserBrief[]>(() => {
    const map = new Map<number, FanpageUserBrief>();
    owners.forEach((u) => map.set(u.id, u));
    fanpage?.owners?.forEach((u) => {
      if (!map.has(u.id)) map.set(u.id, u);
    });
    return [...map.values()];
  }, [owners, fanpage]);

  useEffect(() => {
    if (!open) return;
    if (fanpage) {
      form.setFieldsValue({
        platformId: fanpage.platformId,
        name: fanpage.name,
        url: fanpage.url,
        ownerIds: sortOwnersPrimaryFirst(fanpage.owners, fanpage.ownerId).map((o) => o.id),
        isActive: fanpage.isActive,
        healthStatusId: fanpage.healthStatusId ?? fanpage.health?.id,
        healthNote: fanpage.healthNote ?? undefined,
        targetPostsPerWeek: fanpage.targetPostsPerWeek ?? null,
      });
    } else {
      form.resetFields();
    }
  }, [open, fanpage, form]);

  // Tạo mới: chọn sẵn tình trạng mặc định khi danh mục đã tải (không đè nếu người dùng đã chọn).
  useEffect(() => {
    if (!open || fanpage) return;
    const def = statuses.find((h) => h.isDefault);
    if (def && form.getFieldValue('healthStatusId') == null) form.setFieldValue('healthStatusId', def.id);
  }, [open, fanpage, statuses, form]);

  // Dán link -> tự chọn nền tảng nếu khớp DUY NHẤT 1 nền tảng đang dùng và người dùng chưa tự chọn.
  const handleUrlChange = (url: string) => {
    if (form.isFieldTouched('platformId') || form.getFieldValue('platformId') != null) return;
    const id = detectPlatformByUrl(url, platforms);
    const target = platforms.find((p) => p.id === id);
    if (target?.isActive) form.setFieldValue('platformId', target.id);
  };

  const handleFinish = async (values: FormValues) => {
    try {
      if (fanpage) {
        await updateMut.mutateAsync({
          id: fanpage.id,
          data: {
            platformId: values.platformId,
            name: values.name.trim(),
            url: values.url.trim(),
            ...(canAssignOwner && values.ownerIds?.length ? { ownerIds: values.ownerIds } : {}),
            isActive: values.isActive,
            ...(values.healthStatusId != null ? { healthStatusId: values.healthStatusId } : {}),
            // Ghi chú trống = xoá ghi chú (null); mục tiêu trống = bỏ mục tiêu.
            healthNote: values.healthNote?.trim() ? values.healthNote.trim() : null,
            targetPostsPerWeek: values.targetPostsPerWeek ?? null,
          },
        });
        message.success('Đã cập nhật Page');
      } else {
        await createMut.mutateAsync({
          platformId: values.platformId,
          name: values.name.trim(),
          url: values.url.trim(),
          ...(canAssignOwner && values.ownerIds?.length ? { ownerIds: values.ownerIds } : {}),
          ...(values.healthStatusId != null ? { healthStatusId: values.healthStatusId } : {}),
          ...(values.healthNote?.trim() ? { healthNote: values.healthNote.trim() } : {}),
          ...(values.targetPostsPerWeek != null ? { targetPostsPerWeek: values.targetPostsPerWeek } : {}),
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
            optionFilterProp="searchText"
            showSearch
            options={platforms.map((p) => ({
              value: p.id,
              label: <PlatformTag platform={p} />,
              searchText: p.name,
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
          <Input placeholder="https://facebook.com/ten-page" onChange={(e) => handleUrlChange(e.target.value)} />
        </Form.Item>
        <Form.Item
          name="healthStatusId"
          label="Tình trạng Page"
          extra="Page ngoài đời đang thế nào. Tình trạng “ngưng hoạt động” (VD: Bị khoá) sẽ không bị nhắc đăng bài."
        >
          <Select
            placeholder="Chọn tình trạng"
            options={statuses.map((h) => ({
              value: h.id,
              label: <Tag color={h.color}>{h.name}</Tag>,
              disabled: h.isLocked && h.id !== (fanpage?.healthStatusId ?? fanpage?.health?.id),
            }))}
          />
        </Form.Item>
        <Form.Item name="healthNote" label="Ghi chú tình trạng" rules={[{ max: 255, message: 'Tối đa 255 ký tự' }]}>
          <Input placeholder="VD: Bị hạn chế quảng cáo, chờ xác minh" maxLength={255} />
        </Form.Item>
        <Form.Item
          name="targetPostsPerWeek"
          label="Mục tiêu đăng bài / tuần"
          extra="Tuần tính từ Thứ Hai đến Chủ Nhật. Để trống = không đặt mục tiêu, không nhắc."
        >
          <InputNumber min={1} max={35} precision={0} placeholder="Chưa đặt" style={{ width: 160 }} />
        </Form.Item>
        {canAssignOwner && (
          <Form.Item
            name="ownerIds"
            label="Người phụ trách"
            extra="Chọn được nhiều người. Người chọn đầu tiên là người phụ trách chính (tô đậm)."
            rules={isEdit ? [{ required: true, type: 'array', min: 1, message: 'Cần ít nhất 1 người phụ trách' }] : undefined}
          >
            <Select<number[]>
              mode="multiple"
              showSearch
              allowClear={!isEdit}
              placeholder={isEdit ? 'Chọn nhân viên' : 'Chọn nhân viên (bỏ trống = chính bạn)'}
              optionFilterProp="searchText"
              maxTagCount="responsive"
              options={ownerPool.map((u) => ({
                value: u.id,
                label: <OwnerTag user={u} />,
                searchText: `${u.name} ${u.employeeCode ?? ''}`,
              }))}
              tagRender={({ value, closable, onClose }) => {
                const u = ownerPool.find((o) => o.id === value);
                return (
                  <OwnerTag
                    user={u ?? { id: Number(value), name: String(value) }}
                    primary={watchedOwnerIds?.[0] === value && (watchedOwnerIds?.length ?? 0) > 1}
                    closable={closable}
                    onClose={onClose}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  />
                );
              }}
            />
          </Form.Item>
        )}
        {isEdit && (
          <Form.Item name="isActive" label="Đang theo dõi" valuePropName="checked" extra="Tắt = tạm ngừng: Page mờ đi, không tính KPI và không nhắc đăng bài (vẫn giữ lịch sử bài đăng/ghi chú).">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}