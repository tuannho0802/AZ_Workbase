'use client';

import { useRef } from 'react';
import { Avatar, Spin, App } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import { useUpdateAvatar } from '@/lib/hooks/useUploads';
import { useAuthStore } from '@/lib/stores/auth.store';

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1]?.[0]?.toUpperCase() ?? '?';
}

interface AvatarUploadProps {
  avatarUrl?: string | null;
  name?: string;
  size?: number;
  /** true nếu người đang xem ĐƯỢC PHÉP đổi avatar này (isSelf && can('profile.edit_avatar')). */
  editable: boolean;
  /** true nếu avatar này là CỦA CHÍNH người đang đăng nhập - cập nhật luôn authStore để header đổi theo ngay, không cần F5. */
  isSelf?: boolean;
  /** Gọi lại sau khi đổi thành công (vd để refetch chi tiết user) - nhận avatarUrl mới. */
  onUpdated?: (avatarUrl: string) => void;
}

/**
 * Avatar bấm để đổi ảnh - toàn bộ luồng presign + PUT B2 + xác nhận key nằm
 * trong `useUpdateAvatar()` (lib/hooks/useUploads.ts), component này chỉ lo
 * UI: overlay loading khi đang upload, icon camera góc dưới phải khi
 * `editable`, input file ẩn (KHÔNG dùng antd `<Upload>` để giữ đơn giản, vì
 * luồng thật là presign trước rồi mới PUT thẳng ra ngoài B2 - không phải
 * multipart form POST bình thường mà `<Upload>` mặc định hỗ trợ).
 */
export function AvatarUpload({ avatarUrl, name, size = 72, editable, isSelf, onUpdated }: AvatarUploadProps) {
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useUpdateAvatar();
  const currentUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const handleFile = async (file: File) => {
    try {
      const updated = await mutation.mutateAsync(file);
      message.success('Đã cập nhật ảnh đại diện');
      if (isSelf && currentUser) {
        setUser({ ...currentUser, avatarUrl: updated.avatarUrl ?? null });
      }
      onUpdated?.(updated.avatarUrl ?? '');
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Đổi ảnh đại diện thất bại');
    }
  };

  const onChangeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset ngay để chọn lại ĐÚNG file cũ (vd chụp lại) vẫn kích hoạt onChange -
    // input không tự bắn sự kiện nếu value không đổi.
    e.target.value = '';
    if (file) handleFile(file);
  };

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <Avatar size={size} src={avatarUrl || undefined} style={{ backgroundColor: '#1677ff', fontSize: size * 0.38 }}>
        {!avatarUrl ? getInitials(name) : undefined}
      </Avatar>

      {mutation.isPending && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spin size="small" />
        </div>
      )}

      {editable && !mutation.isPending && (
        <div
          onClick={() => inputRef.current?.click()}
          title="Đổi ảnh đại diện"
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: Math.max(20, size * 0.32),
            height: Math.max(20, size * 0.32),
            borderRadius: '50%',
            background: '#1677ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: '2px solid #fff',
          }}
        >
          <CameraOutlined style={{ color: '#fff', fontSize: Math.max(10, size * 0.16) }} />
        </div>
      )}

      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={onChangeInput}
        />
      )}
    </div>
  );
}
