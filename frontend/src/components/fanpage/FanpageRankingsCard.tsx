'use client';

import { Alert, Card, Empty, Skeleton, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { TrophyOutlined } from '@ant-design/icons';
import type { RankingRow, StatsRange } from '@/lib/api/fanpages.api';
import { useFanpageStatsRankings } from '@/lib/hooks/useFanpages';
import { fmtNum } from '@/lib/utils/fanpageMetrics';

const { Text } = Typography;

const SCOPE_TEXT = { own: 'chỉ dòng của bạn', department: 'người thuộc phòng ban bạn quản lý', all: 'tất cả người phụ trách' } as const;

interface Props {
    params: StatsRange;
    enabled: boolean;
}

/**
 * Xếp hạng đóng góp (B5, PLAN 3.8): chỉ người PHỤ TRÁCH Page có đóng góp dữ liệu (bài do chính họ ghi, số liệu do chính họ nhập).
 * Hạng tính trong tập người xem được thấy. Không có khách/tiền, không có điểm tổng hợp ẩn. Chỉ hiện khi `can('fanpage_rankings.view')`.
 */
export function FanpageRankingsCard({ params, enabled }: Props) {
    const q = useFanpageStatsRankings(params, enabled);
    const data = q.data;

    const columns: ColumnsType<RankingRow> = [
        { title: 'Hạng', dataIndex: 'rank', width: 70, render: (r: number) => (r === 1 ? <TrophyOutlined style={{ color: '#faad14' }} /> : r) },
        {
            title: 'Nhân viên',
            key: 'name',
            render: (_: unknown, r) => (
                <span>
                    {r.name}
                    {r.employeeCode ? <Text type="secondary"> · {r.employeeCode}</Text> : null}
                    {r.isMe ? <Tag color="blue" style={{ marginLeft: 6 }}>Bạn</Tag> : null}
                </span>
            ),
        },
        { title: 'Số bài đã ghi', dataIndex: 'posts', align: 'right', width: 120, render: (n: number) => <Text strong>{fmtNum(n)}</Text> },
        { title: 'Lần nhập số liệu', dataIndex: 'snapshots', align: 'right', width: 130, render: fmtNum },
        { title: 'Số Page', dataIndex: 'pages', align: 'right', width: 90, render: fmtNum },
        {
            title: '% tuần đạt nhịp',
            dataIndex: 'targetRate',
            align: 'right',
            width: 140,
            render: (v: number | null, r) =>
                v == null ? (
                    '—'
                ) : (
                    <Tooltip title={`${r.weeksOnTarget}/${r.weeksTracked} tuần đã kết thúc đạt mục tiêu bài/tuần`}>
                        <span>{v}%</span>
                    </Tooltip>
                ),
        },
    ];

    return (
        <Card size="small" title="Xếp hạng đóng góp" extra={data ? <Text type="secondary">Phạm vi: {SCOPE_TEXT[data.scope]}</Text> : null}>
            {q.isLoading || !data ? (
                <Skeleton active />
            ) : (
                <>
                    <Table<RankingRow>
                        size="small"
                        rowKey="userId"
                        columns={columns}
                        dataSource={data.rows}
                        pagination={{ pageSize: 10, hideOnSinglePage: true }}
                        rowClassName={(r) => (r.isMe ? 'ant-table-row-selected' : '')}
                        scroll={{ x: 'max-content' }}
                        locale={{ emptyText: <Empty description="Chưa có ai đóng góp dữ liệu trong kỳ" /> }}
                    />
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginTop: 8 }}
                        title="Chỉ xếp hạng người phụ trách Page có bài/số liệu do chính họ ghi trong kỳ. Bài trùng link chỉ tính 1 lần; sửa lại số liệu không tính thêm."
                    />
                    {data.nonOwnerPosts > 0 && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {data.nonOwnerPosts} bài do người không phụ trách Page nhập hộ — không tính vào xếp hạng.
                        </Text>
                    )}
                </>
            )}
        </Card>
    );
}
