'use client';

import { Tag, Tooltip } from 'antd';
import type { FanpageHealthBrief } from '@/lib/api/fanpages.api';

interface Props {
    health: Pick<FanpageHealthBrief, 'name' | 'color'> | null | undefined;
    note?: string | null;
}

/** Tag "Tình trạng Page" (danh mục động, màu do Admin chọn). Có ghi chú -> hiện ở tooltip. */
export function HealthTag({ health, note }: Props) {
    if (!health) return <span style={{ opacity: 0.45 }}>—</span>;
    const tag = <Tag color={health.color}>{health.name}</Tag>;
    return note ? <Tooltip title={note}>{tag}</Tooltip> : tag;
}