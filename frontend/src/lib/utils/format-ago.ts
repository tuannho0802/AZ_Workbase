/** 90 -> "1 phút trước", 7300 -> "2 giờ trước". Dùng chung cho các bảng bảo mật (tính từ SỐ GIÂY do BE trả về). */
export function formatAgo(seconds: number): string {
    const s = Math.max(Math.floor(seconds), 0);
    if (s < 60) return 'vừa xong';
    if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
    if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
    return `${Math.floor(s / 86400)} ngày trước`;
}