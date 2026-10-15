'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Drawer, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
    securityApi,
    type IpAccessItem,
    type IpAccessLogRow,
    type IpAccessOutcome,
    type IpCurrentStatus,
} from '@/lib/api/security.api';
import { formatAgo } from '@/lib/utils/format-ago';
import { IpWithFlag } from './IpWithFlag';
import { formatApproxHits } from './ipAccessApiFormat';
import { PerformanceRangeFilter, getDefaultPerformanceRange } from '@/components/periodic-tasks/PerformanceRangeFilter';
import dayjs, { type Dayjs } from 'dayjs';

const DATE_FMT = 'YYYY-MM-DD';

const { Text } = Typography;

export const OUTCOME_META: Record<IpAccessOutcome, { label: string; color: string }> = {
    success: { label: 'Đăng nhập thành công', color: 'green' },
    wrong_password: { label: 'Sai mật khẩu', color: 'orange' },
    unknown_email: { label: 'Email không tồn tại', color: 'volcano' },
    account_locked: { label: 'Tài khoản đang khoá', color: 'red' },
    ip_locked: { label: 'IP đang khoá', color: 'red' },
    denied: { label: 'Bị từ chối (khoá/chờ duyệt)', color: 'magenta' },
    refresh_ok: { label: 'Làm mới phiên', color: 'blue' },
    refresh_failed: { label: 'Làm mới phiên thất bại', color: 'default' },
    api: { label: 'Gọi API (đã đăng nhập)', color: 'geekblue' },
};

const STATUS_META: Record<IpCurrentStatus, { label: string; color: string }> = {
    normal: { label: 'Bình thường', color: 'default' },
    whitelisted: { label: 'Whitelist', color: 'cyan' },
    blocked: { label: 'Đang khoá', color: 'volcano' },
    banned: { label: 'Bị chặn chủ động', color: 'red' },
};

export const OutcomeTag = ({ outcome }: { outcome: IpAccessOutcome | null }) => {
    if (!outcome) return <>-</>;
    const m = OUTCOME_META[outcome] ?? { label: outcome, color: 'default' };
    return <Tag color={m.color}>{m.label}</Tag>;
};

