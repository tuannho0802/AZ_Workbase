'use client';

import { Alert, Button, Card, Col, Input, Row, Segmented, Select, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { WarningOutlined } from '@ant-design/icons';
import type { GuideDemo } from '../guide-demo.types';
import { SAMPLE_STATUSES } from '../demo-kit/sample-tags';

const { Text } = Typography;

type DemoKind = 'duplicate' | 'missing';

interface DemoInvalidRow {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    /** Chỉ có ở view trùng: giá trị SĐT chung của cụm (các dòng cùng key đứng liền nhau). */
    groupKey?: string;
    peers?: string[];
    inputDate: string;
    createdAt: string;
    status: number;
    sales: string | null;
    marketing: string | null;
    creator: string | null;
    groups: string[];
}

/** Dữ liệu mẫu (tên/SĐT là giả định). 2 cụm trùng SĐT: cụm 1 có 2 khách, cụm 2 có 3 khách (1 cụm khác Sales). */
const DUPLICATE_ROWS: DemoInvalidRow[] = [
    { id: 1, name: 'Lê Minh Châu', email: 'chau.le@example.com', phone: '0901234567', groupKey: '0901234567', peers: ['Lê M. Châu'], inputDate: '05/10/2026', createdAt: '05/10/2026 15:40', status: 1, sales: 'Nguyễn An', marketing: 'Hoàng Mai', creator: 'Hoàng Mai', groups: [] },
    { id: 2, name: 'Lê M. Châu', email: null, phone: '0901234567', groupKey: '0901234567', peers: ['Lê Minh Châu'], inputDate: '02/10/2026', createdAt: '02/10/2026 09:12', status: 2, sales: 'Nguyễn An', marketing: 'Hoàng Mai', creator: 'Hoàng Mai', groups: ['Nhóm Zalo A'] },
    { id: 3, name: 'Phạm Quân', email: 'quan.pham@example.com', phone: '0912345678', groupKey: '0912345678', peers: ['Quân Phạm', 'Pham Quan'], inputDate: '04/10/2026', createdAt: '04/10/2026 11:03', status: 1, sales: 'Trần Bình', marketing: null, creator: 'Trần Bình', groups: ['Nhóm Zalo A', 'Nhóm Zalo B'] },
    { id: 4, name: 'Quân Phạm', email: null, phone: '0912345678', groupKey: '0912345678', peers: ['Phạm Quân', 'Pham Quan'], inputDate: '28/09/2026', createdAt: '28/09/2026 16:20', status: 0, sales: 'Võ Dũng', marketing: 'Hoàng Mai', creator: 'Hoàng Mai', groups: ['Nhóm Zalo B'] },
    { id: 5, name: 'Pham Quan', email: null, phone: '0912345678', groupKey: '0912345678', peers: ['Phạm Quân', 'Quân Phạm'], inputDate: '20/09/2026', createdAt: '20/09/2026 08:45', status: 1, sales: null, marketing: null, creator: null, groups: [] },
];

const MISSING_ROWS: DemoInvalidRow[] = [
    { id: 11, name: 'Đặng Hòa', email: 'hoa.dang@example.com', phone: null, inputDate: '05/10/2026', createdAt: '05/10/2026 13:30', status: 1, sales: 'Nguyễn An', marketing: 'Hoàng Mai', creator: 'Hoàng Mai', groups: [] },
    { id: 12, name: 'Vũ Thảo', email: null, phone: '', inputDate: '03/10/2026', createdAt: '03/10/2026 10:15', status: 2, sales: null, marketing: null, creator: 'Trần Bình', groups: ['Nhóm Zalo A'] },
];

function userCell(name: string | null, empty: string) {
    return name ? <Text style={{ fontSize: 12 }}>{name}</Text> : <Text type="secondary">{empty}</Text>;
}

function groupsCell(groups: string[]) {
    if (groups.length === 0) return <Tag color="default">Chưa join</Tag>;
    const [first, ...rest] = groups;
    return (
        <Space size={[0, 4]} wrap>
            <Tag color="green">{first}</Tag>
            {rest.length > 0 && (
                <Tooltip title={`Nhóm khác đã join: ${rest.join(', ')}`}>
                    <Tag color="cyan">+{rest.length}</Tag>
                </Tooltip>
            )}
        </Space>
    );
}

/** Màu Tag theo nhóm trùng (cùng SĐT -> cùng màu), cố định cho mẫu. */
const GROUP_TAG_COLOR: Record<string, string> = { '0901234567': 'magenta', '0912345678': 'blue' };

/**
 * Mẫu tab "Danh sách" của trang Báo cáo data lỗi.
 * `type=duplicate`: view Trùng số điện thoại (ô SĐT gộp theo cụm, có cột "Trùng với ai", cảnh báo vàng).
 * `type=missing`: view Thiếu số điện thoại (bảng thường, không có cột "Trùng với ai").
 */
function InvalidDataTableDemo({ kind }: { kind: DemoKind }) {
    const isDuplicate = kind === 'duplicate';
    const rows = isDuplicate ? DUPLICATE_ROWS : MISSING_ROWS;

    const spanAt = (index: number) => {
        if (index > 0 && rows[index].groupKey === rows[index - 1].groupKey) return 0;
        let span = 1;
        for (let i = index + 1; i < rows.length && rows[i].groupKey === rows[index].groupKey; i++) span++;
        return span;
    };

    const columns: ColumnsType<DemoInvalidRow> = [
        {
            title: 'Khách hàng',
            key: 'name',
            width: 170,
            render: (_v, r) => (
                <Space orientation="vertical" size={0}>
                    <Text strong>{r.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{r.email}</Text>
                </Space>
            ),
        },
        {
            title: isDuplicate ? 'Số điện thoại (trùng lặp)' : 'Số điện thoại',
            key: 'phone',
            width: 170,
            render: (_v, r) => (isDuplicate ? <Tag color={GROUP_TAG_COLOR[r.groupKey ?? ''] ?? 'default'}>{r.phone}</Tag> : r.phone || '-'),
            onCell: isDuplicate ? (_r, index) => ({ rowSpan: spanAt(index ?? 0) }) : undefined,
        },
        ...(isDuplicate
            ? ([
                  {
                      title: 'Trùng với ai',
                      key: 'peers',
                      width: 170,
                      render: (_v: unknown, r: DemoInvalidRow) => {
                          const peers = r.peers ?? [];
                          const shown = peers.slice(0, 2);
                          const rest = peers.slice(2);
                          return (
                              <Space size={4} wrap>
                                  {shown.map((p) => (
                                      <Tag key={p} color="processing" style={{ cursor: 'pointer' }}>{p}</Tag>
                                  ))}
                                  {rest.length > 0 && <Tag>+{rest.length}</Tag>}
                              </Space>
                          );
                      },
                  },
              ] as ColumnsType<DemoInvalidRow>)
            : []),
        { title: 'Ngày nhập data', dataIndex: 'inputDate', key: 'inputDate', width: 115 },
        { title: 'Ngày nhập thực tế', dataIndex: 'createdAt', key: 'createdAt', width: 140 },
        { title: 'Trạng thái', key: 'status', width: 100, render: (_v, r) => <Tag color={SAMPLE_STATUSES[r.status].color}>{SAMPLE_STATUSES[r.status].name}</Tag> },
        { title: 'Sales', key: 'sales', width: 110, render: (_v, r) => userCell(r.sales, 'Chưa gán') },
        { title: 'Marketing phụ trách', key: 'marketing', width: 150, render: (_v, r) => userCell(r.marketing, 'Chưa gán') },
        { title: 'Người tạo', key: 'creator', width: 110, render: (_v, r) => userCell(r.creator, 'Hệ thống') },
        { title: 'Đã tham gia nhóm', key: 'groups', width: 170, align: 'center', render: (_v, r) => groupsCell(r.groups) },
    ];

    const distinctValues = isDuplicate ? new Set(rows.map((r) => r.groupKey)).size : 0;

    return (
        <Card
            size="small"
            title={isDuplicate ? '⚠️📞 Trùng số điện thoại' : '📵 Thiếu số điện thoại'}
            extra={
                <Space size={8} wrap>
                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>{rows.length} khách hàng</Tag>
                    {isDuplicate && <Tag color="orange" style={{ marginInlineEnd: 0 }}>{distinctValues} nhóm trùng</Tag>}
                </Space>
            }
        >
            <Space style={{ marginBottom: 12 }} size="middle" wrap align="end">
                <div>
                    <div><Text strong>Loại kiểm tra</Text></div>
                    <Select style={{ width: 230 }} value={isDuplicate ? 'duplicate_phone' : 'missing_phone'} open={false} options={[
                        { value: 'duplicate_phone', label: '⚠️📞 Trùng số điện thoại' },
                        { value: 'missing_phone', label: '📵 Thiếu số điện thoại' },
                    ]} />
                </div>
                <div>
                    <div><Text strong>Trạng thái</Text></div>
                    <Select style={{ width: 140 }} placeholder="Tất cả trạng thái" open={false} options={[]} />
                </div>
                <div>
                    <div><Text strong>Sales phụ trách</Text></div>
                    <Select style={{ width: 150 }} placeholder="Chọn Sales" open={false} options={[]} />
                </div>
                <div>
                    <div><Text strong>Nhóm cụ thể</Text></div>
                    <Select style={{ width: 150 }} placeholder="Tất cả nhóm" open={false} options={[]} />
                </div>
                <div>
                    <div><Text strong>Tìm kiếm</Text></div>
                    <Input style={{ width: 190 }} placeholder="Tên, SĐT, Email..." readOnly />
                </div>
                <Button>Làm mới</Button>
            </Space>

            {isDuplicate && (
                <Alert
                    style={{ marginBottom: 12 }}
                    type="warning"
                    showIcon
                    icon={<WarningOutlined />}
                    title={`Phát hiện ${distinctValues} số điện thoại bị trùng`}
                    description={`Tổng cộng ${rows.length} khách hàng liên quan đến ${distinctValues} số điện thoại bị lặp lại. Các dòng cùng màu Tag ở cột "Số điện thoại" đã được gộp thành 1 nhóm.`}
                />
            )}

            <Table<DemoInvalidRow>
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={rows}
                scroll={{ x: 'max-content' }}
                pagination={{ current: 1, pageSize: 20, total: rows.length, showSizeChanger: false }}
            />
        </Card>
    );
}

interface OverviewCard {
    emoji: string;
    label: string;
    value: number;
    note: string;
    hint: string;
    selected?: boolean;
}

/**
 * Mẫu tab "Thống kê": kỳ thống kê, 5 thẻ tổng quan các loại lỗi và vài thẻ KPI của loại trùng đang chọn.
 * Chỉ số liệu giả để minh hoạ cách đọc; biểu đồ/bảng xếp hạng bên dưới ở trang thật không vẽ lại ở đây.
 */
function InvalidStatsDemo() {
    const cards: OverviewCard[] = [
        { emoji: '⚠️📞', label: 'Trùng số điện thoại', value: 14, note: 'bản trùng phát sinh · 9 nhóm', hint: 'Đang xem chi tiết bên dưới', selected: true },
        { emoji: '⚠️✉️', label: 'Trùng email', value: 6, note: 'bản trùng phát sinh · 5 nhóm', hint: 'Bấm để xem chi tiết' },
        { emoji: '📵', label: 'Thiếu số điện thoại', value: 3, note: '0.6% khách nhập trong kỳ', hint: 'Bấm để mở danh sách (theo kỳ)' },
        { emoji: '📭', label: 'Thiếu email', value: 87, note: '17.4% khách nhập trong kỳ', hint: 'Bấm để mở danh sách (theo kỳ)' },
        { emoji: '📅', label: 'Ngày nhập > hiện tại', value: 0, note: '0% khách nhập trong kỳ', hint: 'Bấm để mở danh sách (theo kỳ)' },
    ];

    return (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Space size="middle" wrap align="end">
                <div>
                    <div><Text strong>Đối tượng thống kê</Text></div>
                    <Segmented value="duplicate_phone" options={[{ value: 'duplicate_phone', label: '📞 Số điện thoại' }, { value: 'duplicate_email', label: '✉️ Email' }]} />
                </div>
                <div>
                    <div><Text strong>Kỳ thống kê</Text></div>
                    <Select style={{ width: 140 }} value="30d" open={false} options={[{ value: '30d', label: '30 ngày' }]} />
                </div>
                <Tag color="blue">Kỳ: 07/09/2026 – 06/10/2026 (30 ngày)</Tag>
                <Tag>500 khách nhập trong kỳ</Tag>
            </Space>

            <Row gutter={[12, 12]}>
                {cards.map((c) => (
                    <Col key={c.label} xs={12} md={8} xl={{ flex: '1 1 0' }}>
                        <Card size="small" hoverable style={{ borderColor: c.selected ? '#1677ff' : undefined, height: '100%' }}>
                            <Statistic title={<span>{c.emoji} {c.label}</span>} value={c.value} styles={{ content: { color: c.value > 0 ? '#f5222d' : '#52c41a', fontSize: 24 } }} />
                            <Text type="secondary" style={{ fontSize: 12 }}>{c.note}</Text>
                            <div style={{ marginTop: 4 }}><Text type="secondary" style={{ fontSize: 11 }}>{c.hint}</Text></div>
                        </Card>
                    </Col>
                ))}
            </Row>

            <Row gutter={[12, 12]}>
                <Col xs={12} md={8}>
                    <Card size="small">
                        <Statistic title="Tỷ lệ nhập trùng" value={2.9} suffix="%" styles={{ content: { color: '#fa8c16' } }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>14 bản dư / 480 khách có SĐT</Text>
                    </Card>
                </Col>
                <Col xs={12} md={8}>
                    <Card size="small">
                        <Statistic title="Bản ghi trùng phát sinh" value={14} styles={{ content: { color: '#fa8c16' } }} />
                        <Text style={{ fontSize: 12, color: '#f5222d' }}>▲ +4 (+40%) so với kỳ trước (10)</Text>
                    </Card>
                </Col>
                <Col xs={12} md={8}>
                    <Card size="small">
                        <Statistic title="Trùng khác Sales" value={3} suffix="/ 9 cụm" styles={{ content: { color: '#f5222d' } }} />
                    </Card>
                </Col>
            </Row>
        </Space>
    );
}

/** Mẫu của trang "Báo cáo data lỗi". */
export const INVALID_DATA_DEMOS: GuideDemo[] = [
    {
        id: 'invalid-data-table',
        title: 'Danh sách data lỗi',
        description: 'Tab Danh sách; type=duplicate (Trùng SĐT, ô SĐT gộp theo cụm) hoặc type=missing (Thiếu SĐT)',
        params: { type: ['duplicate', 'missing'] },
        render: (p) => <InvalidDataTableDemo kind={p.type === 'missing' ? 'missing' : 'duplicate'} />,
    },
    {
        id: 'invalid-stats',
        title: 'Thống kê data lỗi',
        description: 'Tab Thống kê: kỳ thống kê, 5 thẻ tổng quan và các thẻ chỉ số của loại trùng đang chọn',
        render: () => <InvalidStatsDemo />,
    },
];
