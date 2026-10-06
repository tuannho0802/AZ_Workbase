'use client';

import { useState, type ReactNode } from 'react';
import { Alert, Button, Card, Col, DatePicker, Progress, Row, Segmented, Select, Space, Statistic, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { BarChartOutlined, FlagFilled, UnorderedListOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PerformanceStackedChart } from '@/components/periodic-tasks/PerformanceStackedChart';
import { TaskAssigneesView } from '@/components/periodic-tasks/TaskAssignees';
import { TaskMiniCardView } from '@/components/periodic-tasks/TaskMiniCard';
import { LATE_GRACE_DAYS, type PerformanceUserRow } from '@/lib/api/periodic-task-performance.api';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import type { PermissionScope } from '@/lib/types/roles.types';
import { aggregateRows, completionColor, lateRateColor, percentOf } from '@/lib/utils/periodicTaskPerformance';
import { DemoFrame } from '../demo-kit/DemoFrame';
import { DEMO_TASKS, DEMO_TASK_STATUSES, demoUserName } from '../demo-kit/sample-tasks';
import type { GuideDemo } from '../guide-demo.types';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

const SCOPE_IDS = ['own', 'department', 'all'] as const;
const SCOPE_META: Record<PermissionScope, { label: string; color: string }> = {
    own: { label: 'Chỉ của tôi', color: 'default' },
    department: { label: 'Theo phòng ban', color: 'blue' },
    all: { label: 'Toàn bộ', color: 'green' },
};

/** Người xem mẫu ở chế độ "Chỉ của tôi" = Sales An (id 4, khớp `sample-tasks`). */
const ME_ID = 4;
/** Phòng ban mà người xem mẫu "Theo phòng ban" quản lý = Kinh doanh 1 (id 1). */
const MANAGED_DEPARTMENT_ID = 1;

interface Seed {
    userId: number;
    userName: string;
    departmentId: number;
    onTime: number;
    late: number;
    overdue: number;
    pending: number;
    inProgress: number;
    inReview: number;
    secondaryTotal: number;
    checklist: [number, number];
    checklistSecondary: [number, number];
}

/** Dữ liệu cứng, tên người và số liệu là BỊA. Với mỗi người: Tổng = Đúng hạn + Xong muộn + Quá hạn + Đang trong hạn. */
const SEEDS: Seed[] = [
    { userId: 4, userName: 'Sales An', departmentId: 1, onTime: 5, late: 1, overdue: 1, pending: 1, inProgress: 2, inReview: 1, secondaryTotal: 2, checklist: [12, 20], checklistSecondary: [3, 6] },
    { userId: 5, userName: 'Sales Bình', departmentId: 1, onTime: 4, late: 0, overdue: 0, pending: 2, inProgress: 1, inReview: 1, secondaryTotal: 3, checklist: [8, 10], checklistSecondary: [2, 5] },
    { userId: 3, userName: 'Quản lý Nam', departmentId: 1, onTime: 2, late: 1, overdue: 0, pending: 1, inProgress: 1, inReview: 0, secondaryTotal: 0, checklist: [4, 8], checklistSecondary: [0, 0] },
    { userId: 8, userName: 'Sales Dũng', departmentId: 2, onTime: 3, late: 2, overdue: 2, pending: 0, inProgress: 2, inReview: 0, secondaryTotal: 1, checklist: [5, 14], checklistSecondary: [1, 2] },
    { userId: 6, userName: 'Marketing Mai', departmentId: 3, onTime: 4, late: 0, overdue: 0, pending: 1, inProgress: 0, inReview: 1, secondaryTotal: 1, checklist: [6, 6], checklistSecondary: [0, 1] },
];

export function buildPerformanceRow(s: Seed): PerformanceUserRow {
    const total = s.onTime + s.late + s.overdue + s.pending;
    const completed = s.onTime + s.late;
    return {
        userId: s.userId,
        userName: s.userName,
        total,
        completedOnTime: s.onTime,
        completedLate: s.late,
        overdueNotCompleted: s.overdue,
        pendingFuture: s.pending,
        completionRatePercent: percentOf(completed, total),
        lateRatePercent: percentOf(s.late, completed),
        inProgressCount: s.inProgress,
        inReviewCount: s.inReview,
        inProgressRatePercent: percentOf(s.inProgress, total),
        inReviewRatePercent: percentOf(s.inReview, total),
        checklistDone: s.checklist[0],
        checklistTotal: s.checklist[1],
        secondaryTotal: s.secondaryTotal,
        checklistSecondaryDone: s.checklistSecondary[0],
        checklistSecondaryTotal: s.checklistSecondary[1],
    };
}

export const DEMO_PERFORMANCE_ROWS: PerformanceUserRow[] = SEEDS.map(buildPerformanceRow);

/** Các dòng mà người xem thấy theo phạm vi: Của mình = riêng An; Theo phòng ban = Kinh doanh 1; Toàn bộ = tất cả. */
export function rowsForScope(scope: PermissionScope): PerformanceUserRow[] {
    if (scope === 'own') return DEMO_PERFORMANCE_ROWS.filter((r) => r.userId === ME_ID);
    if (scope === 'department') {
        const ids = new Set(SEEDS.filter((s) => s.departmentId === MANAGED_DEPARTMENT_ID).map((s) => s.userId));
        return DEMO_PERFORMANCE_ROWS.filter((r) => ids.has(r.userId));
    }
    return DEMO_PERFORMANCE_ROWS;
}

const columns: ColumnsType<PerformanceUserRow> = [
    { title: 'Nhân viên', dataIndex: 'userName', key: 'userName', width: 150, render: (n: string) => <Text strong>{n}</Text> },
    { title: 'Tổng Task của mình', dataIndex: 'total', key: 'total', width: 100, align: 'right' },
    { title: 'Đúng hạn', dataIndex: 'completedOnTime', key: 'completedOnTime', width: 80, align: 'right', render: (v: number) => <Text style={{ color: '#52c41a' }}>{v}</Text> },
    { title: 'Xong muộn', dataIndex: 'completedLate', key: 'completedLate', width: 90, align: 'right', render: (v: number) => (v > 0 ? <Text style={{ color: '#d48806' }}>{v}</Text> : v) },
    { title: 'Quá hạn chưa xong', dataIndex: 'overdueNotCompleted', key: 'overdueNotCompleted', width: 120, align: 'right', render: (v: number) => (v > 0 ? <Text type="danger" strong>{v}</Text> : v) },
    { title: 'Đang trong hạn', dataIndex: 'pendingFuture', key: 'pendingFuture', width: 110, align: 'right' },
    {
        title: '% Hoàn thành',
        dataIndex: 'completionRatePercent',
        key: 'completionRatePercent',
        width: 160,
        render: (v: number | null) => (v == null ? '—' : <Progress percent={v} size="small" strokeColor={completionColor(v)} format={(p) => `${p}%`} />),
    },
    {
        title: '% Xong muộn',
        dataIndex: 'lateRatePercent',
        key: 'lateRatePercent',
        width: 110,
        align: 'center',
        render: (v: number | null) => (v == null ? '—' : <Tag color={lateRateColor(v)}>{v}%</Tag>),
    },
    {
        title: 'Thao tác',
        key: 'action',
        width: 100,
        render: (_v, r) => {
            const flagged = r.completedLate + r.overdueNotCompleted;
            return <Button type="link" size="small">Chi tiết{flagged > 0 ? ` (${flagged})` : ''}</Button>;
        },
    },
];

function PerformancePageDemo({ initialScope, switchable }: { initialScope: PermissionScope; switchable: boolean }) {
    const [scope, setScope] = useState<PermissionScope>(initialScope);
    const rows = rowsForScope(scope);
    const canSeeOthers = scope !== 'own';
    const isSelf = scope === 'own';
    const totals = aggregateRows(rows);
    const viewLabel = isSelf ? 'Chỉ của tôi' : `${scope === 'department' ? 'Phòng ban của tôi' : 'Toàn bộ'} · ${rows.length} nhân viên`;
    const who = isSelf ? 'mình' : 'các nhân viên';
    const multiNote = isSelf ? '' : ' (cộng theo từng nhân viên)';

    const cards: Array<{ title: string; value: number | null; suffix?: string; color?: string; sub?: string }> = [
        { title: isSelf ? 'Tổng Task của mình' : 'Tổng Task phụ trách chính', value: totals.total, sub: isSelf ? 'Phụ trách chính, trong kỳ' : 'Phụ trách chính của các nhân viên, trong kỳ' },
        { title: 'Tổng Task phụ trách phụ', value: totals.secondaryTotal, sub: `Task người khác, ${who} là phụ trách phụ${multiNote}` },
        { title: '% Hoàn thành', value: totals.completionRatePercent, suffix: '%', color: completionColor(totals.completionRatePercent), sub: `${totals.completedOnTime + totals.completedLate}/${totals.total} Task` },
        { title: '% Xong muộn', value: totals.lateRatePercent, suffix: '%', color: totals.lateRatePercent ? '#d48806' : undefined, sub: `${totals.completedLate} Task xong muộn` },
        { title: 'Quá hạn chưa xong', value: totals.overdueNotCompleted, color: totals.overdueNotCompleted > 0 ? '#f5222d' : undefined },
        { title: isSelf ? 'Checklist Task của mình' : 'Checklist Task phụ trách chính', value: totals.checklistRatePercent, suffix: '%', sub: `${totals.checklistDone}/${totals.checklistTotal} mục` },
        { title: 'Checklist Task phụ trách phụ', value: totals.checklistSecondaryRatePercent, suffix: '%', sub: `${totals.checklistSecondaryDone}/${totals.checklistSecondaryTotal} mục${multiNote}` },
        { title: '% Đang làm', value: totals.inProgressRatePercent, suffix: '%', color: '#1677ff', sub: `${totals.inProgressCount}/${totals.total} Task` },
        { title: '% Đang xem xét', value: totals.inReviewRatePercent, suffix: '%', color: '#722ed1', sub: `${totals.inReviewCount}/${totals.total} Task` },
    ];

    const controls = switchable ? (
        <Space size={8} wrap>
            <Text type="secondary" style={{ fontSize: 13 }}>Xem với tư cách người có phạm vi:</Text>
            <Segmented
                size="small"
                value={scope}
                onChange={(v) => setScope(v as PermissionScope)}
                options={SCOPE_IDS.map((id) => ({ value: id, label: SCOPE_META[id].label }))}
            />
        </Space>
    ) : undefined;

    return (
        <DemoFrame title="Trang Hiệu suất công việc (rút gọn)" controls={controls}>
            <div>
                <Space size={12} wrap style={{ marginBottom: 12 }}>
                    <Title level={4} style={{ margin: 0 }}><BarChartOutlined /> Hiệu suất công việc</Title>
                    <Tag color={isSelf ? 'geekblue' : SCOPE_META[scope].color} style={{ fontSize: 13, padding: '2px 10px' }}>Đang xem: {viewLabel}</Tag>
                    {canSeeOthers && <Text type="secondary" style={{ fontSize: 12 }}>Quyền xem: {SCOPE_META[scope].label}</Text>}
                </Space>
                {!canSeeOthers && (
                    <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Bạn chưa được cấp quyền xem hiệu suất của người khác - chỉ hiển thị dữ liệu của chính bạn." />
                )}
                <Card size="small" variant="outlined" style={{ marginBottom: 12 }}>
                    <Space wrap size={8}>
                        <RangePicker format="DD/MM/YYYY" value={[dayjs('2026-10-01'), dayjs('2026-10-31')]} allowClear={false} />
                        <Select allowClear placeholder="Loại kỳ" style={{ width: 120 }} options={[]} />
                        {canSeeOthers && <Select allowClear placeholder="Phòng ban" style={{ width: 150 }} options={[]} />}
                        {canSeeOthers && <Select mode="multiple" placeholder="Phụ trách chính..." style={{ width: 170 }} options={[]} />}
                        {canSeeOthers && <Select mode="multiple" placeholder="Phụ trách phụ..." style={{ width: 170 }} options={[]} />}
                    </Space>
                    <div style={{ marginTop: 8 }}>
                        <Space size={8} wrap>
                            <Text type="secondary" style={{ fontSize: 13 }}>Lọc nhanh:</Text>
                            <Button size="small">Tuần này</Button>
                            <Button size="small">Tuần trước</Button>
                            <Button size="small" type="primary">Tháng này</Button>
                            <Button size="small">Tháng trước</Button>
                            <Button size="small">90 ngày gần đây</Button>
                        </Space>
                    </div>
                </Card>
                <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
                    {cards.map((c) => (
                        <Col key={c.title} xs={12} md={8} xl={8}>
                            <Card size="small" variant="outlined" hoverable style={{ height: '100%' }}>
                                <Statistic
                                    title={c.title}
                                    value={c.value ?? '—'}
                                    suffix={c.value == null ? undefined : c.suffix}
                                    styles={c.color ? { content: { color: c.color } } : undefined}
                                />
                                {c.sub && <Text type="secondary" style={{ fontSize: 12 }}>{c.sub}</Text>}
                            </Card>
                        </Col>
                    ))}
                </Row>
                <Card size="small" variant="outlined">
                    <Table<PerformanceUserRow> rowKey="userId" size="small" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 900 }} />
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                        Bản rút gọn: trang thật còn các cột Tổng Task phụ trách phụ, % Đang làm, % Đang xem xét và hai cột Checklist. Ân hạn: {LATE_GRACE_DAYS} ngày sau kỳ hạn.
                    </Text>
                </Card>
            </div>
        </DemoFrame>
    );
}

