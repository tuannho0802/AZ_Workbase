import { useMutation, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { systemApi } from '../api/system.api';
import { refreshAllClientCaches } from '../system-refresh';
import { toastApiError } from '../utils/error-message.util';
import { acknowledgeSystemEpoch } from './useSystemEpochSignal';

/** Nút "Reset hệ thống": gọi BE tăng epoch, rồi làm mới NGAY toàn bộ cache của chính máy này. Máy khác tự làm mới qua poll. */
export function useSystemReset() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  return useMutation({
    mutationFn: () => systemApi.reset(),
    onSuccess: async ({ epoch }) => {
      acknowledgeSystemEpoch(epoch); // poll sắp tới báo lại epoch này -> không làm mới lần 2
      await refreshAllClientCaches(queryClient);
      message.success('Đã reset hệ thống: dữ liệu mới nhất đang được đồng bộ cho mọi người dùng.');
    },
    onError: (err) => toastApiError(message, err, 'Không thể reset hệ thống'),
  });
}
