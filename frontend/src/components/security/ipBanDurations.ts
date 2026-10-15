/** Thời hạn chặn IP chủ động (P3.7). `hours = null` = vĩnh viễn. Mặc định nên chọn có hạn thay vì vĩnh viễn. */
export const IP_BAN_DURATIONS: Array<{ value: string; label: string; hours: number | null }> = [
    { value: '1h', label: '1 giờ', hours: 1 },
    { value: '24h', label: '24 giờ', hours: 24 },
    { value: '7d', label: '7 ngày', hours: 168 },
    { value: '30d', label: '30 ngày', hours: 720 },
    { value: 'perm', label: 'Vĩnh viễn', hours: null },
];
export const DEFAULT_IP_BAN_DURATION = '24h';

/** 90 -> "2 phút", 7300 -> "2 giờ 1 phút", 200000 -> "2 ngày 7 giờ"; null -> "Vĩnh viễn". */
export function formatBanRemaining(seconds: number | null): string {
    if (seconds === null) return 'Vĩnh viễn';
    const s = Math.max(Math.floor(seconds), 0);
    if (s < 60) return 'dưới 1 phút';
    if (s < 3600) return `${Math.floor(s / 60)} phút`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`;
    return `${Math.floor(s / 86400)} ngày ${Math.floor((s % 86400) / 3600)} giờ`;
}