function IpDetailDrawer({ ip, fromDate, toDate, onClose }: { ip: string | null; fromDate: string; toDate: string; onClose: () => void }) {
    const [page, setPage] = useState(1);
    const [outcome, setOutcome] = useState<IpAccessOutcome | undefined>();
    // Chi tiết CHỈ tải khi mở Drawer, và chỉ trong khoảng đang lọc ở danh sách (không tải dòng log xa hơn).
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['security-ip-access-detail', ip, page, outcome, fromDate, toDate],
        queryFn: () => securityApi.getIpAccessDetail(ip as string, { page, limit: 20, outcome, fromDate, toDate }),
        enabled: !!ip,
    });

    const columns: ColumnsType<IpAccessLogRow> = [
        { title: 'Khi nào', dataIndex: 'agoSeconds', width: 120, render: (s: number) => formatAgo(s) },
        { title: 'Kết quả', dataIndex: 'outcome', width: 200, render: (o: IpAccessOutcome) => <OutcomeTag outcome={o} /> },
        {
            title: 'Endpoint', dataIndex: 'endpoint', ellipsis: true,
            render: (v: string, r) => (r.outcome === 'api' ? <Text code>{v}</Text> : v),
        },
        {
            title: 'Số request', dataIndex: 'hitCount', width: 110,
            render: (n: number, r) => (r.outcome === 'api' ? formatApproxHits(n) : '-'),
        },
        {
            title: 'Tài khoản / Email', key: 'who',
            render: (_: unknown, r) => r.userName ? <span>{r.userName}{r.email ? <Text type="secondary"> ({r.email})</Text> : null}</span> : (r.email ? <Text code>{r.email}</Text> : '-'),
        },
        { title: 'Thiết bị', dataIndex: 'userAgent', ellipsis: true, render: (v: string | null) => v || '-' },
    ];

    return (
        <Drawer
            title={ip ? <IpWithFlag ip={ip} countryCode={data?.countryCode} ipKind={data?.ipKind} geoSource={data?.geoSource} onChanged={() => void refetch()} /> : ''}
            open={!!ip}
            onClose={() => { setPage(1); setOutcome(undefined); onClose(); }}
            size="large"
            destroyOnHidden
        >
            {data && (
                <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }} title={<Text type="secondary" style={{ fontSize: 13 }}>Tổng quan toàn thời gian (bảng dưới chỉ gồm {dayjs(fromDate).format('DD/MM')} - {dayjs(toDate).format('DD/MM/YYYY')})</Text>}>
                    <Descriptions.Item label="Tổng lượt">{data.summary.totalHits}</Descriptions.Item>
                    <Descriptions.Item label="Trạng thái"><Tag color={STATUS_META[data.summary.currentStatus].color}>{STATUS_META[data.summary.currentStatus].label}</Tag></Descriptions.Item>
                    <Descriptions.Item label="Thành công">{data.summary.successHits}</Descriptions.Item>
                    <Descriptions.Item label="Thất bại">{data.summary.failedHits}</Descriptions.Item>
                    <Descriptions.Item label="Bị chặn (IP khoá)">{data.summary.blockedHits}</Descriptions.Item>
                    <Descriptions.Item label="Lượt không lưu chi tiết">{data.summary.suppressedHits}</Descriptions.Item>
                    <Descriptions.Item label="Request API (xấp xỉ)">{formatApproxHits(data.summary.apiHits)}</Descriptions.Item>
                    <Descriptions.Item label="Thấy lần đầu">{formatAgo(data.summary.firstSeenAgoSeconds)}</Descriptions.Item>
                    <Descriptions.Item label="Gần nhất">{formatAgo(data.summary.lastSeenAgoSeconds)}</Descriptions.Item>
                </Descriptions>
            )}
            <Space style={{ marginBottom: 12 }}>
                <Select
                    allowClear placeholder="Lọc kết quả" style={{ width: 240 }} value={outcome}
                    options={(Object.keys(OUTCOME_META) as IpAccessOutcome[]).map((k) => ({ value: k, label: OUTCOME_META[k].label }))}
                    onChange={(v) => { setOutcome(v); setPage(1); }}
                />
                <Button icon={<ReloadOutlined />} onClick={() => void refetch()} />
            </Space>
            <Table<IpAccessLogRow>
                rowKey="id" size="small" columns={columns} dataSource={data?.logs ?? []} loading={isLoading}
                scroll={{ x: 'max-content' }}
                pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, showSizeChanger: false, onChange: setPage, showTotal: (t) => `${t} dòng chi tiết` }}
            />
        </Drawer>
    );
}

/**
 * Tab "Theo dõi IP" (P3.6) trong Nhật ký hệ thống: mỗi IP đã đăng nhập/làm mới phiên + số lần (đọc từ bảng tổng hợp
 * `ip_access_stats`, không đếm trên bảng log). Chỉ render khi có `users.manage` phạm vi `all` (BE trả 403 nếu thiếu).
 */
