'use client';

import { App, Button, ColorPicker, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Color } from 'antd/es/color-picker';
import type { FanpageHealthStatus } from '@/lib/api/fanpages.api';
import {
    useCreateFanpageHealthStatus,
    useFanpageHealthStatuses,
    useSetFanpageHealthStatusActive,
    useUpdateFanpageHealthStatus,
} from '@/lib/hooks/useFanpages';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
}

/** Quản lý danh mục "Tình trạng Page" (mirror FanpagePlatformsModal). KHÔNG xoá; dòng mặc định không khoá được. */
export function FanpageHealthModal({ open, onClose }: Props) {
    const { message } = App.useApp();
    const { statuses, isLoading } = useFanpageHealthStatuses(false, open);
    const createMut = useCreateFanpageHealthStatus();
    const updateMut = useUpdateFanpageHealthStatus();
    const activeMut = useSetFanpageHealthStatusActive();
    const [form] = Form.useForm<{ name: string }>();

    const handleAdd = async (values: { name: string }) => {
        try {
            const nextOrder = statuses.reduce((max, s) => Math.max(max, s.sortOrder), 0) + 1;
            await createMut.mutateAsync({ name: values.name.trim(), sortOrder: nextOrder });
            form.resetFields();
            message.success('Đã thêm tình trạng');
        } catch (err) {
            toastApiError(message, err, 'Không thể thêm tình trạng');
        }
    };

    const update = async (id: number, data: { name?: string; color?: string; isBlocking?: boolean }) => {
        try {
            await updateMut.mutateAsync({ id, data });
        } catch (err) {
            toastApiError(message, err, 'Không thể cập nhật tình trạng');
        }
    };

    const toggleLock = async (s: FanpageHealthStatus, active: boolean) => {
        try {
            await activeMut.mutateAsync({ id: s.id, active });
            message.success(active ? 'Đã mở khoá tình trạng' : 'Đã khoá tình trạng');
        } catch (err) {
            toastApiError(message, err, 'Không thể đổi trạng thái tình trạng');
        }
    };

    const columns: ColumnsType<FanpageHealthStatus> = [
        {
            title: 'Tên',
            dataIndex: 'name',
            render: (name: string, s) => (
                <Space>
                    <Text editable={{ onChange: (v) => v.trim() && v.trim() !== name && update(s.id, { name: v.trim() }), maxLength: 50 }}>{name}</Text>
                    {s.isDefault && <Tag>Mặc định</Tag>}
                </Space>
            ),
        },
        {
            title: 'Màu',
            dataIndex: 'color',
            width: 90,
            render: (color: string, s) => (
                <ColorPicker
                    size="small"
                    value={color}
                    format="hex"
                    disabledAlpha
                    onChangeComplete={(c: Color) => {
                        const hex = c.toHexString();
                        if (hex.toLowerCase() !== color.toLowerCase()) update(s.id, { color: hex });
                    }}
                />
            ),
        },
        {
            title: 'Ngưng hoạt động',
            dataIndex: 'isBlocking',
            width: 130,
            render: (v: boolean, s) => <Switch size="small" checked={v} disabled={s.isDefault} onChange={(checked) => update(s.id, { isBlocking: checked })} />,
        },
        {
            title: 'Đang dùng',
            dataIndex: 'isLocked',
            width: 100,
            render: (locked: boolean, s) => (
                <Switch
                    checked={!locked}
                    disabled={s.isDefault}
                    loading={activeMut.isPending && activeMut.variables?.id === s.id}
                    onChange={(v) => toggleLock(s, v)}
                />
            ),
        },
    ];

    return (
        <Modal title="Quản lý Tình trạng Page" open={open} onCancel={onClose} footer={null} width={680} destroyOnHidden>
            <Space orientation="vertical" style={{ width: '100%' }}>
                <Form form={form} layout="inline" onFinish={handleAdd}>
                    <Form.Item name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên tình trạng' }, { max: 50 }]}>
                        <Input placeholder="Tên tình trạng mới" style={{ width: 240 }} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createMut.isPending}>
                        Thêm
                    </Button>
                </Form>
                <Table<FanpageHealthStatus> rowKey="id" size="small" loading={isLoading} columns={columns} dataSource={statuses} pagination={false} />
                <Text type="secondary">
                    &quot;Ngưng hoạt động&quot; = Page ở tình trạng này không tính vào KPI và không bị nhắc đăng bài (VD: Bị khoá, Đã bỏ). Khoá tình trạng = không
                    chọn được cho Page; Page cũ vẫn giữ nguyên.
                </Text>
            </Space>
        </Modal>
    );
}