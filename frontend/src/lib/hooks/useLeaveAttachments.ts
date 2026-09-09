import { useQuery } from '@tanstack/react-query';
import { leaveRequestsApi } from '../api/leave-requests.api';

/**
 * URL ảnh đính kèm ký TTL 10 phút (dữ liệu nhạy cảm - giấy khám bệnh) - CHỈ
 * fetch khi `enabled=true` (mở modal xem ảnh), KHÔNG fetch sẵn cho cả bảng
 * danh sách đơn (tốn presign vô ích cho đơn không ai xem ảnh).
 */
export function useAttachmentUrls(requestId: number | null, enabled: boolean) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leave-request-attachments', requestId],
    queryFn: () => leaveRequestsApi.getAttachmentUrls(requestId as number),
    enabled: enabled && requestId !== null,
    staleTime: 0, // TTL ngắn (10 phút) - không cache lại giữa các lần mở modal
  });

  return { attachments: data ?? [], isLoading, isError };
}
