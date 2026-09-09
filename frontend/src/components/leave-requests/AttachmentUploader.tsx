'use client';

import { useState } from 'react';
import { Upload, App } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { leaveRequestsApi } from '@/lib/api/leave-requests.api';
import { putFileToPresignedUrl, validateImageFile } from '@/lib/api/uploads.api';
import { useUploadLimits } from '@/lib/hooks/useUploads';

interface AttachmentUploaderProps {
  /** Danh sách object key ĐÃ upload xong lên B2 - gửi kèm khi POST /leave-requests. */
  value?: string[];
  onChange?: (keys: string[]) => void;
}

/**
 * Ant Form tự truyền `value`/`onChange` khi bọc trong `<Form.Item name="attachmentKeys">`
 * (đúng convention controlled-field của antd) - component này KHÔNG tự giữ
 * "nguồn sự thật" là mảng key, chỉ giữ `fileList` (state UI của antd Upload:
 * thumbnail, trạng thái uploading/lỗi) để hiển thị.
 *
 * ⚠️ Reset khi đóng/mở lại Modal tạo đơn: KHÔNG tự đồng bộ lại `fileList`
 * theo `value` bằng useEffect (dễ rối khi user tự xoá từng ảnh) - nơi gọi
 * component này (nghi-phep/page.tsx) phải truyền `key={resetCounter}` đổi
 * mỗi lần mở Modal, buộc React remount lại component -> fileList tự về [].
 */
export function AttachmentUploader({ value = [], onChange }: AttachmentUploaderProps) {
  const { message } = App.useApp();
  const { limits } = useUploadLimits();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const maxCount = limits?.leaveAttachmentMaxCount ?? 5;
  const maxSizeKb = limits?.leaveAttachmentMaxSizeKb ?? 1536;

  const customRequest: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError, onProgress } = options;
    const f = file as File;

    const validationError = validateImageFile(f, maxSizeKb);
    if (validationError) {
      onError?.(new Error(validationError));
      message.error(validationError);
      return;
    }

    try {
      onProgress?.({ percent: 30 });
      const { uploadUrl, key } = await leaveRequestsApi.presignAttachment(f.type);
      onProgress?.({ percent: 60 });
      await putFileToPresignedUrl(uploadUrl, f, f.type);
      onProgress?.({ percent: 100 });
      onSuccess?.({ key });
      onChange?.([...value, key]);
    } catch (err) {
      onError?.(err as Error);
      message.error('Upload ảnh đính kèm thất bại, thử lại');
    }
  };

  const handleRemove = (file: UploadFile) => {
    const key = (file.response as { key?: string } | undefined)?.key;
    if (key) onChange?.(value.filter((k) => k !== key));
  };

  return (
    <Upload
      listType="picture-card"
      fileList={fileList}
      customRequest={customRequest}
      onChange={({ fileList: fl }) => setFileList(fl)}
      onRemove={handleRemove}
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
}
