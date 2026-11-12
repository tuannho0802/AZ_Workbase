'use client';

import { Skeleton, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useFanpageHeatmap } from '@/lib/hooks/useFanpages';

const { Text } = Typography;
const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

interface Props {
    fanpageId: number;
    weeks?: number;
    /** Bấm ô có bài -> mở danh sách bài của ngày đó. */
    onPickDate?: (date: string) => void;
}

/** Màu theo số bài: 0 = xám nhạt, càng nhiều càng đậm (alpha trên nền xanh, hợp cả sáng/tối). Số bài luôn có trong tooltip + aria-label. */
const cellBg = (count: number, future: boolean): string => {
    if (future) return 'transparent';
    if (count <= 0) return 'rgba(128,128,128,0.15)';
    if (count === 1) return 'rgba(56,158,13,0.35)';
    if (count === 2) return 'rgba(56,158,13,0.6)';
    return 'rgba(56,158,13,0.9)';
};

export function FanpageHeatmap({ fanpageId, weeks = 12, onPickDate }: Props) {
    const { data, isLoading } = useFanpageHeatmap(fanpageId, weeks);
    if (isLoading || !data) return <Skeleton active paragraph={{ rows: 3 }} title={false} />;

    // cells đã sắp Thứ Hai -> Chủ Nhật theo từng tuần: cột = tuần, hàng = thứ.
    const columns: Array<typeof data.cells> = [];
    for (let i = 0; i < data.cells.length; i += 7) columns.push(data.cells.slice(i, i + 7));
    const total = data.cells.reduce((s, c) => s + c.count, 0);

    return (
        <div>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginRight: 2 }}>
                    {DAY_LABELS.map((d) => (
                        <Text key={d} type="secondary" style={{ fontSize: 10, height: 16, lineHeight: '16px' }}>
                            {d}
                        </Text>
                    ))}
                </div>
                {columns.map((col, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {col.map((c) => {
                            const label = `${dayjs(c.date).format('DD/MM/YYYY')}: ${c.count} bài`;
                            const clickable = !c.future && c.count > 0 && !!onPickDate;
                            return (
                                <Tooltip key={c.date} title={c.future ? undefined : label}>
                                    <button
                                        type="button"
                                        aria-label={label}
                                        disabled={!clickable}
                                        onClick={() => clickable && onPickDate?.(c.date)}
                                        style={{
                                            width: 16,
                                            height: 16,
                                            borderRadius: 3,
                                            border: c.future ? '1px dashed rgba(128,128,128,0.3)' : 'none',
                                            padding: 0,
                                            background: cellBg(c.count, c.future),
                                            cursor: clickable ? 'pointer' : 'default',
                                        }}
                                    />
                                </Tooltip>
                            );
                        })}
                    </div>
                ))}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
                {total} bài trong {data.weeks} tuần · ô càng đậm càng nhiều bài (bấm ô để xem bài)
            </Text>
        </div>
    );
}