export function IpTrackingTab() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [status, setStatus] = useState<'all' | 'blocked' | 'whitelisted' | 'banned'>('all');
    const [search, setSearch] = useState('');
    const [detailIp, setDetailIp] = useState<string | null>(null);
    // Mặc định TUẦN NÀY (khớp mặc định BE) - chỉ tải đúng khoảng đang chọn, tối đa 93 ngày (BE trả 400 nếu vượt).
    const [range, setRange] = useState<[Dayjs, Dayjs]>(() => getDefaultPerformanceRange());
    const fromDate = range[0].format(DATE_FMT);
    const toDate = range[1].format(DATE_FMT);

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['security-ip-access', page, pageSize, status, search, fromDate, toDate],
        queryFn: () => securityApi.getIpAccess({ page, limit: pageSize, status, search: search || undefined, fromDate, toDate }),
        staleTime: 15_000,
        placeholderData: keepPreviousData, // đổi khoảng/trang: giữ bảng cũ tới khi có dữ liệu mới, không nháy trắng
    });

    const columns: ColumnsType<IpAccessItem> = [
        {
            title: 'IP', key: 'ip',
            render: (_: unknown, r) => <IpWithFlag ip={r.ip} countryCode={r.countryCode ?? r.lastCountryCode} ipKind={r.ipKind} geoSource={r.geoSource} onChanged={() => void refetch()} />,
        },
        { title: 'Tổng lượt', dataIndex: 'totalHits', sorter: (a, b) => a.totalHits - b.totalHits, width: 100 },
        { title: 'Thành công', dataIndex: 'successHits', width: 110, render: (n: number) => <Text type="success">{n}</Text> },
        { title: 'Thất bại', dataIndex: 'failedHits', width: 100, render: (n: number) => (n > 0 ? <Text type="danger">{n}</Text> : n) },
        { title: 'Bị chặn', dataIndex: 'blockedHits', width: 90 },
        { title: 'Request API (≈)', dataIndex: 'apiHits', width: 130, render: (n: number) => formatApproxHits(n) },
        { title: 'Kết quả gần nhất', dataIndex: 'lastOutcome', render: (o: IpAccessOutcome | null) => <OutcomeTag outcome={o} /> },
        { title: 'Trạng thái', dataIndex: 'currentStatus', width: 120, render: (s: IpCurrentStatus) => <Tag color={STATUS_META[s].color}>{STATUS_META[s].label}</Tag> },
        { title: 'Lần đầu', dataIndex: 'firstSeenAgoSeconds', width: 120, render: (s: number) => formatAgo(s) },
        { title: 'Gần nhất', dataIndex: 'lastSeenAgoSeconds', width: 120, render: (s: number) => formatAgo(s) },
        { title: '', key: 'a', width: 90, render: (_: unknown, r) => <Button size="small" onClick={() => setDetailIp(r.ip)}>Chi tiết</Button> },
    ];

    return (
        <Space orientation={'vertical' as never} size="middle" style={{ width: '100%' }}>
            <Alert
                type="info" showIcon
                title="Chỉ hiển thị các IP có hoạt động trong khoảng thời gian đã chọn (mặc định Tuần này); số liệu tính trong khoảng đó, chỉ gồm các dòng chi tiết đã ghi nên có thể thấp hơn tổng toàn thời gian. Đăng nhập/làm mới phiên được đếm chính xác. Request API đã đăng nhập được gom theo thùng 1 phút nên số liệu chỉ là XẤP XỈ (có thể thấp hơn thật). Quốc gia lấy từ Vercel; IP nội bộ hoặc chưa đi qua Vercel sẽ là Nội bộ/N/A (Admin có thể gán tay)."
            />
            <Card variant="outlined" styles={{ body: { padding: 12 } }}>
                <PerformanceRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} size="middle" />
                <Space wrap>
                    <Input.Search allowClear placeholder="Tìm IP" style={{ width: 200 }} onSearch={(v) => { setSearch(v); setPage(1); }} />
                    <Select
                        value={status} style={{ width: 170 }}
                        onChange={(v) => { setStatus(v); setPage(1); }}
                        options={[{ value: 'all', label: 'Tất cả IP' }, { value: 'blocked', label: 'Đang bị khoá' }, { value: 'banned', label: 'Bị chặn chủ động' }, { value: 'whitelisted', label: 'Trong whitelist' }]}
                    />
                    <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => void refetch()}>Làm mới</Button>
                </Space>
            </Card>
            <Table<IpAccessItem>
                rowKey="ip" columns={columns} dataSource={data?.items ?? []} loading={isLoading}
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: 'Không có IP nào hoạt động trong khoảng thời gian này' }}
                pagination={{
                    current: page, pageSize, total: data?.total ?? 0, showSizeChanger: true,
                    showTotal: (t) => `${t} IP trong ${dayjs(fromDate).format('DD/MM')} - ${dayjs(toDate).format('DD/MM/YYYY')}`,
                    onChange: (p, s) => { setPage(p); setPageSize(s); },
                }}
            />
            <IpDetailDrawer ip={detailIp} fromDate={fromDate} toDate={toDate} onClose={() => setDetailIp(null)} />
        </Space>
    );
}
