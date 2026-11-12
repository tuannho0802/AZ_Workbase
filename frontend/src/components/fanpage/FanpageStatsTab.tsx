'use client';

import { useMemo, useState } from 'react';
import { Alert, Card, Col, Empty, Row, Segmented, Select, Skeleton, Space, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import type { GrowthResponse, TopPostRow } from '@/lib/api/fanpages.api';
import { useFanpageStatsGrowth, useFanpageStatsPosts, useFanpageStatsTopPosts } from '@/lib/hooks/useFanpages';
import { fmtNum } from '@/lib/utils/fanpageMetrics';

const { Text } = Typography;
const FMT = 'YYYY-MM-DD';
const COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#722ed1', '#13c2c2'];
const MAX_COMPARE = 5;

type RangeKey = '30' | '90' | '365';
const RANGES: Array<{ value: RangeKey; label: string }> = [
    { value: '30', label: '30 ngày' },
    { value: '90', label: '90 ngày' },
    { value: '365', label: '12 tháng' },
];

const fmtTick = (v: number) => v.toLocaleString('vi-VN');
const fmtVal = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('vi-VN') : String(v ?? ''));

/** Nhãn bucket: tuần = 'YYYY-MM-DD' (Thứ Hai) -> DD/MM; tháng = 'YYYY-MM' -> MM/YYYY. */
const bucketLabel = (key: string, groupBy: GrowthResponse['groupBy']) =>
    groupBy === 'month' ? `${key.slice(5, 7)}/${key.slice(0, 4)}` : dayjs(key).format('DD/MM');

interface Props {
    enabled: boolean;
    onOpenDetail: (id: number) => void;
}

