'use client';

import { Alert, Button, Input, Radio, Select, Space, Table, Tag, Typography } from 'antd';
import type { GuideDemo } from '../guide-demo.types';

const { TextArea } = Input;
const { Text } = Typography;

type ComposeViewer = 'admin' | 'manager';
type ComposeState = 'draft' | 'previewed';

/**
 * Mẫu form "Soạn & gửi thông báo" (chữ khớp `BroadcastComposeFields` + `useBroadcastCompose`, dựng tĩnh vì bản thật gọi API).
 * `viewer=admin` (phạm vi gửi "Toàn bộ"): có đủ 3 nút người nhận; `viewer=manager` (phạm vi "Phòng ban"): KHÔNG có "Toàn bộ nhân viên".
 * `state=previewed`: đã bấm "Xem trước người nhận" -> nút Gửi bật và ghi rõ số người.
 */
function BroadcastComposeDemo({ viewer, state }: { viewer: ComposeViewer; state: ComposeState }) {
    const previewed = state === 'previewed';
    return (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, background: '#fff', maxWidth: 620 }}>
            <div style={{ padding: '14px 24px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>Soạn & gửi thông báo</div>
            <div style={{ padding: '16px 24px' }}>
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    title="Không đưa SĐT/email/số tiền của khách hàng vào nội dung. Người nhận được chốt tại thời điểm gửi."
                />
                <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 4 }}>Tiêu đề</div>
                    <Input readOnly value="Thông báo lịch nghỉ lễ" suffix={<Text type="secondary" style={{ fontSize: 12 }}>22 / 200</Text>} />
                </div>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 4 }}>Nội dung</div>
                    <TextArea readOnly rows={3} value="Công ty nghỉ lễ từ 30/10 đến 02/11. Vui lòng bàn giao công việc trước ngày nghỉ." />
                </div>
                <div style={{ marginBottom: 8 }}>Người nhận</div>
                <Radio.Group value="DEPARTMENTS" style={{ marginBottom: 12 }}>
                    <Radio.Button value="USERS">Chọn người nhận</Radio.Button>
                    <Radio.Button value="DEPARTMENTS">Theo phòng ban</Radio.Button>
                    {viewer === 'admin' && <Radio.Button value="ALL">Toàn bộ nhân viên</Radio.Button>}
                </Radio.Group>
                <Select
                    mode="multiple"
                    style={{ width: '100%', marginBottom: 12 }}
                    open={false}
                    value={['Kinh doanh 1']}
                    options={[{ value: 'Kinh doanh 1', label: 'Kinh doanh 1' }]}
                />
                <a style={{ fontWeight: 500 }}>Xem trước người nhận</a>
                {previewed && (
                    <Alert
                        style={{ marginTop: 12 }}
                        type="success"
                        showIcon
                        title="Sẽ gửi tới 12 người (ví dụ: Nguyễn An, Trần Bình, Lê Cường…) - đã loại 1 người không hợp lệ"
                    />
                )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 16px', borderTop: '1px solid #f0f0f0' }}>
                <Button>Huỷ</Button>
                <Button type="primary" disabled={!previewed}>{previewed ? 'Gửi tới 12 người' : 'Gửi'}</Button>
            </div>
        </div>
    );
}


/** Quy tắc người nhận theo phạm vi gửi (đúng `BroadcastAudienceResolver`). */
function BroadcastAudienceRulesDemo() {
    const rows: { key: string; choice: string; admin: string; manager: string }[] = [
        { key: 'users', choice: 'Chọn người nhận', admin: 'Bất kỳ nhân viên nào', manager: 'Chỉ nhân viên thuộc phòng ban bạn quản lý' },
        { key: 'depts', choice: 'Theo phòng ban', admin: 'Bất kỳ phòng ban nào', manager: 'Chỉ phòng ban bạn quản lý' },
        { key: 'all', choice: 'Toàn bộ nhân viên', admin: 'Có (mọi nhân viên đang hoạt động)', manager: 'Không có lựa chọn này' },
    ];
    return (
        <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={rows}
            columns={[
                { title: 'Kiểu người nhận', dataIndex: 'choice', key: 'choice', render: (v: string) => <Text strong>{v}</Text> },
                { title: <Tag color="red">Phạm vi gửi: Toàn bộ</Tag>, dataIndex: 'admin', key: 'admin' },
                { title: <Tag color="blue">Phạm vi gửi: Phòng ban</Tag>, dataIndex: 'manager', key: 'manager' },
            ]}
        />
    );
}

export const BROADCAST_DEMOS: GuideDemo[] = [
    {
        id: 'broadcast-compose',
        title: 'Form Soạn & gửi thông báo',
        description: 'viewer=admin (có "Toàn bộ nhân viên") hoặc viewer=manager (không có); state=draft (chưa xem trước, nút Gửi tắt) hoặc state=previewed',
        params: { viewer: ['admin', 'manager'], state: ['draft', 'previewed'] },
        render: (p) => <BroadcastComposeDemo viewer={p.viewer === 'manager' ? 'manager' : 'admin'} state={p.state === 'previewed' ? 'previewed' : 'draft'} />,
    },
    {
        id: 'broadcast-audience-rules',
        title: 'Ai được chọn làm người nhận',
        description: 'Bảng quy tắc người nhận theo phạm vi gửi Toàn bộ / Phòng ban',
        render: () => <BroadcastAudienceRulesDemo />,
    },
];
