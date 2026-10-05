'use client';

import { useState } from 'react';
import { Alert, Button, Form, Input, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, CloseCircleOutlined, UserAddOutlined } from '@ant-design/icons';
import { DemoFrame } from '../demo-kit/DemoFrame';
import { DEMO_PEOPLE } from '../demo-kit/personas';
import { DEMO_CUSTOMERS, type DemoCustomer } from '../demo-kit/sample-customers';
import { canAssignCustomer, computeShareablePool, previewAssignOutcome, type AssignCaller, type AssignScope } from '../demo-kit/compute-assign';
import type { GuideDemo } from '../guide-demo.types';

const { Text } = Typography;

const SCOPES: { value: AssignScope; label: string; caller: AssignCaller; note: string }[] = [
    {
        value: 'all',
        label: 'Tất cả',
        caller: { userId: DEMO_PEOPLE.admin.id, scope: 'all', managedDepartmentIds: [] },
        note: 'Phạm vi "Tất cả" (Admin luôn như vậy): chia được mọi khách hàng.',
    },
    {
        value: 'department',
        label: 'Phòng ban',
        caller: { userId: DEMO_PEOPLE.manager.id, scope: 'department', managedDepartmentIds: [1] },
        note: 'Phạm vi "Phòng ban" (ví dụ Quản lý Nam, quản lý Kinh doanh 1): CHỈ khách thuộc phòng ban mình quản lý, không cộng khách riêng của mình.',
    },
    {
        value: 'own',
        label: 'Của tôi',
        caller: { userId: DEMO_PEOPLE.salesA.id, scope: 'own', managedDepartmentIds: [] },
        note: 'Phạm vi "Của tôi" (ví dụ Sales An): chỉ khách mình đang là Sales chính, hoặc khách mình tạo mà chưa ai nhận. Sales phụ không chia lại được.',
    },
];

function salesCell(c: DemoCustomer) {
    return c.salesUser ? <Tag color="blue">{c.salesUser.name}</Tag> : <Text type="secondary">Chưa có Sales chính</Text>;
}

/** Mẫu "ai chia được khách nào" theo phạm vi quyền Chia data (customers.assign). */
export function AssignRulesByScope({ initialScope }: { initialScope: AssignScope }) {
    const [scope, setScope] = useState<AssignScope>(initialScope);
    const cfg = SCOPES.find((s) => s.value === scope) ?? SCOPES[0];
    const pool = new Set(computeShareablePool(DEMO_CUSTOMERS, cfg.caller).map((c) => c.id));

    const columns: ColumnsType<DemoCustomer> = [
        { title: 'Khách hàng', key: 'name', width: 150, render: (_v, r) => <Text strong style={{ color: '#1890ff' }}>{r.name}</Text> },
        { title: 'Sales Phụ trách chính', key: 'sales', width: 170, render: (_v, r) => salesCell(r) },
        {
            title: 'Tab',
            key: 'tab',
            width: 120,
            render: (_v, r) => (pool.has(r.id) ? <Tag color="gold">Có thể chia</Tag> : r.salesUser ? <Tag color="green">Đã assign</Tag> : <Text type="secondary">Không hiện</Text>),
        },
        {
            title: 'Bạn chia được?',
            key: 'can',
            width: 130,
            align: 'center',
            render: (_v, r) =>
                canAssignCustomer(r, cfg.caller) ? (
                    <Text style={{ color: '#52c41a' }}><CheckCircleOutlined /> Được</Text>
                ) : (
                    <Text type="secondary"><CloseCircleOutlined /> Không</Text>
                ),
        },
    ];

    return (
        <DemoFrame
            title={`Ai chia được khách nào - phạm vi "${cfg.label}"`}
            controls={
                <Space size={8} wrap>
                    <Text type="secondary">Phạm vi quyền Chia data:</Text>
                    <Segmented size="small" value={scope} onChange={(v) => setScope(v as AssignScope)} options={SCOPES.map((s) => ({ value: s.value, label: s.label }))} />
                </Space>
            }
        >
            <Table<DemoCustomer> size="small" rowKey="id" columns={columns} dataSource={DEMO_CUSTOMERS} pagination={false} scroll={{ x: 'max-content' }} />
            <Alert type="info" showIcon style={{ marginTop: 8 }} title={cfg.note} />
        </DemoFrame>
    );
}

