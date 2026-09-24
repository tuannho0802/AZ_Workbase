'use client';

import { Tag } from 'antd';
import { PERIOD_TYPE_LABELS, type PeriodType } from '@/lib/api/periodic-tasks.api';

/**
 * Màu Tag theo Loại kỳ - HARDCODE (không có cấu hình trong DB, `PeriodType` là enum cố định
 * 4 giá trị). Chọn màu preset của antd, tránh trùng các màu mặc định của Trạng thái Task
 * (vàng/xanh dương/tím/xanh lá) để 2 loại Tag đứng cạnh nhau vẫn phân biệt được.
 */
export const PERIOD_TYPE_COLORS: Record<PeriodType, string> = {
    daily: 'cyan',
    weekly: 'geekblue',
    monthly: 'magenta',
    yearly: 'volcano',
};

interface Props {
    type: PeriodType;
    style?: React.CSSProperties;
}

/** Tag Loại kỳ (Ngày/Tuần/Tháng/Năm) có màu - dùng CHUNG mọi nơi hiển thị Loại kỳ. */
export function PeriodTypeTag({ type, style }: Props) {
    return (
        <Tag color={PERIOD_TYPE_COLORS[type]} style={style}>
            {PERIOD_TYPE_LABELS[type] ?? type}
        </Tag>
    );
}
