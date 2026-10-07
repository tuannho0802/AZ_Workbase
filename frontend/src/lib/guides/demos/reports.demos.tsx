'use client';

import { Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

type ReportViewer = 'admin' | 'manager' | 'own';

interface DemoRevRow {
    key: string;
    name: string;
    dept: string;
    amount: number;
    depositors: number;
    deposits: number;
    ftd: number;
    ftdAmount: number;
    redeposit: number;
    redepositAmount: number;
}

/** Dữ liệu mẫu (tên/số liệu là giả định). FTD + nạp lại = tổng tiền của từng dòng. */
const DEMO_REV: DemoRevRow[] = [
    { key: 'a', name: 'Nguyễn An', dept: 'Kinh doanh 1', amount: 12500, depositors: 5, deposits: 9, ftd: 3, ftdAmount: 4500, redeposit: 6, redepositAmount: 8000 },
    { key: 'b', name: 'Trần Bình', dept: 'Kinh doanh 1', amount: 8200, depositors: 4, deposits: 6, ftd: 2, ftdAmount: 3000, redeposit: 4, redepositAmount: 5200 },
    { key: 'c', name: 'Lê Cường', dept: 'Kinh doanh 2', amount: 6000, depositors: 3, deposits: 4, ftd: 1, ftdAmount: 2000, redeposit: 3, redepositAmount: 4000 },
];

const usd = (v: number) => `$${v.toLocaleString('en-US')}`;

/**
 * Tab "Doanh thu" rút gọn. Phạm vi theo quyền `reports.view`:
 * admin (Toàn bộ) = mọi Sales; manager (Phòng ban) = Sales trong phòng ban; own (Của tôi) = chỉ mình.
 * Nhãn thẻ đúng chữ thật: "…toàn hệ thống" chỉ khi có mục Tổng (Toàn bộ), còn lại ghi "của bạn".
 */
function RevenueByViewerDemo({ viewer }: { viewer: ReportViewer }) {
    const rows = viewer === 'admin' ? DEMO_REV : viewer === 'manager' ? DEMO_REV.filter((r) => r.dept === 'Kinh doanh 1') : DEMO_REV.slice(0, 1);
    const sum = (f: (r: DemoRevRow) => number) => rows.reduce((s, r) => s + f(r), 0);
    const scopeLabel = viewer === 'admin' ? 'toàn hệ thống' : 'của bạn';
    return (
        <div>
            <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={12} xl={8}>
                    <Card size="small"><Statistic title={`Tổng doanh thu ${scopeLabel}`} value={usd(sum((r) => r.amount))} /><Text type="secondary" style={{ fontSize: 12 }}>{sum((r) => r.deposits)} khoản nạp</Text></Card>
                </Col>
                <Col xs={24} sm={12} xl={8}>
                    <Card size="small"><Statistic title="Khách đã nạp trong kỳ" value={sum((r) => r.depositors)} /></Card>
                </Col>
                <Col xs={24} sm={12} xl={8}>
                    <Card size="small"><Statistic title="Nạp lần đầu (FTD)" value={sum((r) => r.ftd)} /><Text type="secondary" style={{ fontSize: 12 }}>{usd(sum((r) => r.ftdAmount))} từ khách mới nạp</Text></Card>
                </Col>
            </Row>
            <Table<DemoRevRow>
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={rows}
                scroll={{ x: 'max-content' }}
                columns={[
                    { title: 'Nhân viên', key: 'name', render: (_v, r) => <span><Text strong>{r.name}</Text> <Tag>{r.dept}</Tag></span> },
                    { title: 'Doanh thu', dataIndex: 'amount', key: 'amount', align: 'right', render: (v: number) => usd(v) },
                    { title: 'Khách nạp', dataIndex: 'depositors', key: 'depositors', align: 'right' },
                    { title: 'Số khoản nạp', dataIndex: 'deposits', key: 'deposits', align: 'right' },
                    { title: 'Nạp lần đầu', key: 'ftd', align: 'right', render: (_v, r) => <span>{r.ftd} <Text type="secondary" style={{ fontSize: 12 }}>· {usd(r.ftdAmount)}</Text></span> },
                    { title: 'Nạp lại', key: 're', align: 'right', render: (_v, r) => <span>{r.redeposit} <Text type="secondary" style={{ fontSize: 12 }}>khoản · {usd(r.redepositAmount)}</Text></span> },
                    { title: 'TB / khách nạp', key: 'avg', align: 'right', render: (_v, r) => usd(Math.round(r.amount / r.depositors)) },
                ]}
            />
        </div>
    );
}

/** Mỗi chỉ số tính theo MỐC NGÀY nào (điểm dễ nhầm nhất của trang). */
function MetricDatesDemo() {
    const rows = [
        { key: 'new', m: 'Data mới / Tổng data', by: 'Ngày tạo khách (ngày data đổ về)' },
        { key: 'closed', m: 'Đã chốt', by: 'Ngày chốt, và khách đang ở trạng thái Đã chốt' },
        { key: 'joined', m: 'Đã join nhóm', by: 'Ngày join nhóm (1 khách join nhiều nhóm vẫn đếm 1)' },
        { key: 'rev', m: 'Doanh thu, Khách nạp', by: 'Ngày nạp của từng khoản nạp (không phụ thuộc khách tạo lúc nào)' },
        { key: 'ftd', m: 'Nạp lần đầu (FTD) / Nạp lại', by: 'Khoản nạp sớm nhất của khách = FTD, các khoản sau = nạp lại' },
        { key: 'rate', m: 'Tỷ lệ chốt / join nhóm / nạp', by: 'Trên data mới của kỳ, theo tình trạng hiện tại (nên không vượt 100%)' },
    ];
    return (
        <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={rows}
            columns={[
                { title: 'Chỉ số', dataIndex: 'm', key: 'm', render: (v: string) => <Text strong>{v}</Text> },
                { title: 'Tính theo', dataIndex: 'by', key: 'by' },
            ]}
        />
    );
}

type PeriodKey = 'week' | 'month' | 'quarter';
const PERIOD_EXAMPLES: Record<PeriodKey, { label: string; picked: string; range: string }> = {
    week: { label: 'Tuần', picked: 'Thứ Tư 07/10/2026', range: 'Thứ Hai 05/10/2026 → Chủ Nhật 11/10/2026' },
    month: { label: 'Tháng', picked: 'Tháng 10/2026', range: '01/10/2026 → 31/10/2026' },
    quarter: { label: 'Quý', picked: 'Quý 4/2026', range: '01/10/2026 → 31/12/2026' },
};

/** Kỳ báo cáo luôn là khoảng lịch trọn vẹn quanh ngày bạn chọn. */
function PeriodExplainerDemo({ period }: { period: PeriodKey }) {
    const e = PERIOD_EXAMPLES[period];
    return (
        <Card size="small" style={{ maxWidth: 520 }}>
            <div><Text type="secondary">Kỳ:</Text> <Text strong>{e.label}</Text></div>
            <div><Text type="secondary">Bạn chọn:</Text> <Text strong>{e.picked}</Text></div>
            <div style={{ marginTop: 6 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Đang xem: </Text>
                <Text strong style={{ fontSize: 13 }}>{e.range}</Text>
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>Dù hôm nay mới giữa kỳ, báo cáo vẫn tính cả khoảng trọn vẹn (kỳ chưa kết thúc thì số liệu còn tăng).</Text>
        </Card>
    );
}

export const REPORT_DEMOS: GuideDemo[] = [
    {
        id: 'report-revenue-by-viewer',
        title: 'Báo cáo doanh số (tab Doanh thu) theo phạm vi xem',
        description: 'viewer=admin (Toàn bộ) / manager (Phòng ban) / own (Của tôi)',
        params: { viewer: ['admin', 'manager', 'own'] },
        render: (p) => <RevenueByViewerDemo viewer={p.viewer === 'manager' ? 'manager' : p.viewer === 'own' ? 'own' : 'admin'} />,
    },
    {
        id: 'report-metric-dates',
        title: 'Mỗi chỉ số tính theo ngày nào',
        description: 'Bảng đối chiếu chỉ số và mốc ngày dùng để đếm',
        render: () => <MetricDatesDemo />,
    },
    {
        id: 'report-period-explainer',
        title: 'Kỳ báo cáo là khoảng lịch trọn vẹn',
        description: 'period=week|month|quarter: chọn 1 ngày thì hệ thống lấy cả tuần/tháng/quý chứa ngày đó',
        params: { period: ['week', 'month', 'quarter'] },
        render: (p) => <PeriodExplainerDemo period={p.period === 'month' ? 'month' : p.period === 'quarter' ? 'quarter' : 'week'} />,
    },
];