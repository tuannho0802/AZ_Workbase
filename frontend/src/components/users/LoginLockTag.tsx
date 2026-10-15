'use client';

import { Tag, Tooltip } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { countryName } from '@/lib/utils/country';
import { formatCountdown, useCountdown } from '@/lib/hooks/useCountdown';

/**
 * Thẻ "Bị khoá đăng nhập mm:ss" - đồng hồ đếm ngược thời gian còn lại đến khi tự mở khoá.
 * `seconds` = `loginLockSeconds` do GET /users trả về. Về 0 -> gọi `onExpire` (để trang tải lại danh sách).
 * Không render gì khi không bị khoá.
 */
export function LoginLockTag({
  seconds,
  onExpire,
  lastLoginIp,
  lastLoginIpCountryCode,
}: {
  seconds?: number;
  onExpire?: () => void;
  /** IP đăng nhập thành công gần nhất (P3.3) - hiện trong tooltip để Admin đối chiếu với tab "IP bị khoá". */
  lastLoginIp?: string | null;
  /** P3.6: quốc gia của `lastLoginIp` (BE `lastLoginIpCountryCode`) - chỉ thêm chữ vào tooltip. */
  lastLoginIpCountryCode?: string | null;
}) {
  const remaining = useCountdown(seconds, onExpire);
  if (!seconds || remaining <= 0) return null;
  const tag = (
    <Tag color="volcano" icon={<LockOutlined />} style={{ marginInlineEnd: 0 }}>
      Bị khoá đăng nhập {formatCountdown(remaining)}
    </Tag>
  );
  return lastLoginIp ? <Tooltip title={`IP đăng nhập gần nhất: ${lastLoginIp}${lastLoginIpCountryCode ? ` (${countryName(lastLoginIpCountryCode)})` : ''}`}>{tag}</Tooltip> : tag;
}
