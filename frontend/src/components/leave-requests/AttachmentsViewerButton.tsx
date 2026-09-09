'use client';

import { useState } from 'react';
import { Button, Modal, Image, Empty, Spin } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import { useAttachmentUrls } from '@/lib/hooks/useLeaveAttachments';
import { useCachedImage, buildImageCacheKey } from '@/lib/hooks/useCachedImage';

interface AttachmentsViewerButtonProps {
  requestId: number;
  size?: 'small' | 'middle';
}

/**
 * 1 ảnh đính kèm - tách riêng component để mỗi ảnh gọi `useCachedImage` độc
 * lập (hook cần biết `key` + `url` của ĐÚNG 1 ảnh, không lồng vào .map trần
 * trụi để tránh vi phạm rule-of-hooks).
 */
function AttachmentImage({ objectKey, url }: { objectKey: string; url: string }) {
  // Dùng `objectKey` thô trên B2 (BE trả thêm ở getAttachmentViewUrls) qua
  // buildImageCacheKey('leave-attachments', ...) - KHỚP với cacheKey mà
  // storage-img dùng cho CÙNG bucket này, tránh cache trùng 2 bản cho cùng
  // 1 ảnh đính kèm (trước đây dùng `id` - ổn định nhưng không khớp key bên
  // storage-img).
  const cachedSrc = useCachedImage(buildImageCacheKey('leave-attachments', objectKey), url);
  return (
    <Image
      src={cachedSrc || url}
      width={110}
      height={110}
      style={{ objectFit: 'cover', borderRadius: 6 }}
    />
  );
}

/**
 * Dùng chung cho cả bảng "Đơn của tôi" (nghi-phep) lẫn "Duyệt phép"
 * (duyet-phep) - BE không trả sẵn số lượng ảnh đính kèm trong danh sách đơn
 * (findAll/findPending/findHistory không load relation `attachments`, xem
 * leave-requests.service.ts), nên nút này LUÔN hiện ở mọi dòng; bấm vào mới
 * gọi GET /leave-requests/:id/attachment-urls để biết có ảnh hay không.
 */
export function AttachmentsViewerButton({ requestId, size = 'small' }: AttachmentsViewerButtonProps) {
  const [open, setOpen] = useState(false);
  const { attachments, isLoading } = useAttachmentUrls(requestId, open);

  return (
    <>
      <Button size={size} icon={<PaperClipOutlined />} onClick={() => setOpen(true)}>
        Đính kèm
      </Button>
      <Modal
        title="Ảnh đính kèm đơn nghỉ phép"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : attachments.length === 0 ? (
          <Empty description="Đơn này không có ảnh đính kèm" />
        ) : (
          <Image.PreviewGroup>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {attachments.map((a) => (
                <AttachmentImage key={a.id} objectKey={a.key} url={a.url} />
              ))}
            </div>
          </Image.PreviewGroup>
        )}
      </Modal>
    </>
  );
}