/** Biểu đồ THẬT (`PerformanceStackedChart`) với số liệu mẫu của toàn bộ nhân viên. */
function PerformanceChartDemo() {
    return (
        <Card size="small" variant="outlined" title="Phân bổ Task theo nhân viên">
            <PerformanceStackedChart rows={DEMO_PERFORMANCE_ROWS} />
        </Card>
    );
}

function GroupHeader({ label, total, color }: { label: string; total: number; color: 'blue' | 'purple' }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                background: color === 'blue' ? '#e6f4ff' : '#f9f0ff',
                border: `1px solid ${color === 'blue' ? '#91caff' : '#d3adf7'}`,
                borderRadius: 6,
                padding: '6px 12px',
                marginBottom: 10,
            }}
        >
            <Text strong style={{ fontSize: 13, color: color === 'blue' ? '#0958d9' : '#531dab' }}>{label} ({total})</Text>
        </div>
    );
}

function OwnTaskCard({ task }: { task: PeriodicTask }) {
    return (
        <TaskMiniCardView
            task={task}
            showProgress
            lockedByName={demoUserName(task.lockedById)}
            assigneesSlot={<TaskAssigneesView task={task} />}
            style={{ marginBottom: 10 }}
            footer={
                <Space size={8} wrap>
                    <Text type="secondary" style={{ fontSize: 12 }}>Đổi trạng thái nhanh:</Text>
                    <Select
                        size="small"
                        style={{ minWidth: 170 }}
                        value={task.statusId}
                        options={DEMO_TASK_STATUSES.map((s) => ({ value: s.id, label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag> }))}
                    />
                </Space>
            }
        />
    );
}

