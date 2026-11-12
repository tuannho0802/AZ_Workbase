'use client';

import { Tag } from 'antd';
import type { FanpagePost } from '@/lib/api/fanpages.api';

/** Tag "Loại bài" (danh mục động, màu do Admin/Assistant chọn). Chưa phân loại -> gạch ngang mờ. */
export function PostTypeTag({ type }: { type: FanpagePost['postType'] | undefined }) {
    if (!type) return <span style={{ opacity: 0.45 }}>—</span>;
    return <Tag color={type.color}>{type.name}</Tag>;
}
