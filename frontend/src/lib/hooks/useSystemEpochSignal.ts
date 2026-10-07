import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { refreshAllClientCaches } from '../system-refresh';

/**
 * Máy KHÁC của Root Admin / mọi user: làm mới sau 0..JITTER giây ngẫu nhiên để hàng chục tab không cùng tải lại
 * một lúc (Vercel tính theo CPU, xem PLAN_CPU_OPTIMIZATION_ROUND2).
 */
export const SYSTEM_EPOCH_JITTER_MAX_MS = 8_000;

// Epoch mà CHÍNH máy này vừa tạo ra (người bấm Reset): đã tự làm mới ngay nên bỏ qua khi poll báo lại.
let acknowledgedEpoch: number | undefined;
export function acknowledgeSystemEpoch(epoch: number): void {
  acknowledgedEpoch = epoch;
}
/** Chỉ dùng trong test. */
export function resetSystemEpochAcknowledgement(): void {
  acknowledgedEpoch = undefined;
}

/**
 * Nhận `epoch` từ poll (xem `PermissionsVersionService.getEpoch` ở BE) và làm mới toàn bộ cache khi Root Admin bấm
 * "Reset hệ thống". Cùng kiểu `usePermissionChangeSignal`:
 *  - Lần đầu thấy epoch của phiên: chỉ ghi nhớ mốc (dữ liệu vừa tải lúc mở trang đã mới).
 *  - Epoch khác mốc: làm mới toàn bộ (sau jitter), trừ khi chính máy này vừa tạo ra epoch đó.
 *  - Đổi user đăng nhập: đặt lại mốc, không coi là Reset. BE cũ chưa trả `epoch` (undefined): bỏ qua.
 *
 * Gọi ĐÚNG 1 LẦN (trong `useNotificationPoll`).
 */
export function useSystemEpochSignal(epoch: number | undefined, userId: number | undefined) {
  const queryClient = useQueryClient();
  const baseline = useRef<{ userId: number | undefined; epoch: number | undefined }>({
    userId: undefined,
    epoch: undefined,
  });

  useEffect(() => {
    if (epoch === undefined) return;

    const prev = baseline.current;
    baseline.current = { userId, epoch };

    if (prev.epoch === undefined || prev.userId !== userId || prev.epoch === epoch) return;
    if (acknowledgedEpoch === epoch) return;

    const timer = setTimeout(() => {
      if (acknowledgedEpoch === epoch) return; // trong lúc chờ, chính máy này đã làm mới
      void refreshAllClientCaches(queryClient);
    }, Math.floor(Math.random() * SYSTEM_EPOCH_JITTER_MAX_MS));
    return () => clearTimeout(timer);
  }, [epoch, userId, queryClient]);
}
