'use client';

import { Tag, Tooltip } from 'antd';
import type { FanpageCadence } from '@/lib/api/fanpages.api';
import { CADENCE_META, formatSinceLastPost, formatWeekProgress } from '@/lib/utils/fanpageCadence';

interface Props {
    cadence: FanpageCadence;
    /** Hiện thêm "3/5 · Hôm qua" cạnh nhãn. */
    detail?: boolean;
}

/** Nhãn nhịp đăng: màu + icon + chữ (không dựa vào màu đơn độc). Trạng thái do BE tính - component này chỉ hiển thị. */
export function CadenceBadge({ cadence, detail = false }: Props) {
    const meta = CADENCE_META[cadence.state];
    const tip = `Tuần này: ${formatWeekProgress(cadence)} bài · Bài gần nhất: ${formatSinceLastPost(cadence)} · Chuỗi: ${cadence.streak} ngày`;
    return (
        <Tooltip title={tip}>
            <span>
                <Tag color={meta.color} style={{ marginInlineEnd: detail ? 6 : 0 }}>
                    <span aria-hidden>{meta.icon}</span> {meta.label}
                </Tag>
                {detail && (
                    <span style={{ fontSize: 12, opacity: 0.75 }}>
                        {formatWeekProgress(cadence)} · {formatSinceLastPost(cadence)}
                    </span>
                )}
            </span>
        </Tooltip>
    );
}