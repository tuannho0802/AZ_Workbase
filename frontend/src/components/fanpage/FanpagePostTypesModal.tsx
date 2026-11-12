'use client';

import { App, Button, ColorPicker, Form, Input, Modal, Space, Switch, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Color } from 'antd/es/color-picker';
import type { FanpagePostType } from '@/lib/api/fanpages.api';
import {
    useCreateFanpagePostType,
    useFanpagePostTypes,
    useSetFanpagePostTypeActive,
    useUpdateFanpagePostType,
} from '@/lib/hooks/useFanpages';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
}

/** Quản lý danh mục "Loại bài" (E5a, mirror FanpageHealthModal). KHÔNG xoá - chỉ khoá (bài cũ vẫn giữ nguyên loại). */
export function FanpagePostTypesModal({ open, onClose }: Props) {
    const { message } = App.useApp();
    const { postTypes, isLoading } = useFanpagePostTypes(false, open);
    const createMut = useCreateFanpagePostType();
    const updateMut = useUpdateFanpagePostType();
    const activeMut = useSetFanpagePostTypeActive();
    const [form] = Form.useForm<{ name: string }>();

    const handleAdd = async (values: { name: string }) => {
        try {
            const nextOrder = postTypes.reduce((max, t) => Math.max(max, t.sortOrder), 0) + 1;
            await createMut.mutateAsync({ name: values.name.trim(), sortOrder: nextOrder });
            form.resetFields();
            message.success('Đã thêm loại bài');
        } catch (err) {
            toastApiError(message, err, 'Không thể thêm loại bài');
        }
    };

    const update = async (id: number, data: { name?: string; color?: string }) => {
        try {
            await updateMut.mutateAsync({ id, data });
        } catch (err) {
            toastApiError(message, err, 'Không thể cập nhật loại bài');
        }
    };

    const toggleLock = async (t: FanpagePostType, active: boolean) => {
        try {
            await activeMut.mutateAsync({ id: t.id, active });
            message.success(active ? 'Đã mở khoá loại bài' : 'Đã khoá loại bài');
        } catch (err) {
            toastApiError(message, err, 'Không thể đổi trạng thái loại bài');
        }
    };

    const columns: ColumnsType<FanpagePostType> = [
        {
            title: 'Tên',
            dataIndex: 'name',
            render: (name: string, t) => (
                <Text editable={{ onChange: (v) => v.trim() && v.trim() !== name && update(t.id, { name: v.trim() }), maxLength: 50 }}>{name}</Text>
            ),
        },
        {
            title: 'Màu',
            dataIndex: 'color',
            width: 90,
            render: (color: string, t) => (
                <ColorPicker
                    size="small"
                    value={color}
                    format="hex"
                    disabledAlpha
                    onChangeComplete={(c: Color) => {
                        const hex = c.toHexString();
                        if (hex.toLowerCase() !== color.toLowerCase()) update(t.id, { color: hex });
                    }}
                />
            ),
        },
        { title: 'Số bài', dataIndex: 'postCount', width: 80, align: 'right', render: (n?: number) => (n ?? 0).toLocaleString('vi-VN') },
        {
            title: 'Đang dùng',
            dataIndex: 'isLocked',
            width: 100,
            render: (locked: boolean, t) => (
                <Switch checked={!locked} loading={activeMut.isPending && activeMut.variables?.id === t.id} onChange={(v) => toggleLock(t, v)} />
            ),
        },
    ];

    return (
        <Modal title="Quản lý Loại bài" open={open} onCancel={onClose} footer={null} width={640} destroyOnHidden>
            <Space orientation="vertical" style={{ width: '100%' }}>
                <Form form={form} layout="inline" onFinish={handleAdd}>
                    <Form.Item name="name" rules={[{ required: true, whitespace: true, message: 'Nhập tên loại bài' }, { max: 50 }]}>
                        <Input placeholder="Tên loại bài mới (VD: Reels)" style={{ width: 260 }} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createMut.isPending}>
                        Thêm
                    </Button>
                </Form>
                <Table<FanpagePostType> rowKey="id" size="small" loading={isLoading} columns={columns} dataSource={postTypes} pagination={false} />
                <Text type="secondary">Khoá loại bài = không chọn được cho bài mới; bài đã gắn loại này vẫn hiện đúng tên. Không có chức năng xoá.</Text>
            </Space>
        </Modal>
    );
}
