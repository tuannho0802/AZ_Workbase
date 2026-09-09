import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadsApi, putFileToPresignedUrl, validateImageFile, AllowedImageType, UploadLimits } from '../api/uploads.api';
import { usersApi, UserDetail } from '../api/users.api';

const LIMITS_QUERY_KEY = ['upload-limits'];

/** Giới hạn size avatar/đính kèm - đọc động từ settings (Admin đổi được qua trang Nhân viên/Nghỉ phép). */
export function useUploadLimits() {
  const { data, isLoading, isError } = useQuery({
    queryKey: LIMITS_QUERY_KEY,
    queryFn: uploadsApi.getLimits,
    staleTime: 5 * 60 * 1000,
  });

  return { limits: data, isLoading, isError };
}

export function useUpdateUploadLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UploadLimits) => uploadsApi.updateLimits(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIMITS_QUERY_KEY }),
  });
}

/**
 * Toàn bộ luồng đổi avatar: validate size (đọc limit hiện tại) -> xin
 * Presigned PUT -> PUT thẳng file lên B2 -> xác nhận key mới với BE (BE tự
 * validate lại dung lượng THẬT trên B2 + xoá avatar cũ). Trả về UserDetail
 * đã có avatarUrl MỚI (đã ký sẵn) - component gọi hook này tự quyết định có
 * cập nhật vào authStore hay không (chỉ khi đang đổi avatar CHÍNH MÌNH).
 */
export function useUpdateAvatar() {
  const queryClient = useQueryClient();
  return useMutation<UserDetail, Error, File>({
    mutationFn: async (file: File) => {
      const limits = await uploadsApi.getLimits();
      const validationError = validateImageFile(file, limits.avatarMaxSizeKb);
      if (validationError) throw new Error(validationError);

      const { uploadUrl, key } = await uploadsApi.presignAvatar(file.type as AllowedImageType);
      await putFileToPresignedUrl(uploadUrl, file, file.type);
      return usersApi.updateOwnAvatar(key);
    },
    onSuccess: () => {
      // Trang "Nhân viên"/Profile danh sách hiện avatar - làm mới để không
      // còn lệch với avatar vừa đổi.
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
