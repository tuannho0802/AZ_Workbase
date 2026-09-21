import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/** "5 phút trước" (theo locale dayjs đang đặt - 'vi' ở AntdAppProvider). */
export const formatRelative = (iso: string): string => dayjs(iso).fromNow();

/** "14:05 21/09/2026" - dùng làm tooltip. */
export const formatFullTime = (iso: string): string => dayjs(iso).format('HH:mm DD/MM/YYYY');
