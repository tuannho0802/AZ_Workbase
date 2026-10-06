'use client';

import { useState, type ReactNode } from 'react';
import { Alert, Avatar, Badge, Calendar, Checkbox, Col, Collapse, ColorPicker, DatePicker, Divider, Form, Input, Progress, Row, Segmented, Select, Space, Table, Tag, Tooltip, Typography, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleFilled, CloseCircleFilled, DeleteOutlined, LockOutlined, MinusCircleFilled, PlusOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PeriodTypeTag } from '@/components/periodic-tasks/PeriodTypeTag';
import { TaskActionsBar, OverdueMarkButtonView } from '@/components/periodic-tasks/TaskActionsBar';
import { TaskAssigneesView } from '@/components/periodic-tasks/TaskAssignees';
import { TaskMiniCardView } from '@/components/periodic-tasks/TaskMiniCard';
import { TaskTitlePill } from '@/components/periodic-tasks/TaskTitlePill';
import { PERIODIC_TASK_FIELD_LABELS } from '@/components/periodic-tasks/TaskAuditLogsModal';
import { PERIOD_TYPE_LABELS, type PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { PERIODIC_TASK_AUDIT_ACTION_META } from '@/lib/types/periodic-task-audit.types';
import { getChecklistTone } from '@/lib/utils/checklistProgress';
import { canMarkOverdue, canUnmarkOverdue } from '@/lib/utils/periodicTaskOverdue';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { DemoFrame } from '../demo-kit/DemoFrame';
import { DEMO_TASKS, DEMO_TASK_DEPARTMENTS, DEMO_TASK_STATUSES, DEMO_TODAY, demoUserName } from '../demo-kit/sample-tasks';
import { TASK_PERSONAS, findTaskPersona } from '../demo-kit/task-personas';
import { TASK_ACTION, canDeleteTask, computeTaskPageView, computeTaskRowActions } from '../demo-kit/compute-task-view';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;
const noop = () => undefined;

/** Có hiện nút "Đánh dấu / Gỡ quá hạn" cho việc này hay không - dùng đúng hàm thật với "hôm nay" cố định của bộ mẫu. */
const overdueShown = (t: PeriodicTask): boolean => canMarkOverdue(t, DEMO_TODAY) || canUnmarkOverdue(t);

const formatPeriod = (t: PeriodicTask): string =>
    t.periodType === 'daily'
        ? dayjs(t.periodStartDate).format('DD/MM/YYYY')
        : `${dayjs(t.periodStartDate).format('DD/MM/YYYY')} - ${dayjs(t.periodEndDate).format('DD/MM/YYYY')}`;

/** Thanh nút Thao tác THẬT (`TaskActionsBar`) với quyền suy ra từ persona; mọi handler là no-op. */
export function DemoActionsBar({ task, personaId, wrap = true }: { task: PeriodicTask; personaId: string; wrap?: boolean }) {
    const p = findTaskPersona(personaId) ?? TASK_PERSONAS[0];
    const has = (k: string) => p.permissions.includes(k);
    return (
        <TaskActionsBar
            task={task}
            canEdit={has('periodic_tasks.edit')}
            canEditLocked={has('periodic_tasks.edit_locked')}
            canApprove={has('periodic_tasks.approve')}
            canDelete={(t) => canDeleteTask(t, p)}
            onLink={noop}
            onChecklist={noop}
            onCustomers={has('customers.view') ? noop : undefined}
            onAudit={noop}
            onEdit={noop}
            onLock={noop}
            onUnlock={noop}
            onDelete={noop}
            wrap={wrap}
            renderOverdue={(t, size, iconOnly) => <OverdueMarkButtonView task={t} size={size} iconOnly={iconOnly} today={DEMO_TODAY} />}
        />
    );
}

const assigneesSlot = (t: PeriodicTask) => <TaskAssigneesView task={t} />;

/** Card THẬT (`TaskMiniCardView`) - tên người khoá + phần Phụ trách được truyền vào thay cho hook. */
function DemoCard({ task, density = 'full' }: { task: PeriodicTask; density?: 'full' | 'compact' | 'mini' }) {
    return (
        <TaskMiniCardView
            task={task}
            density={density}
            showProgress
            lockedByName={demoUserName(task.lockedById)}
            assigneesSlot={assigneesSlot(task)}
            style={{ marginBottom: 8 }}
        />
    );
}

/** Mẫu trọng tâm: đổi persona -> danh sách Công việc + nút đổi theo phạm vi/quyền. */
export function TaskTableByViewer({ initialPersona, switchable }: { initialPersona: string; switchable: boolean }) {
    const [personaId, setPersonaId] = useState(initialPersona);
    const persona = findTaskPersona(personaId) ?? TASK_PERSONAS[0];
    const view = computeTaskPageView(DEMO_TASKS, persona, overdueShown);

    const columns: ColumnsType<PeriodicTask> = [
        { title: 'STT', key: 'stt', width: 44, align: 'center', render: (_v, _r, i) => i + 1 },
        {
            title: 'Công việc',
            key: 'title',
            width: 220,
            render: (_v, t) => (
                <Space size={4} wrap>
                    <TaskTitlePill title={t.title} color={t.color} maxLength={40} />
                    {t.isLocked && (
                        <Tooltip title={t.lockNote ?? 'Đã khoá'}>
                            <LockOutlined style={{ color: '#fa541c' }} />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
        {
            title: 'Kỳ hạn',
            key: 'period',
            width: 190,
            render: (_v, t) => (
                <Space size={4} wrap>
                    <PeriodTypeTag type={t.periodType} />
                    <Text style={{ fontSize: 12 }}>{formatPeriod(t)}</Text>
                </Space>
            ),
        },
        { title: 'Trạng thái', key: 'status', width: 130, render: (_v, t) => <Tag color={t.status?.color}>{t.status?.name}</Tag> },
        { title: 'Phụ trách', key: 'assignees', width: 230, render: (_v, t) => <TaskAssigneesView task={t} /> },
        { title: 'Phòng ban', key: 'dept', width: 120, render: (_v, t) => t.department?.name ?? '—' },
        { title: 'Thao tác', key: 'action', width: 520, render: (_v, t) => <DemoActionsBar task={t} personaId={persona.id} /> },
    ];

    const controls = switchable ? (
        <Space size={8} wrap>
            <Text type="secondary">Xem với tư cách:</Text>
            <Segmented size="small" value={persona.id} onChange={(v) => setPersonaId(String(v))} options={TASK_PERSONAS.map((p) => ({ value: p.id, label: p.label }))} />
        </Space>
    ) : undefined;

    return (
        <DemoFrame title={`Công việc định kỳ - ${persona.roleLabel}`} controls={controls}>
            {view.canViewPage ? (
                <>
                    <Space wrap style={{ marginBottom: 8 }} data-testid="demo-toolbar">
                        <Segmented size="small" value="Bảng" options={view.tabs} />
                        {view.toolbar.map((t) => (
                            <Button key={t} size="small" type="primary" icon={<PlusOutlined />}>
                                {t}
                            </Button>
                        ))}
                    </Space>
                    <Table<PeriodicTask>
                        size="small"
                        rowKey="id"
                        columns={columns}
                        dataSource={view.rows}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        locale={{ emptyText: 'Không có Công việc nào trong phạm vi của bạn' }}
                    />
                </>
            ) : null}
            <Alert type="info" showIcon style={{ marginTop: 8 }} title={persona.note} />
        </DemoFrame>
    );
}

type Scenario = 'normal' | 'locked-manual' | 'locked-auto';
const SCENARIOS: Record<Scenario, { label: string; taskId: number }> = {
    normal: { label: 'Việc bình thường (Gọi lại khách tiềm năng)', taskId: 1 },
    'locked-manual': { label: 'Việc khoá thủ công (Hoàn tất hồ sơ T9)', taskId: 9 },
    'locked-auto': { label: 'Việc tự động khoá (Chăm sóc VIP T9)', taskId: 8 },
};
const MATRIX_ACTIONS = [TASK_ACTION.edit, TASK_ACTION.lock, TASK_ACTION.unlock, TASK_ACTION.delete, TASK_ACTION.customers];

/** Ma trận nút theo persona cho 1 việc: ✓ = hiện, ⚠ = hiện nhưng bị vô hiệu, ✕ = không có, "Không thấy" = ngoài phạm vi. */
export function TaskActionsMatrix({ initialScenario }: { initialScenario: Scenario }) {
    const [scenario, setScenario] = useState<Scenario>(initialScenario);
    const task = DEMO_TASKS.find((t) => t.id === SCENARIOS[scenario].taskId)!;
    const rows = TASK_PERSONAS.map((p) => {
        const seen = computeTaskPageView([task], p, overdueShown).rows.length > 0;
        const a = computeTaskRowActions(task, p, overdueShown(task));
        return { key: p.id, persona: p, seen, a };
    });
    const cell = (r: (typeof rows)[number], action: string) => {
        if (!r.seen) return <Text type="secondary">—</Text>;
        if (r.a.disabled.includes(action)) return <Tooltip title="Hiện nhưng bị vô hiệu (thiếu quyền Sửa khi đang khoá)"><MinusCircleFilled style={{ color: '#faad14' }} /></Tooltip>;
        return r.a.visible.includes(action) ? <CheckCircleFilled style={{ color: '#52c41a' }} /> : <CloseCircleFilled style={{ color: '#d9d9d9' }} />;
    };
    const columns: ColumnsType<(typeof rows)[number]> = [
        { title: 'Người xem', key: 'p', render: (_v, r) => r.persona.label },
        { title: 'Thấy việc này?', key: 'seen', align: 'center', render: (_v, r) => (r.seen ? 'Có' : 'Không thấy') },
        ...MATRIX_ACTIONS.map((a) => ({ title: a, key: a, align: 'center' as const, render: (_v: unknown, r: (typeof rows)[number]) => cell(r, a) })),
    ];
    return (
        <DemoFrame
            title="Nút thao tác theo người xem"
            controls={
                <Space size={8} wrap>
                    <Text type="secondary">Tình huống:</Text>
                    <Segmented size="small" value={scenario} onChange={(v) => setScenario(v as Scenario)} options={(Object.keys(SCENARIOS) as Scenario[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))} />
                </Space>
            }
        >
            <Table size="small" pagination={false} rowKey="key" columns={columns} dataSource={rows} scroll={{ x: 'max-content' }} />
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                ✓ hiện · ⚠ hiện nhưng bị vô hiệu · ✕ không có nút · — không thấy việc. Nút &quot;Khách hàng&quot; chỉ hiện khi việc có khách liên kết.
            </Text>
        </DemoFrame>
    );
}

const byStatus = (code: string) => DEMO_TASKS.filter((t) => t.status?.code === code);

const AGENDA_DAYS = ['2026-10-05', '2026-10-04'];

function AgendaDemo() {
    const dayTasks = (ymd: string) => DEMO_TASKS.filter((t) => t.periodStartDate <= ymd && ymd <= t.periodEndDate && (t.periodType === 'daily' || t.periodType === 'weekly')).slice(0, 4);
    return (
        <Collapse
            defaultActiveKey={[AGENDA_DAYS[0]]}
            items={AGENDA_DAYS.map((ymd) => ({
                key: ymd,
                label: (
                    <Space>
                        <Text strong>{dayjs(ymd).format('DD/MM/YYYY')}</Text>
                        <Badge count={dayTasks(ymd).length} color="#1890ff" />
                    </Space>
                ),
                children: dayTasks(ymd).map((t) => <DemoCard key={t.id} task={t} density="compact" />),
            }))}
        />
    );
}

function KanbanDemo() {
    return (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start' }}>
            {DEMO_TASK_STATUSES.map((s) => (
                <div key={s.code} style={{ minWidth: 280, width: 280, background: '#fafafa', borderRadius: 8, padding: 8 }}>
                    <Space style={{ marginBottom: 8 }}>
                        <Tag color={s.color}>{s.name}</Tag>
                        <Badge count={byStatus(s.code).length} showZero color="#8c8c8c" />
                    </Space>
                    {byStatus(s.code).map((t) => (
                        <DemoCard key={t.id} task={t} density={s.isDoneState ? 'mini' : 'compact'} />
                    ))}
                </div>
            ))}
        </div>
    );
}

function CalendarDemo() {
    const cellRender = (date: dayjs.Dayjs) => {
        const ymd = date.format('YYYY-MM-DD');
        const tasks = DEMO_TASKS.filter((t) => t.periodStartDate <= ymd && ymd <= t.periodEndDate);
        if (tasks.length === 0) return null;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {tasks.slice(0, 3).map((t) => (
                    <Tooltip
                        key={t.id}
                        title={
                            <>
                                <div>{t.title}</div>
                                <div style={{ fontSize: 12, opacity: 0.8 }}>
                                    {PERIOD_TYPE_LABELS[t.periodType]} · {t.status?.name} · <TaskAssigneesView task={t} variant="text" />
                                </div>
                            </>
                        }
                    >
                        <Tag color={resolveEntityColor(t.color)} style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', borderRadius: 4, fontWeight: 500 }}>
                            {t.title}
                        </Tag>
                    </Tooltip>
                ))}
                {tasks.length > 3 && <Badge count={`+${tasks.length - 3}`} style={{ backgroundColor: '#f0f0f0', color: 'rgba(0,0,0,0.65)' }} />}
            </div>
        );
    };
    return (
        <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                Mỗi ô hiển thị Công việc có Kỳ hạn phủ ngày đó (việc Tuần/Tháng/Năm lặp ở mọi ngày trong kỳ).
            </Text>
            <Calendar value={dayjs(DEMO_TODAY)} onChange={noop} onPanelChange={noop} cellRender={(d, info) => (info.type === 'date' ? cellRender(d) : info.originNode)} />
        </div>
    );
}

const CHECKLIST_SAMPLE = [
    { id: 1, text: 'Lọc danh sách khách xem bảng giá tuần trước', done: true },
    { id: 2, text: 'Gọi lần 1 và ghi chú kết quả', done: true },
    { id: 3, text: 'Gửi tin Zalo cho khách chưa nghe máy', done: false },
    { id: 4, text: 'Hẹn lịch tư vấn với khách quan tâm', done: false },
    { id: 5, text: 'Cập nhật trạng thái khách trên hệ thống', done: false },
];

function ChecklistDemo() {
    const done = CHECKLIST_SAMPLE.filter((i) => i.done).length;
    const total = CHECKLIST_SAMPLE.length;
    const tone = getChecklistTone({ done, total });
    const color = { red: '#ff4d4f', gold: '#faad14', green: '#52c41a' }[tone];
    return (
        <div style={{ maxWidth: 460 }}>
            <Text strong>Checklist - Gọi lại 5 khách tiềm năng</Text>
            <Progress percent={Math.round((done / total) * 100)} strokeColor={color} format={() => `${done}/${total}`} />
            <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                {CHECKLIST_SAMPLE.map((i) => (
                    <Checkbox key={i.id} checked={i.done}>
                        <span style={i.done ? { textDecoration: 'line-through', color: '#8c8c8c' } : undefined}>{i.text}</span>
                    </Checkbox>
                ))}
            </Space>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                Màu thanh tiến độ: đỏ khi dưới một nửa, vàng từ một nửa, xanh khi xong đủ. (Bản rút gọn - modal Checklist thật còn thêm/sửa/xoá/sắp xếp mục.)
            </Text>
        </div>
    );
}

const AUDIT_SAMPLE = [
    { id: 1, action: 'status_changed', user: 'Sales An', at: '2026-10-05T09:12:40', changes: [{ field: 'status', from: 'To-Do', to: 'Đang làm' }] },
    { id: 2, action: 'locked', user: 'Admin', at: '2026-10-05T07:00:05', changes: [{ field: 'isLocked', from: 'Không', to: 'Có' }, { field: 'lockNote', from: '—', to: 'Đã chốt số liệu tháng 9' }] },
];

function AuditRowDemo() {
    return (
        <Collapse
            accordion
            defaultActiveKey={[1]}
            items={AUDIT_SAMPLE.map((log) => {
                const meta = PERIODIC_TASK_AUDIT_ACTION_META[log.action];
                return {
                    key: log.id,
                    label: (
                        <Space wrap>
                            <Tag color={meta?.color}>{meta?.label ?? log.action}</Tag>
                            <Space size={4}>
                                <Avatar size={18} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                                <Text strong style={{ fontSize: 13 }}>{log.user}</Text>
                            </Space>
                            <Text type="secondary" style={{ fontSize: 12 }}>{dayjs(log.at).format('HH:mm:ss DD/MM/YYYY')}</Text>
                        </Space>
                    ),
                    children: (
                        <Table
                            size="small"
                            pagination={false}
                            rowKey="field"
                            dataSource={log.changes}
                            columns={[
                                { title: 'Trường', key: 'f', render: (_v, c) => PERIODIC_TASK_FIELD_LABELS[c.field] ?? c.field },
                                { title: 'Trước', key: 'a', render: (_v, c) => <Text delete type="secondary">{c.from}</Text> },
                                { title: 'Sau', key: 'b', render: (_v, c) => <Text strong>{c.to}</Text> },
                            ]}
                        />
                    ),
                };
            })}
        />
    );
}

/** Một dòng trong danh sách "Khách hàng liên quan" / "Phụ trách phụ" của modal (bản tĩnh: nút xoá chỉ để xem). */
function DemoListRow({ title, description }: { title: ReactNode; description?: ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
                <div>{title}</div>
                {description}
            </div>
            <Button size="small" danger type="text" icon={<DeleteOutlined />} />
        </div>
    );
}

/**
 * Bản SAO tĩnh của modal "Tạo Công việc định kỳ mới" (form thật nằm trong `cong-viec-dinh-ky/page.tsx`, gắn chặt
 * với API/quyền nên không import trực tiếp). Chỉ dùng antd + component hiển thị thật (`PeriodTypeTag`); dữ liệu cứng, không lưu gì.
 * Modal thật KHÔNG có ô Checklist hay Công việc cha/con: 2 phần đó làm sau khi tạo, qua nút "Checklist" / "Liên kết" trên dòng việc.
 */
function TaskCreateModalDemo() {
    const statuses = DEMO_TASK_STATUSES;
    return (
        <div style={{ maxWidth: 640, margin: '0 auto', border: '1px solid #d9d9d9', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 16 }}>Tạo Công việc định kỳ mới</div>
            <div style={{ padding: 20 }}>
                <Form layout="vertical" requiredMark initialValues={{
                    title: 'Gọi lại 5 khách tiềm năng',
                    periodType: 'weekly',
                    periodRange: [dayjs('2026-10-05'), dayjs('2026-10-11')],
                    primary: 4,
                    color: '#1890ff',
                }}>
                    <Form.Item name="title" label="Tiêu đề" required>
                        <Input placeholder="Ví dụ: Gọi lại 5 khách tiềm năng" />
                    </Form.Item>
                    <Form.Item name="description" label="Mô tả">
                        <Input.TextArea rows={2} placeholder="Không bắt buộc" />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={10}>
                            <Form.Item name="periodType" label="Loại kỳ" required>
                                <Select options={(['daily', 'weekly', 'monthly', 'yearly'] as const).map((t) => ({ value: t, label: <PeriodTypeTag type={t} style={{ marginInlineEnd: 0 }} /> }))} />
                            </Form.Item>
                        </Col>
                        <Col span={14}>
                            <Form.Item name="periodRange" label="Khoảng thời gian của kỳ" required tooltip="Biên tuần/tháng/năm KHÔNG tự suy ra - bạn tự chọn đúng khoảng của kỳ này">
                                <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="primary" label="Người phụ trách chính" required>
                                <Select options={[1, 2, 3, 4, 5, 6, 8].map((id) => ({ value: id, label: demoUserName(id) }))} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="departmentId" label="Phòng ban" tooltip="Bỏ trống sẽ tự lấy theo phòng ban của người phụ trách chính lúc tạo - sửa tự do sau đó">
                                <Select allowClear placeholder="Tự động theo người phụ trách" options={Object.values(DEMO_TASK_DEPARTMENTS).map((d) => ({ value: d.id, label: <Tag color={d.color} style={{ marginInlineEnd: 0 }}>{d.name}</Tag> }))} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="statusId" label="Trạng thái" tooltip="Bỏ trống dùng mặc định 'To-Do'">
                                <Select allowClear placeholder="To-Do (mặc định)" options={statuses.map((s) => ({ value: s.id, label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag> }))} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="color" label="Màu Task" tooltip="Chỉ dùng hiển thị UI (Card/Kanban/Calendar...) - không ảnh hưởng nghiệp vụ">
                                <ColorPicker showText format="hex" disabledAlpha />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="note" label="Ghi chú">
                        <Input.TextArea rows={2} placeholder="Không bắt buộc" />
                    </Form.Item>
                    <Form.Item label="Khách hàng liên quan" tooltip='Không bắt buộc - có thể gắn/gỡ sau qua nút "Liên kết"'>
                        <DemoListRow title="Nguyễn Văn A" description={<Space size={4}><Text type="secondary" style={{ fontSize: 12 }}>090 123 ****</Text><Tag color="blue">Sales An</Tag></Space>} />
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <Select mode="multiple" style={{ flex: 1 }} placeholder="Tìm Khách hàng theo tên/SĐT để gắn (chọn nhiều được)" open={false} />
                            <Button type="primary" icon={<PlusOutlined />} disabled>Gán</Button>
                        </div>
                    </Form.Item>
                    <Form.Item label="Phụ trách phụ" tooltip="Người hỗ trợ thêm ngoài Phụ trách chính - không bắt buộc">
                        <DemoListRow title={demoUserName(5)} />
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <Select mode="multiple" style={{ flex: 1 }} placeholder="Chọn người để thêm làm Phụ trách phụ (chọn nhiều được)" open={false} />
                            <Button type="primary" icon={<PlusOutlined />} disabled>Gán</Button>
                        </div>
                    </Form.Item>
                </Form>
            </div>
            <div style={{ padding: '10px 20px', borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                <Space>
                    <Button>Hủy</Button>
                    <Button type="primary">OK</Button>
                </Space>
            </div>
        </div>
    );
}

/** Bản SAO tĩnh của modal "Liên kết & Tiến độ" (`TaskLinksModal`): % gộp từ việc con, việc cha, việc con. */
function TaskLinksDemo() {
    const month = DEMO_TASKS[2];
    const week = DEMO_TASKS[1];
    const children = [
        { t: week, tag: 'Tuần', status: DEMO_TASK_STATUSES[1] },
        { t: { ...DEMO_TASKS[5], title: 'Báo cáo doanh số tuần trước', color: '#faad14' }, tag: 'Tuần', status: DEMO_TASK_STATUSES[3] },
    ];
    return (
        <div style={{ maxWidth: 560, margin: '0 auto', border: '1px solid #d9d9d9', borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 16 }}>Liên kết &amp; Tiến độ - &quot;{month.title}&quot;</div>
            <div style={{ padding: 20 }}>
                <Text strong>Tiến độ (tính theo Công việc con TRỰC TIẾP):</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Progress percent={50} style={{ flex: 1 }} />
                    <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>1/2 việc con xong</Text>
                </div>
                <Divider style={{ margin: '16px 0 12px' }} />
                <Text strong>Công việc cha (1):</Text>
                <DemoListRow title={<TaskTitlePill title={DEMO_TASKS[3].title} color={DEMO_TASKS[3].color} maxLength={28} />} description={<Text type="secondary" style={{ fontSize: 11 }}>Năm</Text>} />
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <Select style={{ flex: 1 }} placeholder="Chọn Công việc cha để gán" open={false} />
                    <Button type="primary" icon={<PlusOutlined />} disabled>Gán</Button>
                </div>
                <Divider style={{ margin: '20px 0 12px' }} />
                <Text strong>Công việc con ({children.length}):</Text>
                {children.map(({ t, tag, status }) => (
                    <DemoListRow
                        key={t.id}
                        title={<TaskTitlePill title={t.title} color={t.color} maxLength={28} />}
                        description={<Space size={4}><Text type="secondary" style={{ fontSize: 11 }}>{tag}</Text><Tag color={status.color}>{status.name}</Tag></Space>}
                    />
                ))}
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <Select style={{ flex: 1 }} placeholder="Chọn Công việc con để gán" open={false} />
                    <Button type="primary" icon={<PlusOutlined />} disabled>Gán</Button>
                </div>
                <Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: 12 }}>
                    Việc cha phải có kỳ hạn lớn hơn việc con (ví dụ Tuần thuộc Tháng); liên kết vòng tròn bị chặn. (Bản rút gọn: modal thật còn phần Khách hàng liên quan và Phụ trách phụ.)
                </Text>
            </div>
        </div>
    );
}

const PERSONA_IDS = TASK_PERSONAS.map((p) => p.id);

/** Mẫu của module Công việc định kỳ (trang `/cong-viec-dinh-ky`). Thứ tự = thứ tự trong ô "Chèn mẫu minh hoạ". */
export const PERIODIC_TASK_DEMOS: GuideDemo[] = [
    {
        id: 'task-by-viewer',
        title: 'Danh sách Công việc theo người xem',
        description: 'Có bộ chọn "Xem với tư cách": đổi việc thấy, nút Thao tác và tab theo vai trò/quyền (tham số persona=...)',
        params: { persona: PERSONA_IDS },
        selfFramed: true,
        render: (p) => <TaskTableByViewer initialPersona={p.persona ?? 'admin'} switchable />,
    },
    {
        id: 'task-actions-by-viewer',
        title: 'Ma trận nút Thao tác theo người xem',
        description: 'Nút Sửa/Khoá/Mở khoá/Xoá/Khách hàng theo từng persona, kể cả việc đang khoá (tham số scenario=...)',
        params: { scenario: ['normal', 'locked-manual', 'locked-auto'] },
        selfFramed: true,
        render: (p) => <TaskActionsMatrix initialScenario={(p.scenario as Scenario) ?? 'normal'} />,
    },
    {
        id: 'task-kanban',
        title: 'Bảng Kanban (rút gọn)',
        description: 'Công việc theo cột Trạng thái; việc đã xong thu gọn (bản tĩnh, không kéo-thả)',
        render: () => <KanbanDemo />,
    },
    {
        id: 'task-calendar',
        title: 'Lịch tháng (rút gọn)',
        description: 'Mỗi ô là Công việc có Kỳ hạn phủ ngày đó; rê chuột vào tên để xem chi tiết (tháng 10/2026)',
        render: () => <CalendarDemo />,
    },
    {
        id: 'task-agenda',
        title: 'Xem theo Ngày (rút gọn)',
        description: 'Công việc gộp theo từng ngày, mặc định mở ngày hôm nay',
        render: () => <AgendaDemo />,
    },
    {
        id: 'period-type-tags',
        title: 'Tag Loại kỳ',
        description: 'Ngày / Tuần / Tháng / Năm - màu cố định, dùng đúng component thật',
        render: () => (
            <Space wrap>
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((t) => (
                    <PeriodTypeTag key={t} type={t} />
                ))}
            </Space>
        ),
    },
    {
        id: 'task-status-tags',
        title: 'Tag Trạng thái Công việc',
        description: 'Màu + tên Trạng thái (tên/màu mẫu - thật do Admin cấu hình ở "Quản lý Trạng thái")',
        render: () => (
            <Space wrap>
                {DEMO_TASK_STATUSES.map((s) => (
                    <Tag key={s.code} color={s.color}>
                        {s.name}
                    </Tag>
                ))}
            </Space>
        ),
    },
    {
        id: 'task-assignees',
        title: 'Phụ trách chính + phụ',
        description: 'Chỉ 1 người = card trơn; có Phụ trách phụ = Tag "Phụ trách chính" + card phụ (tối đa 2, còn lại +N)',
        render: () => (
            <Space orientation="vertical" size={12}>
                {[DEMO_TASKS[1], DEMO_TASKS[0], DEMO_TASKS[2]].map((t) => (
                    <div key={t.id}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{t.title}</Text>
                        <div><TaskAssigneesView task={t} /></div>
                    </div>
                ))}
            </Space>
        ),
    },
    {
        id: 'task-checklist',
        title: 'Checklist trong 1 Công việc',
        description: 'Danh sách mục con có thanh tiến độ đổi màu theo mức hoàn thành (bản rút gọn)',
        render: () => <ChecklistDemo />,
    },
    {
        id: 'task-create-modal',
        title: 'Modal Tạo Công việc',
        description: 'Form tạo Công việc định kỳ: Tiêu đề, Loại kỳ + khoảng thời gian, Phụ trách chính/phụ, Trạng thái, Màu, Khách hàng (bản tĩnh, không lưu)',
        render: () => <TaskCreateModalDemo />,
    },
    {
        id: 'task-links',
        title: 'Modal Liên kết & Tiến độ',
        description: 'Nối Công việc cha - con và xem % hoàn thành gộp từ việc con (bản rút gọn, không lưu)',
        render: () => <TaskLinksDemo />,
    },
    {
        id: 'task-audit-row',
        title: 'Dòng Lịch sử + so sánh trước/sau',
        description: 'Mỗi dòng: loại thay đổi, người làm, thời điểm; mở ra xem giá trị trước/sau (bản rút gọn)',
        render: () => <AuditRowDemo />,
    },
];