/** Khối "Chi tiết công việc của tôi": hai nhóm Phụ trách chính / Phụ trách phụ của Sales An, dùng Card việc THẬT. */
function OwnPerformanceDemo(): ReactNode {
    const primary = DEMO_TASKS.filter((t) => t.primaryAssigneeId === ME_ID);
    const secondary = DEMO_TASKS.filter((t) => t.primaryAssigneeId !== ME_ID && (t.secondaryAssignees ?? []).some((u) => u.id === ME_ID));
    return (
        <Card
            size="small"
            style={{ background: '#f0f7ff', border: '1px solid #91caff' }}
            title={<Space size={6}><UnorderedListOutlined /><Text strong>Chi tiết công việc của tôi</Text></Space>}
        >
            <Space size={8} wrap style={{ marginBottom: 12 }}>
                <RangePicker size="small" format="DD/MM/YYYY" value={[dayjs('2026-10-05'), dayjs('2026-10-11')]} allowClear={false} />
                <Text type="secondary" style={{ fontSize: 12 }}>Lọc nhanh:</Text>
                <Button size="small">Hôm nay</Button>
                <Button size="small" type="primary">Tuần này</Button>
                <Button size="small">Tuần trước</Button>
                <Button size="small">Tháng này</Button>
                <Button size="small">Tháng trước</Button>
                <Space size={6} style={{ marginInlineStart: 8 }}>
                    <Switch size="small" checked={false} aria-label="Chỉ hiển thị Task quá hạn" />
                    <Text style={{ fontSize: 12 }}><FlagFilled style={{ color: '#ff4d4f', marginInlineEnd: 4 }} />Chỉ hiển thị Task quá hạn</Text>
                </Space>
            </Space>
            <GroupHeader label="Phụ trách chính" total={primary.length} color="blue" />
            {primary.map((t) => <OwnTaskCard key={t.id} task={t} />)}
            <div style={{ marginTop: 16 }}>
                <GroupHeader label="Phụ trách phụ" total={secondary.length} color="purple" />
            </div>
            {secondary.map((t) => <OwnTaskCard key={t.id} task={t} />)}
        </Card>
    );
}

export const TASK_PERFORMANCE_DEMOS: GuideDemo[] = [
    {
        id: 'performance-page',
        title: 'Trang Hiệu suất công việc (rút gọn)',
        description: 'Chín thẻ số liệu và bảng theo nhân viên; có bộ chọn phạm vi xem Của mình / Theo phòng ban / Toàn bộ (tham số scope=...)',
        params: { scope: SCOPE_IDS },
        selfFramed: true,
        render: (p) => <PerformancePageDemo initialScope={(p.scope as PermissionScope) ?? 'department'} switchable />,
    },
    {
        id: 'performance-chart',
        title: 'Biểu đồ Phân bổ Task theo nhân viên',
        description: 'Thanh ngang xếp chồng bốn nhóm: đúng hạn, muộn, quá hạn chưa xong, đang trong hạn (dùng đúng biểu đồ thật, số liệu mẫu)',
        render: () => <PerformanceChartDemo />,
    },
    {
        id: 'own-performance',
        title: 'Khối Chi tiết công việc của tôi',
        description: 'Việc của mình chia nhóm Phụ trách chính / Phụ trách phụ, có đổi trạng thái nhanh (bản tĩnh, không lưu gì)',
        render: () => <OwnPerformanceDemo />,
    },
];
