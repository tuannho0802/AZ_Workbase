import { create } from 'zustand';
import type { NotificationItem } from '../types/notification.types';

interface NotificationUiState {
  /** Thông báo đang mở trong Modal chi tiết (thông báo thủ công) */
  detail: NotificationItem | null;
  openDetail: (item: NotificationItem) => void;
  closeDetail: () => void;
}

export const useNotificationUiStore = create<NotificationUiState>((set) => ({
  detail: null,
  openDetail: (item) => set({ detail: item }),
  closeDetail: () => set({ detail: null }),
}));
