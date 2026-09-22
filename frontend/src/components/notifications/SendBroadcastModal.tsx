'use client';

import { Modal } from 'antd';
import { useBroadcastCompose } from '@/lib/hooks/useBroadcastCompose';
import { BroadcastComposeFields } from './BroadcastComposeFields';

interface SendBroadcastModalProps {
  open: boolean;
  onClose: () => void;
  /** Gọi sau khi gửi thành công (vd để chuyển tới trang "Đã gửi"). */
  onSent?: (result: { id: number; recipientCount: number }) => void;
}

/**
 * Soạn & gửi Thông báo thủ công (PLAN mục 7.7) - dạng Modal, mở qua nút
 * "Soạn thông báo mới" ở `/thong-bao/da-gui` (người dùng CHỦ ĐỘNG bấm mở,
 * không auto mở). Logic dùng chung với trang `/thong-bao/gui` (Card
 * style-như-modal, không dùng `<Modal>` thật) qua `useBroadcastCompose` +
 * `BroadcastComposeFields` - xem 2 file đó để không sửa lệch nhau.
 */
export function SendBroadcastModal({ open, onClose, onSent }: SendBroadcastModalProps) {
  const state = useBroadcastCompose({ enabled: open, onSent });
  const { previewResult, dirtySincePreview, handleSend, sendPending, reset } = state;

  const resetAndClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      title="Soạn & gửi thông báo"
      open={open}
      onCancel={resetAndClose}
      okText={previewResult && !dirtySincePreview ? `Gửi tới ${previewResult.recipientCount} người` : 'Gửi'}
      cancelText="Huỷ"
      confirmLoading={sendPending}
      okButtonProps={{ disabled: !previewResult || dirtySincePreview || sendPending }}
      onOk={handleSend}
      destroyOnHidden
      width={620}
    >
      <BroadcastComposeFields state={state} />
    </Modal>
  );
}
