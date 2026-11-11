'use client';

import { App, Button, ColorPicker, Form, Input, Modal, Space, Switch, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Color } from 'antd/es/color-picker';
import type { FanpagePlatform } from '@/lib/api/fanpages.api';
import {
    useCreateFanpagePlatform,
    useFanpagePlatforms,
    useSetFanpagePlatformActive,
    useUpdateFanpagePlatform,
} from '@/lib/hooks/useFanpages';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
}

/** Quản lý danh mục nền tảng (thêm / đổi tên / đổi màu / khoá-mở). KHÔNG xoá - Page cũ vẫn tham chiếu. */
export function FanpagePlatformsModal({ open, onClose }: Props) {
    const { message } = App.useApp();
    const { platforms, isLoading } = useFanpagePlatforms(false, open);
    const createMut = useCreateFanpagePlatform();
    const updateMut = useUpdateFanpagePlatform();
    const activeMut = useSetFanpagePlatformActive();
    const [form] = Form.useForm<{ name: string }>();

    const handleAdd = async (values: { name: string }) => {
        try {
            const nextOrder = platforms.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 1;
            await createMut.mutateAsync({ name: values.name.trim(), sortOrder: nextOrder });
            form.resetFields();
            message.success('Đã thêm nền tảng');
        } catch (err) {
            toastApiError(message, err, 'Không thể thêm nền tảng');
        }
    };

    const update = async (id: number, data: { name?: string; color?: string; urlDomains?: string | null }) => {
        try {
            await updateMut.mutateAsync({ id, data });
        } catch (err) {
            toastApiError(message, err, 'Không thể cập nhật nền tảng');
        }
    };

    const toggle = async (p: FanpagePlatform, active: boolean) => {
        try {
            await activeMut.mutateAsync({ id: p.id, active });
            message.success(active ? 'Đã mở khoá nền tảng' : 'Đã khoá nền tảng');
        } catch (err) {
            toastApiError(message, err, 'Không thể đổi trạng thái nền tảng');
        }
    };

    const columns: ColumnsType<FanpagePlatform> = [
        {
            title: 'Tên',
            dataIndex: 'name',
            render: (name: string, p) => (
                <Text editable={{ onChange: (v) => v.trim() && v.trim() !== name && update(p.id, { name: v.trim() }), maxLength: 50 }}>
                    {name}
                </Text>
            ),
        },
        {
            title: 'Màu',
            dataIndex: 'color',
            width: 110,
            render: (color: string, p) => (
                <ColorPicker
                    size="small"
                    value={color}
                    format="hex"
                    disabledAlpha
                    onChangeComplete={(c: Color) => {
                        const hex = c.toHexString();
                        if (hex.toLowerCase() !== color.toLowerCase()) update(p.id, { color: hex });
                    }}
                />
            ),
        },
        {
            title: 'Domain tự nhận',
            dataIndex: 'urlDomains',
            width: 190,
            render: (domains: string | null | undefined, p) => (
                <Text
                    type={domains ? undefined : 'secondary'}
                    editable={{
                        text: domains ?? '',
                        tooltip: 'Domain cách nhau bằng dấu phẩy, VD: facebook.com,fb.com',
                        maxLength: 255,
                        onChange: (v) => (v.trim() !== (domains ?? '') ? update(p.id, { urlDomains: v.trim() }) : undefined),
                    }}
                >
                    {domains || 'Chưa khai báo'}
                </Text>
            ),
        },
        { title: 'Số Page', dataIndex: 'fanpageCount', width: 90, align: 'right', render: (n?: number) => n ?? 0 },
        {
            title: 'Đang dùng',
            dataIndex: 'isActive',
            width: 110,
            render: (active: boolean, p) => (
                <Switch checked={active} loading={activeMut.isPending && activeMut.variables?.id === p.id} onChange={(v) => toggle(p, v)} />
            ),
        },
    ];

    return (
        <Modal title="Quản lý nền tảng Fanpage" open={open} onCancel={onClose} footer={null} width={820} destroyOnHidden>
            <Space orientation="vertical" style={{ width: '100%' }}>
                <Form form={form} layout="inline" onFinish={handleAdd}>
                    <Form.Item name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên nền tảng' }, { max: 50 }]}>
                        <Input placeholder="Tên nền tảng mới" style={{ width: 240 }} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createMut.isPending}>
                        Thêm
                    </Button>
                </Form>
                <Table<FanpagePlatform> rowKey="id" size="small" loading={isLoading} columns={columns} dataSource={platforms} pagination={false} />
                <Text type="secondary">
                    Khoá nền tảng = không chọn được cho Page mới; Page cũ vẫn giữ nguyên. Khai báo domain để form Page tự chọn nền tảng khi dán link
                    (domain trùng nhiều nền tảng thì không tự chọn).
                </Text>
            </Space>
        </Modal>
    );
}