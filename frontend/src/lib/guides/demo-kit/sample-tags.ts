/** Màu + tên mẫu dùng chung cho nhiều mẫu minh hoạ (màu thật do Admin cấu hình ở các trang Quản lý tương ứng). */
export interface SampleTag {
    name: string;
    color: string;
}

export const SAMPLE_STATUSES: SampleTag[] = [
    { name: 'Đã chốt', color: 'green' },
    { name: 'Chờ xử lý', color: 'gold' },
    { name: 'Tiềm năng', color: 'blue' },
    { name: 'Mất', color: 'red' },
];

export const SAMPLE_SOURCES: SampleTag[] = [
    { name: 'Facebook', color: 'blue' },
    { name: 'TikTok', color: 'magenta' },
    { name: 'Google', color: 'green' },
    { name: 'Instagram', color: 'purple' },
];
