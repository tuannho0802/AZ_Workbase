'use client';

import { Tooltip } from 'antd';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';

interface Props {
    task: Pick<PeriodicTask, 'primaryAssignee' | 'secondaryAssignees'>;
    /** `inline` (mặc định): "Chính · +Phụ A, Phụ B" trên 1 dòng (thẻ/lịch); `stacked`: phụ xuống dòng dưới (bảng). */
    layout?: 'inline' | 'stacked';
}

/**
 * TaskAssignees - hiện Phụ trách CHÍNH + các Phụ trách PHỤ của 1 Task, dùng CHUNG cho
 * mọi view (Bảng/Ngày/Kanban/Lịch). `secondaryAssignees` do `GET /periodic-tasks` đính
 * sẵn (1 query gom nhóm). Hiện tối đa 2 tên phụ, còn lại gộp "+N" (tooltip đủ danh sách).
 */
export function TaskAssignees({ task, layout = 'inline' }: Props) {
    const primary = task.primaryAssignee?.name ?? '—';
    const secondary = task.secondaryAssignees ?? [];

    const secondaryNode =
        secondary.length === 0 ? null : (
            <Tooltip title={`Phụ trách phụ: ${secondary.map((u) => u.name).join(', ')}`}>
                <span style={{ opacity: 0.85 }}>
                    +{secondary.slice(0, 2).map((u) => u.name).join(', ')}
                    {secondary.length > 2 ? ` +${secondary.length - 2}` : ''}
                </span>
            </Tooltip>
        );

    if (layout === 'stacked') {
        return (
            <div>
                <div>{primary}</div>
                {secondaryNode && <div style={{ fontSize: 12 }}>{secondaryNode}</div>}
            </div>
        );
    }
    return (
        <>
            {primary}
            {secondaryNode && <> · {secondaryNode}</>}
        </>
    );
}
