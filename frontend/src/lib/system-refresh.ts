import type { QueryClient } from '@tanstack/react-query';
import { refreshMe } from './hooks/useMe';
import { useAuthStore } from './stores/auth.store';
import type { User } from './types/auth.types';

/**
 * [Reset hệ thống] Làm mới TOÀN BỘ dữ liệu phía client:
 *  1. Đánh dấu MỌI query React Query là cũ: query đang hiển thị tải lại ngay, query chưa mở tải lại khi mở trang
 *     (kể cả danh mục staleTime 2 giờ). Giao diện giữ dữ liệu cũ tới khi có dữ liệu mới - không nháy trống.
 *  2. Tải lại `/users/me` và ghi đè phần "danh tính" trong auth store (role, phòng ban, Root Admin, avatar) - các field
 *     này chỉ được set 1 lần lúc đăng nhập nên có thể cũ nếu Admin đã đổi trong DB.
 * Không throw: làm mới nền không được phá UI.
 */
export async function refreshAllClientCaches(queryClient: QueryClient): Promise<void> {
  const invalidated = queryClient.invalidateQueries();
  try {
    const fresh = await refreshMe(queryClient); // đang tải sẵn do bước 1 thì dùng chung request
    const current = useAuthStore.getState().user;
    if (current && current.id === fresh.id) {
      const next: User = {
        ...current,
        role: fresh.role as User['role'],
        isActive: fresh.isActive,
        isRootAdmin: !!fresh.isRootAdmin,
        department: fresh.department ?? undefined,
        avatarUrl: fresh.avatarUrl ?? null,
        avatarKey: fresh.avatarKey ?? null,
      };
      useAuthStore.getState().setUser(next);
    }
  } catch {
    // Lỗi mạng tạm thời: lần poll/tải trang sau tự lành.
  }
  await invalidated.catch(() => undefined);
}
