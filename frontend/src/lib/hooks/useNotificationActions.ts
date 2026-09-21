import { useCallback } from 'react';
import { App } from 'antd';
import { useRouter } from 'next/navigation';
import { useNotificationMutations } from './useNotifications';
import { resolveNotificationTarget } from '../notifications/resolve-link';
import { useNotificationUiStore } from '../stores/notification-ui.store';
import type { NotificationItem } from '../types/notification.types';

/**
 * "Bấm vào 1 thông báo" - MỘT chỗ duy nhất cho chuông, trang /thong-bao và
 * toast: đánh dấu đã đọc (không chờ) rồi điều hướng / mở Modal / báo nhẹ.
 */
export function useNotificationActions() {
  const router = useRouter();
  const { message } = App.useApp();
  const { markRead } = useNotificationMutations();
  const markReadMutate = markRead.mutate;
  const openDetail = useNotificationUiStore((s) => s.openDetail);

  const open = useCallback(
    (item: NotificationItem) => {
      if (!item.isRead) markReadMutate(item.id);

      const target = resolveNotificationTarget(item);
      switch (target.kind) {
        case 'navigate':
          router.push(target.href);
          break;
        case 'modal':
          openDetail(item);
          break;
        case 'unavailable':
          message.info('Bản ghi này không còn khả dụng (đã bị xoá).');
          break;
        default:
          break;
      }
    },
    [markReadMutate, router, openDetail, message],
  );

  return { open };
}
