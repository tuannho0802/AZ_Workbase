'use client';

import { useState } from 'react';
import { Button, Modal, Image, Empty, Spin, Badge } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import { useAttachmentUrls } from '@/lib/hooks/useLeaveAttachments';
import { useCachedImage, buildImageCacheKey } from '@/lib/hooks/useCachedImage';

interface AttachmentsViewerButtonProps {
  requestId: number;
  size?: 'small' | 'middle';
  // Số ảnh đính kèm - truyền từ `record.attachmentCount` (BE tính sẵn qua
  // loadRelationCountAndMap ở findAll()/findPending()/findHistory(), xem
  // leave-requests.service.ts) để hiện ngay số lượng KHÔNG cần bấm vào từng
  // đơn mới biết có ảnh hay không (trước đây mọi nút đều giống hệt nhau,
  // chủ dự án phản ánh phải kiểm tra thủ công từng đơn). Optional - nơi nào
  // chưa truyền (hoặc BE chưa trả field này) thì fallback về hành vi CŨ
  // (không có Badge, bấm mới biết).
  count?: number;
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
 * (duyet-phep). Hiện Badge số lượng ảnh ngay trên nút (từ prop `count`, xem
 * JSDoc ở interface) để phân biệt đơn nào CÓ/KHÔNG có ảnh đính kèm mà không
 * cần bấm thử từng đơn - bấm vào mới thực sự gọi GET
 * /leave-requests/:id/attachment-urls để tải ảnh xem trước (Badge chỉ là số
 * đếm hiển thị nhanh, không tải trước ảnh).
 */
export function AttachmentsViewerButton({ requestId, size = 'small', count }: AttachmentsViewerButtonProps) {
  const [open, setOpen] = useState(false);
  const { attachments, isLoading } = useAttachmentUrls(requestId, open);

  const hasCount = typeof count === 'number';

  return (
    <>
      <Badge count={hasCount ? count : 0} size="small" offset={[-4, 2]} showZero={false}>
        <Button
          size={size}
          icon={<PaperClipOutlined />}
          // Đơn xác nhận không có ảnh nào (count=0, không phải chưa biết) -
          // làm nhạt nút để mắt lướt qua nhanh, vẫn bấm được (không disable)
          // để không đổi hành vi/luồng cũ nếu chủ dự án vẫn muốn mở Modal
          // xem "Đơn này không có ảnh đính kèm" cho chắc chắn.
          type={hasCount && count === 0 ? 'text' : 'default'}
          style={hasCount && count === 0 ? { color: '#bfbfbf' } : undefined}
          onClick={() => setOpen(true)}
        >
          Đính kèm
        </Button>
      </Badge>
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