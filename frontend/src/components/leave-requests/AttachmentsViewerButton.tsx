'use client';

import { useState } from 'react';
import { Button, Modal, Image, Empty, Spin } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import { useAttachmentUrls } from '@/lib/hooks/useLeaveAttachments';

interface AttachmentsViewerButtonProps {
  requestId: number;
  size?: 'small' | 'middle';
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
                <Image
                  key={a.id}
                  src={a.url}
                  width={110}
                  height={110}
                  style={{ objectFit: 'cover', borderRadius: 6 }}
                />
              ))}
            </div>
          </Image.PreviewGroup>
        )}
      </Modal>
    </>
  );
}
