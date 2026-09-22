import { useMemo, useState } from 'react';
import { Form, App } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../api/users.api';
import { departmentsApi } from '../api/departments.api';
import type { Department } from '../api/departments.api';
import { useMyPermissions } from './useMyPermissions';
import { usePreviewBroadcast, useSendBroadcast } from './useNotificationBroadcasts';
import type { BroadcastAudienceType } from '../api/notification-broadcasts.api';

// ⚠️ MỚI (đồng bộ Tag Vai trò/Phòng ban/Vị trí - mirror ĐÚNG `FilterUserOption`
// ở CustomerFilters.tsx/`renderUserOption` ở cong-viec-dinh-ky/page.tsx) -
// trước đây chỉ có {id,name}, dropdown "Chọn người nhận" hiện tên trơn,
// không đồng bộ với các dropdown chọn nhân viên khác trong app (báo qua ảnh
// chụp). `usersApi.getAllForSelect()` gọi cùng route `GET /users/all` đã
// JOIN department+position (users.service.ts#findEmployees) nên KHÔNG cần
// đổi nguồn dữ liệu, chỉ cần khai đủ field ở type này.
export interface UserOption {
  id: number;
  name: string;
  role?: string;
  department?: { id: number; name: string; color?: string } | null;
  position?: { id: number; name: string; color?: string } | null;
}

export interface UseBroadcastComposeOptions {
  /** Chỉ query danh sách người dùng/phòng ban khi form đang thực sự hiển thị. */
  enabled: boolean;
  /** Gọi sau khi gửi thành công (vd để chuyển tới trang "Đã gửi"). */
  onSent?: (result: { id: number; recipientCount: number }) => void;
}

/**
 * Logic soạn & gửi Thông báo thủ công (PLAN mục 7.7) - TÁCH RIÊNG khỏi
 * `SendBroadcastModal` để dùng chung cho cả 2 nơi hiển thị:
 *  - Modal (nút "Soạn thông báo mới" ở `/thong-bao/da-gui`).
 *  - Trang `/thong-bao/gui` (Card style-như-modal, KHÔNG dùng `<Modal>` thật -
 *    theo yêu cầu chủ dự án: "auto mở modal" khi vào trang khá phiền).
 *
 * ⚠️ Nút "Gửi" CHỈ bật sau khi đã bấm "Xem trước người nhận" thành công
 * (SKILL_NEXTJS_FRONTEND §8.2 chống bấm đúp) - đổi bất kỳ trường nào của
 * audience/tiêu đề/nội dung sau khi đã preview đều bắt preview lại, vì BE
 * chốt người nhận tại thời điểm gửi, không tin lại preview cũ.
 */
export function useBroadcastCompose({ enabled, onSent }: UseBroadcastComposeOptions) {
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
    enabled,
  });
  const { data: departments = [], isLoading: deptsLoading } = useQuery<Department[]>({
    queryKey: ['departments-for-select'],
    queryFn: () => departmentsApi.getAll(),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const preview = usePreviewBroadcast();
  const send = useSendBroadcast();

  // Giữ `user`/`department` (object gốc) kèm theo mỗi option - cần cho
  // `optionRender` (Tag màu) ở `BroadcastComposeFields.tsx`, mirror đúng
  // pattern `options={salesUsers.map(u => ({ value: u.id, label: u.name, user: u }))}`
  // ở CustomerFilters.tsx.
  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.id,
        label: u.name,
        user: u,
      })),
    [users],
  );
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name, department: d })),
    [departments],
  );

  const reset = () => {
    form.resetFields();
    setAudienceType('USERS');
    setPreviewResult(null);
    setDirtySincePreview(false);
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
      reset();
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

  return {
    form,
    audienceType,
    setAudienceType,
    markDirty,
    canSelectAll,
    userOptions,
    usersLoading,
    departmentOptions,
    deptsLoading,
    previewResult,
    dirtySincePreview,
    handlePreview,
    previewPending: preview.isPending,
    handleSend,
    sendPending: send.isPending,
    reset,
  };
}

export type BroadcastComposeState = ReturnType<typeof useBroadcastCompose>;