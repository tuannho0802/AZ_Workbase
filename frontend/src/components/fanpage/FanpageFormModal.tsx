'use client';

import { useEffect, useMemo } from 'react';
import { App, Form, Input, Modal, Select, Switch } from 'antd';
import {
  useCreateFanpage,
  useFanpageOwnerOptions,
  useFanpagePlatforms,
  useUpdateFanpage,
} from '@/lib/hooks/useFanpages';
import type { Fanpage, FanpageUserBrief } from '@/lib/api/fanpages.api';
import { OwnerTag } from './OwnerTag';
import { PlatformTag } from './PlatformTag';
import { sortOwnersPrimaryFirst } from '@/lib/utils/fanpageColors';
import { toastApiError } from '@/lib/utils/error-message.util';

interface FormValues {
  platformId: number;
  name: string;
  url: string;
  /** Phần tử đầu = người phụ trách chính. */
  ownerIds?: number[];
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
            ...(canAssignOwner && values.ownerIds?.length ? { ownerIds: values.ownerIds } : {}),
            isActive: values.isActive,
          },
        });
        message.success('Đã cập nhật Page');
      } else {
        await createMut.mutateAsync({
          platformId: values.platformId,
          name: values.name.trim(),
          url: values.url.trim(),
          ...(canAssignOwner && values.ownerIds?.length ? { ownerIds: values.ownerIds } : {}),
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
          <Input placeholder="https://facebook.com/ten-page" />
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
          <Form.Item name="isActive" label="Đang theo dõi" valuePropName="checked" extra="Tắt = ngừng theo dõi (vẫn giữ lịch sử bài đăng/ghi chú).">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}