const NEW_PEOPLE = [DEMO_PEOPLE.salesB, DEMO_PEOPLE.salesD];

/** Mẫu luồng chia: chọn khách -> chọn Sales -> kết quả Chính/Phụ. */
export function AssignFlowDemo() {
    const chua = DEMO_CUSTOMERS[1]; // chưa có Sales chính
    const co = DEMO_CUSTOMERS[2]; // đã có Sales chính (Bình)
    const rows = [
        { c: chua, out: previewAssignOutcome(chua, NEW_PEOPLE) },
        { c: co, out: previewAssignOutcome(co, [DEMO_PEOPLE.salesD]) },
    ];
    return (
        <Space orientation="vertical" style={{ width: '100%' }}>
            <div>
                <Text strong>1. Tick chọn khách → bấm </Text>
                <Button size="small" type="primary" icon={<UserAddOutlined />} disabled>Chia 2 khách →</Button>
            </div>
            <div>
                <Text strong>2. Chọn Sales nhận data: </Text>
                <Select
                    mode="multiple"
                    disabled
                    style={{ minWidth: 280 }}
                    value={[DEMO_PEOPLE.salesB.id, DEMO_PEOPLE.salesD.id]}
                    options={[DEMO_PEOPLE.salesB, DEMO_PEOPLE.salesD].map((p) => ({ value: p.id, label: p.name }))}
                />
            </div>
            <Text strong>3. Kết quả (ví dụ chọn Bình rồi Dũng; mỗi khách được gán cho TẤT CẢ người chọn):</Text>
            <Table
                size="small"
                rowKey={(r) => r.c.id}
                pagination={false}
                dataSource={rows}
                scroll={{ x: 'max-content' }}
                columns={[
                    { title: 'Khách hàng', key: 'n', render: (_v, r) => <Text strong>{r.c.name}</Text> },
                    {
                        title: 'Trước khi chia',
                        key: 'b',
                        render: (_v, r) => salesCell(r.c),
                    },
                    {
                        title: 'Sau khi chia',
                        key: 'a',
                        render: (_v, r) => (
                            <Space size={[0, 4]} wrap>
                                {r.out.primary && <Tag color="blue">{r.out.primary.name}</Tag>}
                                {r.out.shared.length > 0 && (
                                    <Tooltip title={`Sales được chia: ${r.out.shared.map((s) => s.name).join(', ')}`}>
                                        <Tag color="cyan">+{r.out.shared.length}</Tag>
                                    </Tooltip>
                                )}
                            </Space>
                        ),
                    },
                ]}
            />
        </Space>
    );
}

const SAMPLE_GROUP_USERS = [
    { name: 'Sales An', dept: 'Kinh doanh 1', deptColor: 'blue', pos: 'Sale', posColor: 'geekblue' },
    { name: 'Sales Bình', dept: 'Kinh doanh 1', deptColor: 'blue', pos: 'Sale', posColor: 'geekblue' },
    { name: 'Sales Dũng', dept: 'Kinh doanh 2', deptColor: 'cyan', pos: 'Trưởng nhóm', posColor: 'purple' },
    { name: 'Marketing Mai', dept: 'Marketing', deptColor: 'magenta', pos: 'Media', posColor: 'orange' },
];

