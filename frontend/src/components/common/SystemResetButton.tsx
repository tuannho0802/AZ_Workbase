'use client';

import { Button, Popconfirm, Tooltip } from 'antd';
import { SyncOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useSystemReset } from '@/lib/hooks/useSystemReset';

/**
 * Điều kiện hiển thị HARDCODE (không qua `can()`/bảng quyền): chỉ role `admin` VÀ `isRootAdmin` - cùng điều kiện lối thoát
 * hiểm của PermissionGuard. Đây chỉ là lớp ẩn nút; chặn thật ở BE (`RootAdminGuard` trên `POST /system/reset`).
 */
export function canSeeSystemReset(user: { role?: string; isRootAdmin?: boolean } | null | undefined): boolean {
  return user?.role === 'admin' && user.isRootAdmin === true;
}

export function SystemResetButton() {
  const user = useAuthStore((s) => s.user);
  const reset = useSystemReset();

  if (!canSeeSystemReset(user)) return null;

  return (
    <Popconfirm
      title="Reset hệ thống?"
      description="Mọi người dùng đang mở web sẽ tải lại toàn bộ dữ liệu mới nhất từ máy chủ (trong vòng ~2 phút). Không xoá hay thay đổi dữ liệu nào."
      okText="Reset"
      cancelText="Huỷ"
      placement="bottomRight"
      onConfirm={() => reset.mutateAsync().catch(() => undefined)}
    >
      <Tooltip title="Buộc mọi máy đồng bộ lại dữ liệu & cache">
        <Button icon={<SyncOutlined spin={reset.isPending} />} loading={reset.isPending} disabled={reset.isPending}>
          Reset hệ thống
        </Button>
      </Tooltip>
    </Popconfirm>
  );
}