/** Tab "Thống kê": tăng trưởng follower (tổng + so sánh tối đa 5 Page), số bài theo tuần, top bài. Mọi số = nhập tay/dữ liệu nội bộ. */
export function FanpageStatsTab({ enabled, onOpenDetail }: Props) {
    const [range, setRange] = useState<RangeKey>('30');
    const [compare, setCompare] = useState<number[]>([]);
    const params = useMemo(() => {
        const to = dayjs().format(FMT);
        return { from: dayjs().subtract(Number(range) - 1, 'day').format(FMT), to };
    }, [range]);

    const growthQ = useFanpageStatsGrowth({ ...params, pageIds: compare }, enabled);
    const postsQ = useFanpageStatsPosts(params, enabled);
    const topQ = useFanpageStatsTopPosts({ ...params, limit: 10 }, enabled);
    const g = growthQ.data;

    const growthData = useMemo(() => {
        if (!g) return [];
        return g.points.map((p, i) => {
            const row: Record<string, string | number | null> = { label: bucketLabel(p.key, g.groupBy), total: p.total };
            g.perPage.forEach((pp) => (row[`p${pp.id}`] = pp.values[i] ?? null));
            return row;
        });
    }, [g]);

    const postsData = (postsQ.data?.weeks ?? []).map((w) => ({ label: dayjs(w.weekStart).format('DD/MM'), count: w.count }));

    const topCols: ColumnsType<TopPostRow> = [
        {
            title: 'Bài đăng',
            key: 'post',
            render: (_: unknown, p) => (
                <Space orientation="vertical" size={0}>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                        {p.title || 'Mở bài đăng'}
                    </a>
                    <a onClick={() => onOpenDetail(p.fanpageId)} style={{ fontSize: 12 }}>
                        {p.fanpageName}
                    </a>
                </Space>
            ),
        },
        { title: 'Ngày đăng', dataIndex: 'postedDate', width: 105, render: (d: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '—') },
        { title: 'Thích', dataIndex: 'likes', align: 'right', width: 80, render: fmtNum },
        { title: 'Bình luận', dataIndex: 'comments', align: 'right', width: 90, render: fmtNum },
        { title: 'Chia sẻ', dataIndex: 'shares', align: 'right', width: 80, render: fmtNum },
        { title: 'Tương tác', dataIndex: 'interactions', align: 'right', width: 100, render: (n: number) => <Text strong>{fmtNum(n)}</Text> },
    ];

    const gainText = g ? (g.gain.pagesWithGain > 0 ? `${g.gain.total > 0 ? '+' : g.gain.total < 0 ? '−' : ''}${Math.abs(g.gain.total).toLocaleString('vi-VN')}` : '—') : '—';

    if (!enabled) return null;
    return (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                <Segmented value={range} onChange={(v) => setRange(v as RangeKey)} options={RANGES} />
                <Text type="secondary">Số liệu follower do nhân viên nhập tay · tuần tính Thứ Hai–Chủ Nhật</Text>
            </Space>

            <Card size="small" title="Tăng trưởng follower">
                {growthQ.isLoading || !g ? (
                    <Skeleton active />
                ) : (
                    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                        <Row gutter={[12, 12]}>
                            <Col xs={12} md={6}>
                                <Statistic title={`Tăng trong kỳ`} value={gainText} styles={{ content: { color: g.gain.total > 0 ? '#389e0d' : g.gain.total < 0 ? '#cf1322' : undefined } }} />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {g.gain.pagesWithGain}/{g.totalPages} Page đủ số liệu để so
                                </Text>
                            </Col>
                        </Row>
                        {g.pagesWithoutMetrics > 0 && (
                            <Alert type="info" showIcon title={`${g.pagesWithoutMetrics} Page chưa có số liệu follower — không tính vào tổng (không coi là 0).`} />
                        )}
                        <Select
                            mode="multiple"
                            allowClear
                            showSearch={{ optionFilterProp: 'label' }}
                            style={{ width: '100%' }}
                            placeholder={`So sánh từng Page (tối đa ${MAX_COMPARE})`}
                            value={compare}
                            onChange={(v) => setCompare(v.slice(0, MAX_COMPARE))}
                            options={g.pages.map((p) => ({ value: p.id, label: p.name, disabled: compare.length >= MAX_COMPARE && !compare.includes(p.id) }))}
                        />
                        {growthData.length === 0 || g.points.every((p) => p.pagesWithData === 0) ? (
                            <Empty description="Chưa có số liệu follower trong kỳ này" />
                        ) : (
                            <div style={{ width: '100%', height: 260 }}>
                                <ResponsiveContainer>
                                    <LineChart data={growthData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                                        <XAxis dataKey="label" />
                                        <YAxis width={70} domain={['auto', 'auto']} tickFormatter={fmtTick} />
                                        <ChartTooltip formatter={fmtVal} />
                                        <Legend />
                                        <Line type="monotone" dataKey="total" name="Tổng" stroke={COLORS[0]} strokeWidth={2} dot={growthData.length < 20} connectNulls />
                                        {g.perPage.map((pp, i) => (
                                            <Line key={pp.id} type="monotone" dataKey={`p${pp.id}`} name={pp.name} stroke={COLORS[(i + 1) % COLORS.length]} strokeDasharray="4 3" dot={false} connectNulls />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                        {g.pageRows.length > 0 && (
                            <Table
                                size="small"
                                rowKey="id"
                                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                                dataSource={g.pageRows}
                                scroll={{ x: 'max-content' }}
                                columns={[
                                    { title: 'Page', dataIndex: 'name', render: (n: string, r: GrowthResponse['pageRows'][number]) => <a onClick={() => onOpenDetail(r.id)}>{n}</a> },
                                    { title: 'Followers', dataIndex: 'followers', align: 'right' as const, render: fmtNum },
                                    {
                                        title: 'Tăng/giảm',
                                        dataIndex: 'gain',
                                        align: 'right' as const,
                                        render: (n: number, r: GrowthResponse['pageRows'][number]) => (
                                            <span title={`So với số liệu ngày ${dayjs(r.baselineDate).format('DD/MM/YYYY')}`}>
                                                <Text type={n > 0 ? 'success' : n < 0 ? 'danger' : undefined}>{`${n > 0 ? '+' : ''}${fmtNum(n)}`}</Text>
                                            </span>
                                        ),
                                    },
                                    { title: 'Mốc so sánh', dataIndex: 'baselineDate', width: 120, render: (d: string) => dayjs(d).format('DD/MM/YYYY') },
                                ]}
                            />
                        )}
                    </Space>
                )}
            </Card>

            <Card size="small" title="Số bài theo tuần">
                {postsQ.isLoading || !postsQ.data ? (
                    <Skeleton active />
                ) : postsData.length === 0 ? (
                    <Empty description="Chưa có bài trong kỳ" />
                ) : (
                    <>
                        <div style={{ width: '100%', height: 220 }}>
                            <ResponsiveContainer>
                                <BarChart data={postsData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                                    <XAxis dataKey="label" />
                                    <YAxis allowDecimals={false} width={40} />
                                    <ChartTooltip formatter={fmtVal} labelFormatter={(l) => `Tuần từ ${String(l)}`} />
                                    <Bar dataKey="count" name="Số bài" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
                                    {postsQ.data.weeklyTarget > 0 && <ReferenceLine y={postsQ.data.weeklyTarget} stroke="#fa8c16" strokeDasharray="4 3" label={{ value: `Mục tiêu ${postsQ.data.weeklyTarget}/tuần`, position: 'insideTopRight', fontSize: 12 }} />}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Tổng {postsQ.data.totalPosts} bài trong kỳ{postsQ.data.weeklyTarget > 0 ? ' · đường cam = tổng mục tiêu bài/tuần của các Page đang theo dõi' : ''}
                        </Text>
                    </>
                )}
            </Card>

            <Card size="small" title="Top bài (thích + bình luận + chia sẻ)">
                {topQ.isLoading || !topQ.data ? (
                    <Skeleton active />
                ) : (
                    <Space orientation="vertical" style={{ width: '100%' }}>
                        {topQ.data.postsWithoutMetrics > 0 && (
                            <Text type="secondary">{topQ.data.postsWithoutMetrics} bài trong kỳ chưa nhập số liệu nên không xuất hiện ở đây.</Text>
                        )}
                        <Table<TopPostRow>
                            size="small"
                            rowKey="id"
                            columns={topCols}
                            dataSource={topQ.data.posts}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            locale={{ emptyText: <Empty description="Chưa có bài nào được nhập số liệu" /> }}
                        />
                    </Space>
                )}
            </Card>
        </Space>
    );
}