/** Mẫu: cấu hình nhóm phụ trách → danh sách người hiện trong dropdown. */
export function AssignmentGroupPickerDemo() {
    const [depts, setDepts] = useState<string[]>(['Kinh doanh 1', 'Kinh doanh 2']);
    const [positions, setPositions] = useState<string[]>([]);
    const shown = SAMPLE_GROUP_USERS.filter((u) => depts.includes(u.dept) && (positions.length === 0 || positions.includes(u.pos)));
    return (
        <DemoFrame title='Nhóm "Sales phụ trách" quyết định ai hiện trong dropdown'>
            <Space orientation="vertical" style={{ width: '100%' }}>
                <div>
                    <Text strong>Phòng ban (bắt buộc ≥ 1): </Text>
                    <Select mode="multiple" size="small" style={{ minWidth: 300 }} value={depts} onChange={setDepts} options={['Kinh doanh 1', 'Kinh doanh 2', 'Marketing'].map((d) => ({ value: d, label: d }))} />
                </div>
                <div>
                    <Text strong>Vị trí (tuỳ chọn): </Text>
                    <Select mode="multiple" size="small" allowClear placeholder="Không lọc theo vị trí" style={{ minWidth: 300 }} value={positions} onChange={setPositions} options={['Sale', 'Trưởng nhóm', 'Media'].map((d) => ({ value: d, label: d }))} />
                </div>
                <Text strong>Dropdown "Chọn Sales nhận data" sẽ hiện:</Text>
                {depts.length === 0 ? (
                    <Tag color="red">Chưa cấu hình - dropdown sẽ rỗng</Tag>
                ) : shown.length === 0 ? (
                    <Text type="secondary">Không có nhân viên nào khớp</Text>
                ) : (
                    <Space orientation="vertical" size={4}>
                        {shown.map((u) => (
                            <Space key={u.name} size={4}>
                                <span>{u.name}</span>
                                <Tag color={u.deptColor} style={{ margin: 0 }}>{u.dept}</Tag>
                                <Tag color={u.posColor} style={{ margin: 0 }}>{u.pos}</Tag>
                            </Space>
                        ))}
                    </Space>
                )}
            </Space>
        </DemoFrame>
    );
}

/** Mẫu form "Thêm nhóm phụ trách" (rút gọn: khớp nhãn form thật). */
export function AssignmentGroupFormDemo() {
    return (
        <Form layout="vertical" disabled style={{ maxWidth: 480 }}>
            <Form.Item label="Key" extra="Chỉ chữ thường, số và dấu gạch dưới. KHÔNG đổi được sau khi tạo.">
                <Input placeholder="Ví dụ: content_staff" />
            </Form.Item>
            <Form.Item label="Tên hiển thị">
                <Input placeholder="Ví dụ: Nhân viên Content" />
            </Form.Item>
            <Form.Item label="Phòng ban (bắt buộc chọn ít nhất 1)">
                <Select mode="multiple" placeholder="Chọn 1 hoặc nhiều phòng ban" />
            </Form.Item>
            <Form.Item label="Vị trí (tuỳ chọn - để trống = không lọc theo vị trí)">
                <Select mode="multiple" placeholder="Không lọc theo vị trí" />
            </Form.Item>
            <Form.Item label="Mô tả (tuỳ chọn)">
                <Input.TextArea rows={2} placeholder="Mô tả ngắn về nhóm phụ trách này" />
            </Form.Item>
        </Form>
    );
}

/** Mẫu của nhóm trang "Chia data" + "Quản lý phụ trách". */
export const ASSIGNMENT_DEMOS: GuideDemo[] = [
    {
        id: 'assign-rules-by-scope',
        title: 'Ai chia được khách nào (theo phạm vi quyền)',
        description: 'Bộ chọn phạm vi Tất cả / Phòng ban / Của tôi: đổi khách chia được và khách hiện ở tab "Có thể chia" (tham số scope=...)',
        params: { scope: ['all', 'department', 'own'] },
        selfFramed: true,
        render: (p) => <AssignRulesByScope initialScope={(p.scope as AssignScope) ?? 'all'} />,
    },
    {
        id: 'assign-flow',
        title: 'Luồng chia data: chọn khách → chọn Sales → Chính/Phụ',
        description: 'Người ĐẦU TIÊN trong danh sách chọn thành Sales chính nếu khách chưa có; còn lại là Sales phụ (+N)',
        render: () => <AssignFlowDemo />,
    },
    {
        id: 'assignment-group-picker',
        title: 'Nhóm phụ trách → danh sách trong dropdown',
        description: 'Đổi Phòng ban / Vị trí của nhóm "Sales phụ trách" và xem ai hiện trong ô "Chọn Sales nhận data"',
        render: () => <AssignmentGroupPickerDemo />,
    },
    {
        id: 'assignment-group-form',
        title: 'Form thêm nhóm phụ trách',
        description: 'Các ô của form "Thêm nhóm phụ trách mới" (Key, Tên hiển thị, Phòng ban, Vị trí, Mô tả)',
        render: () => <AssignmentGroupFormDemo />,
    },
];
