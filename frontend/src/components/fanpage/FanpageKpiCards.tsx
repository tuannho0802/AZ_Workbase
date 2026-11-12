'use client';

import { Card, Col, Row, Statistic } from 'antd';
import type { FanpageOverview } from '@/lib/api/fanpages.api';

export type KpiFilter = 'all' | 'silent' | 'at_risk' | 'orphan';

interface Props {
    overview: FanpageOverview | undefined;
    loading?: boolean;
    active: KpiFilter;
    onPick: (f: KpiFilter) => void;
}

/** Thẻ KPI bấm-để-lọc (A1). Số đến từ `GET /fanpages/overview` - cùng scope/nguồn với bảng (X3). Chỉ Page đang theo dõi tính vào nhịp. */
export function FanpageKpiCards({ overview, loading, active, onPick }: Props) {
    const o = overview;
    const gain = o?.followerGain30d;
    const cards: Array<{ key: string; title: string; value?: number | string; filter?: KpiFilter; color?: string; hint?: string }> = [
        { key: 'total', title: 'Tổng Page', value: o?.totalPages, filter: 'all', hint: `${o?.trackedPages ?? 0} đang theo dõi` },
        { key: 'silent', title: 'Im lặng', value: o?.silentPages, filter: 'silent', color: '#cf1322', hint: 'Lâu chưa có bài mới' },
        { key: 'at_risk', title: 'Nguy cơ trễ tuần', value: o?.atRiskPages, filter: 'at_risk', color: '#d46b08', hint: 'Phải đăng mỗi ngày còn lại mới kịp' },
        { key: 'today', title: 'Đã đăng hôm nay', value: o?.postedTodayPages, color: '#389e0d' },
        { key: 'week', title: 'Bài tuần này', value: o?.postsThisWeek, hint: `${o?.posts30d ?? 0} bài / 30 ngày` },
        {
            key: 'followers',
            title: 'Follower 30 ngày',
            value: gain == null ? '—' : `${gain > 0 ? '+' : gain < 0 ? '−' : ''}${Math.abs(gain).toLocaleString('vi-VN')}`,
            color: gain == null ? undefined : gain > 0 ? '#389e0d' : gain < 0 ? '#cf1322' : undefined,
            hint: (o?.pagesWithoutMetrics ?? 0) > 0 ? `${o?.pagesWithoutMetrics} Page chưa có số liệu` : 'Từ số liệu nhập tay',
        },
        { key: 'orphan', title: 'Chưa có người phụ trách', value: o?.orphanPages, filter: 'orphan', hint: 'Người phụ trách đã nghỉ/bị khoá' },
    ];
    return (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {cards.map((c) => {
                const clickable = c.filter != null;
                const selected = clickable && active === c.filter;
                return (
                    <Col key={c.key} style={{ flex: '1 1 170px', minWidth: 150 }}>
                        <Card
                            size="small"
                            hoverable={clickable}
                            loading={loading}
                            onClick={clickable ? () => onPick(selected && c.filter !== 'all' ? 'all' : (c.filter as KpiFilter)) : undefined}
                            style={{ cursor: clickable ? 'pointer' : 'default', borderColor: selected ? '#1677ff' : undefined }}
                            role={clickable ? 'button' : undefined}
                            aria-pressed={clickable ? selected : undefined}
                        >
                            <Statistic title={c.title} value={c.value ?? 0} styles={{ content: { color: c.color, fontSize: 24 } }} />
                            {c.hint && <div style={{ fontSize: 12, opacity: 0.65 }}>{c.hint}</div>}
                        </Card>
                    </Col>
                );
            })}
        </Row>
    );
}