'use client';

import { useState } from 'react';
import { Alert, Card, Empty, Modal, Skeleton, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { OutcomeCustomerRow, OutcomeCustomersParams, OutcomeUtmRow, PageOutcomeRow, StatsRange } from '@/lib/api/fanpages.api';
import { useFanpageOutcomeCustomers, useFanpageStatsOutcomes } from '@/lib/hooks/useFanpages';
import { fmtNum } from '@/lib/utils/fanpageMetrics';

const { Text } = Typography;

const fmtMoney = (v: number | undefined) => (v == null ? '' : `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const fmtRate = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('vi-VN')}%`);

interface Props {
    params: StatsRange;
    enabled: boolean;
    onOpenDetail: (id: number) => void;
}

type Pick = { kind: 'primary' | 'participating'; fanpageId: number; pageName: string };

/**
 * Khối "Page → Khách & Tiền nạp" (PLAN 3.7). Số do BE tính theo quyền của người xem:
 *  - "Ghi công" = UTM mà Page là Page chính; "Tham gia" = UTM dùng chung (KHÔNG cộng vào Tổng).
 *  - Cột Tiền nạp chỉ có khi BE trả `deposit` (qua cổng 4 lớp) - FE không tự suy ra, không có thì ẩn cột.
 */
export function FanpageOutcomesCard({ params, enabled, onOpenDetail }: Props) {
    const q = useFanpageStatsOutcomes(params, enabled);
    const d = q.data;
    const [pick, setPick] = useState<Pick | null>(null);
    const [page, setPage] = useState(1);

    const customersParams: OutcomeCustomersParams | null = pick ? { ...params, kind: pick.kind, fanpageId: pick.fanpageId, page, limit: 10 } : null;
    const custQ = useFanpageOutcomeCustomers(customersParams);

    const open = (p: Pick) => {
        setPage(1);
        setPick(p);
    };

    const countLink = (n: number, kind: Pick['kind'], r: PageOutcomeRow) =>
        n > 0 ? <a onClick={() => open({ kind, fanpageId: r.fanpageId, pageName: r.name })}>{fmtNum(n)}</a> : <Text type="secondary">0</Text>;

    const columns: ColumnsType<PageOutcomeRow> = [
        {
            title: 'Page',
            dataIndex: 'name',
            fixed: 'left',
            render: (n: string, r) => (
                <Space size={4}>
                    <a onClick={() => onOpenDetail(r.fanpageId)}>{n}</a>
                    {r.archived && <Tag>Đã lưu trữ</Tag>}
                </Space>
            ),
        },
        { title: 'UTM chính', align: 'right', width: 90, render: (_: unknown, r) => fmtNum(r.primary.utmCount) },
        { title: 'Khách (ghi công)', align: 'right', width: 130, render: (_: unknown, r) => countLink(r.primary.customers, 'primary', r) },
        { title: 'Đã chốt', align: 'right', width: 90, render: (_: unknown, r) => fmtNum(r.primary.closed) },
        { title: '% chốt', align: 'right', width: 80, render: (_: unknown, r) => fmtRate(r.primary.closeRate) },
        ...(d?.hasRevenue
            ? [
                  {
                      title: 'Tiền nạp',
                      align: 'right' as const,
                      width: 120,
                      render: (_: unknown, r: PageOutcomeRow) => (r.primary.deposit === undefined ? '' : <Text strong>{fmtMoney(r.primary.deposit)}</Text>),
                  },
              ]
            : []),
        { title: 'Khách/bài', align: 'right', width: 90, render: (_: unknown, r) => (r.customersPerPost == null ? '—' : r.customersPerPost.toLocaleString('vi-VN')) },
        {
            title: (
                <Tooltip title="UTM dùng chung với Page khác — không cộng vào Tổng">
                    <span>Khách (tham gia)</span>
                </Tooltip>
            ),
            align: 'right',
            width: 130,
            render: (_: unknown, r) => countLink(r.participating.customers, 'participating', r),
        },
    ];

    const utmCols: ColumnsType<OutcomeUtmRow> = [
        {
            title: 'UTM',
            dataIndex: 'name',
            render: (n: string, u) => (
                <Space size={4}>
                    {u.locked ? <LockOutlined /> : null}
                    <Text>{n}</Text>
                    <Tag color={u.isPrimary ? 'gold' : undefined}>{u.isPrimary ? 'Page chính' : 'Tham gia'}</Tag>
                </Space>
            ),
        },
        { title: 'Khách', dataIndex: 'customers', align: 'right', width: 90, render: fmtNum },
        ...(d?.hasRevenue
            ? [{ title: 'Tiền nạp', dataIndex: 'deposit', align: 'right' as const, width: 120, render: (v: number | undefined) => fmtMoney(v) }]
            : []),
    ];

    const custCols: ColumnsType<OutcomeCustomerRow> = [
        { title: 'Khách hàng', dataIndex: 'name' },
        { title: 'SĐT', dataIndex: 'phone', width: 120, render: (v?: string) => v ?? '—' },
        { title: 'Ngày nhập', dataIndex: 'inputDate', width: 105, render: (v: string | null) => (v ? dayjs(v).format('DD/MM/YYYY') : '—') },
        { title: 'Trạng thái', dataIndex: 'status', width: 110, render: (v: string) => <Tag>{v}</Tag> },
        { title: 'UTM', key: 'utm', render: (_: unknown, r) => (r.utm ? <Tag color={r.utm.color ?? undefined}>{r.utm.name}</Tag> : '—') },
        { title: 'Sales', key: 'sales', render: (_: unknown, r) => r.salesUser?.name ?? '—' },
    ];

    return (
        <Card size="small" title="Page → Khách & Tiền nạp">
            {!enabled ? null : q.isLoading || !d ? (
                <Skeleton active />
            ) : (
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                    {d.customerScope == null && (
                        <Alert type="warning" showIcon title="Bạn không có quyền xem khách hàng nên các số khách/tiền hiển thị 0." />
                    )}
                    <Space size="large" wrap>
                        <Statistic title="Tổng khách (ghi công)" value={d.total.customers} />
                        <Statistic title="Đã chốt" value={d.total.closed} suffix={d.total.closeRate != null ? `(${fmtRate(d.total.closeRate)})` : undefined} />
                        {d.total.deposit !== undefined && <Statistic title="Tổng tiền nạp" value={fmtMoney(d.total.deposit)} />}
                        {d.unassigned && (
                            <Tooltip title="Khách không có UTM, hoặc UTM chưa có Page chính">
                                <Statistic title="Chưa quy về Page" value={d.unassigned.customers} />
                            </Tooltip>
                        )}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Khách tính theo Ngày nhập trong kỳ và phạm vi khách hàng bạn được xem · tiền nạp tính theo Ngày nạp. Tổng = tổng cột “ghi công” (mỗi khách chỉ ghi công cho 1 Page).
                    </Text>
                    <Table<PageOutcomeRow>
                        size="small"
                        rowKey="fanpageId"
                        columns={columns}
                        dataSource={d.pages}
                        pagination={{ pageSize: 10, hideOnSinglePage: true }}
                        scroll={{ x: 'max-content' }}
                        locale={{ emptyText: <Empty description="Chưa có Page trong phạm vi" /> }}
                        expandable={{
                            rowExpandable: (r) => r.utms.length > 0,
                            expandedRowRender: (r) => <Table<OutcomeUtmRow> size="small" rowKey="utmId" columns={utmCols} dataSource={r.utms} pagination={false} />,
                        }}
                    />
                </Space>
            )}

            <Modal
                open={pick != null}
                onCancel={() => setPick(null)}
                footer={null}
                width={820}
                destroyOnHidden
                title={pick ? `Khách của ${pick.pageName} (${pick.kind === 'primary' ? 'ghi công' : 'tham gia'})` : ''}
            >
                <Table<OutcomeCustomerRow>
                    size="small"
                    rowKey="id"
                    columns={custCols}
                    dataSource={custQ.data?.data ?? []}
                    loading={custQ.isLoading || custQ.isFetching}
                    scroll={{ x: 'max-content' }}
                    pagination={{ current: page, pageSize: 10, total: custQ.data?.total ?? 0, showSizeChanger: false, onChange: setPage }}
                />
            </Modal>
        </Card>
    );
}
