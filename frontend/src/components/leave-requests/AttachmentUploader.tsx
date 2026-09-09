'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Upload, App } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { leaveRequestsApi } from '@/lib/api/leave-requests.api';
import { putFileToPresignedUrl, validateImageFile } from '@/lib/api/uploads.api';
import { useUploadLimits } from '@/lib/hooks/useUploads';

interface AttachmentUploaderProps {
  /**
   * Loại nghỉ phép hiện đang chọn trong Form cha (`nghi-phep/page.tsx`) -
   * BẮT BUỘC phải có giá trị lúc `uploadAll()` chạy vì BE
   * (`PresignAttachmentDto.leaveType`) yêu cầu tường minh, không có giá trị
   * mặc định. Chưa chọn -> `uploadAll()` ném lỗi ngay, không presign ảnh nào.
   */
  leaveType?: string;
}

export interface AttachmentUploaderHandle {
  /**
   * Upload TOÀN BỘ ảnh đang giữ CỤC BỘ TRONG BROWSER (chưa hề chạm B2) lên
   * B2 - CHỈ gọi đúng 1 lần, tại thời điểm submit form (bấm "Tạo đơn").
   * Presign + PUT tuần tự từng ảnh (giữ đúng thứ tự N để backend đặt tên
   * file đúng thứ tự hiển thị). Nếu 1 ảnh bất kỳ lỗi giữa chừng, ném lỗi
   * ngay - nơi gọi (nghi-phep/page.tsx) PHẢI bắt lỗi này và KHÔNG được gọi
   * `leaveRequestsApi.create()`, tránh tạo đơn thiếu ảnh mà không báo.
   *
   * ⚠️ Khác bản cũ (eager-upload): trước đây mỗi ảnh được PUT lên B2 NGAY
   * lúc chọn, huỷ Modal phải gọi `discardAttachments()` để dọn rác - tốn
   * bandwidth PUT+DELETE dù đơn không bao giờ được tạo. Giờ ảnh chỉ tồn tại
   * dưới dạng `File` object trong RAM trình duyệt (xem `fileList` bên dưới)
   * cho tới khi hàm này được gọi -> huỷ Modal trước khi submit = 0 byte gửi
   * lên B2, không cần discard.
   */
  uploadAll: () => Promise<string[]>;
  /** Đang giữ ảnh nào cục bộ hay không - dùng để quyết định có cần gọi `uploadAll()` không. */
  hasFiles: () => boolean;
}

/**
 * Ant Form KHÔNG còn bọc component này bằng `<Form.Item name="attachmentKeys">`
 * kiểu controlled value/onChange nữa (xem `nghi-phep/page.tsx`) - component
 * chỉ giữ `File` object THẬT trong `fileList` (antd `UploadFile.originFileObj`),
 * KHÔNG gọi bất kỳ network request nào cho tới khi component cha gọi
 * `ref.current.uploadAll()`. `beforeUpload` luôn trả `false` để chặn antd tự
 * upload - đây là pattern "manual upload" chuẩn của antd Upload.
 *
 * ⚠️ Reset khi đóng/mở lại Modal tạo đơn: nơi gọi component này vẫn truyền
 * `key={resetCounter}` đổi mỗi lần mở Modal, buộc React remount lại
 * component -> `fileList` tự về [] (không cần logic dọn B2 kèm theo nữa).
 */
export const AttachmentUploader = forwardRef<AttachmentUploaderHandle, AttachmentUploaderProps>(
  function AttachmentUploader({ leaveType }, ref) {
    const { message } = App.useApp();
    const { limits } = useUploadLimits();
    const [fileList, setFileList] = useState<UploadFile[]>([]);

    const maxCount = limits?.leaveAttachmentMaxCount ?? 5;
    const maxSizeKb = limits?.leaveAttachmentMaxSizeKb ?? 1536;

    useImperativeHandle(
      ref,
      () => ({
        hasFiles: () => fileList.length > 0,
        uploadAll: async () => {
          if (fileList.length === 0) return [];
          if (!leaveType) {
            throw new Error('Vui lòng chọn Loại phép trước khi đính kèm ảnh');
          }

          const keys: string[] = [];
          // Tuần tự (không Promise.all) - giữ đúng thứ tự N cho tên file,
          // đồng thời tránh spam nhiều PUT B2 cùng lúc nếu người dùng đính
          // kèm sát giới hạn `maxCount`.
          for (let i = 0; i < fileList.length; i++) {
            const f = fileList[i].originFileObj as File | undefined;
            if (!f) continue; // Không nên xảy ra với `beforeUpload` trả false, phòng thủ thôi.

            const { uploadUrl, key } = await leaveRequestsApi.presignAttachment(f.type, leaveType, i + 1);
            await putFileToPresignedUrl(uploadUrl, f, f.type);
            keys.push(key);
          }
          return keys;
        },
      }),
      [fileList, leaveType],
    );

    const beforeUpload: UploadProps['beforeUpload'] = (file) => {
      const validationError = validateImageFile(file, maxSizeKb);
      if (validationError) {
        message.error(validationError);
        return Upload.LIST_IGNORE;
      }
      // false = KHÔNG để antd tự upload - chỉ thêm vào fileList cục bộ,
      // upload thật xảy ra trong `uploadAll()` lúc submit.
      return false;
    };

    return (
      <Upload
        listType="picture-card"
        fileList={fileList}
        beforeUpload={beforeUpload}
        onChange={({ fileList: fl }) => setFileList(fl)}
        accept="image/jpeg,image/png,image/webp"
        maxCount={maxCount}
        multiple
      >
        {fileList.length >= maxCount ? null : (
          <div>
            <PlusOutlined />
            <div style={{ marginTop: 8, fontSize: 12 }}>Thêm ảnh</div>
          </div>
        )}
      </Upload>
    );
  },
);