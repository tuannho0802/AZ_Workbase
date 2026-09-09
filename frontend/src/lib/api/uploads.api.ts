import axiosInstance from './axios-instance';

export interface UploadLimits {
    avatarMaxSizeKb: number;
    leaveAttachmentMaxSizeKb: number;
    leaveAttachmentMaxCount: number;
}

export interface PresignResult {
    uploadUrl: string;
    key: string;
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const uploadsApi = {
    // Không gắn permission riêng ở BE (mọi user đã đăng nhập gọi được) - dùng
    // để validate size/count phía FE TRƯỚC khi cho chọn ảnh (avatar + đính
    // kèm nghỉ phép), tránh upload xong mới bị BE từ chối.
    getLimits: async (): Promise<UploadLimits> => {
        const response = await axiosInstance.get<UploadLimits>('/uploads/limits');
        return response.data;
    },

    updateLimits: async (data: UploadLimits): Promise<UploadLimits> => {
        const response = await axiosInstance.patch<UploadLimits>('/uploads/limits', data);
        return response.data;
    },

    // Xin Presigned PUT URL để FE tự PUT thẳng file lên B2 (không qua backend) -
    // yêu cầu quyền `profile.edit_avatar`.
    presignAvatar: async (contentType: AllowedImageType): Promise<PresignResult> => {
        const response = await axiosInstance.post<PresignResult>('/uploads/avatar/presign', { contentType });
        return response.data;
    },
};

/**
 * Upload 1 file thẳng lên B2 bằng Presigned PUT URL - dùng `fetch` thuần
 * (KHÔNG dùng `axiosInstance`) vì URL này trỏ THẲNG ra Backblaze B2, không
 * phải API backend: axiosInstance sẽ tự gắn `Authorization: Bearer <JWT>` -
 * B2 sẽ từ chối request có header lạ + không cần token app của mình ở đây,
 * mọi quyền hạn đã nằm sẵn trong URL đã ký (presigned URL).
 */
export async function putFileToPresignedUrl(uploadUrl: string, file: File | Blob, contentType: string): Promise<void> {
    const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
    });
    if (!res.ok) {
        throw new Error(`Upload lên B2 thất bại (HTTP ${res.status})`);
    }
}

/** Validate contentType + size TRƯỚC khi xin presign - trả về thông báo lỗi (null nếu hợp lệ). */
export function validateImageFile(file: File, maxSizeKb: number): string | null {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
        return 'Chỉ chấp nhận ảnh định dạng JPEG/PNG/WEBP';
    }
    if (file.size > maxSizeKb * 1024) {
        return `Ảnh vượt quá dung lượng cho phép (${maxSizeKb}KB)`;
    }
    return null;
}