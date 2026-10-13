'use client';

import { Tag } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { formatCountdown, useCountdown } from '@/lib/hooks/useCountdown';

/**
 * Thẻ "Bị khoá đăng nhập mm:ss" - đồng hồ đếm ngược thời gian còn lại đến khi tự mở khoá.
 * `seconds` = `loginLockSeconds` do GET /users trả về. Về 0 -> gọi `onExpire` (để trang tải lại danh sách).
 * Không render gì khi không bị khoá.
 */
export function LoginLockTag({ seconds, onExpire }: { seconds?: number; onExpire?: () => void }) {
  const remaining = useCountdown(seconds, onExpire);
  if (!seconds || remaining <= 0) return null;
  return (
    <Tag color="volcano" icon={<LockOutlined />} style={{ marginInlineEnd: 0 }}>
      Bị khoá đăng nhập {formatCountdown(remaining)}
    </Tag>
  );
}
