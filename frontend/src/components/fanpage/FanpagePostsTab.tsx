'use client';

import { useState } from 'react';
import { App, Button, DatePicker, Empty, Form, Input, Modal, Popconfirm, Space, Table, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import type { FanpageFlags, FanpagePost } from '@/lib/api/fanpages.api';
import {
    useCreateFanpagePost,
    useDeleteFanpagePost,
    useFanpagePosts,
    useUpdateFanpagePost,
} from '@/lib/hooks/useFanpages';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface PostFormValues {
    url: string;
    title?: string;
    postedDate?: Dayjs | null;
    note?: string;
}

interface Props {
    fanpageId: number;
    flags: FanpageFlags;
}

export function FanpagePostsTab({ fanpageId, flags }: Props) {
    const { message } = App.useApp();
    const { posts, isLoading } = useFanpagePosts(fanpageId);
    const createMut = useCreateFanpagePost(fanpageId);
    const updateMut = useUpdateFanpagePost(fanpageId);
    const deleteMut = useDeleteFanpagePost(fanpageId);
    const [form] = Form.useForm<PostFormValues>();
    // null = đóng; 'new' = thêm mới; FanpagePost = đang sửa.
    const [editing, setEditing] = useState<FanpagePost | 'new' | null>(null);
    const saving = createMut.isPending || updateMut.isPending;

    const openNew = () => {
        form.resetFields();
        form.setFieldsValue({ postedDate: dayjs() });
        setEditing('new');
    };

    const openEdit = (post: FanpagePost) => {
        form.setFieldsValue({
            url: post.url,
            title: post.title ?? undefined,
            postedDate: post.postedDate ? dayjs(post.postedDate) : null,
            note: post.note ?? undefined,
        });
        setEditing(post);
    };

    const handleFinish = async (values: PostFormValues) => {
        const payload = {
            url: values.url.trim(),
            title: values.title?.trim() || null,
            postedDate: values.postedDate ? values.postedDate.format('YYYY-MM-DD') : null,
            note: values.note?.trim() || null,
        };
        try {
            if (editing && editing !== 'new') {
                await updateMut.mutateAsync({ postId: editing.id, data: payload });
                message.success('Đã cập nhật bài đăng');
            } else {
                await createMut.mutateAsync(payload);
                message.success('Đã thêm bài đăng');
            }
            setEditing(null);
        } catch (err) {
            toastApiError(message, err, 'Không thể lưu bài đăng');
        }
    };

    const handleDelete = async (post: FanpagePost) => {
        try {
            await deleteMut.mutateAsync(post.id);
            message.success('Đã xoá bài đăng');
        } catch (err) {
            toastApiError(message, err, 'Không thể xoá bài đăng');
        }
    };

    const columns: ColumnsType<FanpagePost> = [
        {
            title: 'Ngày đăng',
            dataIndex: 'postedDate',
            width: 110,
            render: (d: string | null) => (d ? dayjs(d).format('DD/MM/YYYY') : '—'),
        },
        {
            title: 'Bài đăng',
            key: 'post',
            render: (_: unknown, p) => (
                <Space orientation="vertical" size={0}>
                    {p.title && <Text strong>{p.title}</Text>}
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                        <LinkOutlined /> Mở bài đăng
                    </a>
                </Space>
            ),
        },
        {
            title: 'Ghi chú',
            dataIndex: 'note',
            ellipsis: true,
            render: (n: string | null) =>
                n ? (
                    <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{n}</span>}>
                        <span>{n}</span>
                    </Tooltip>
                ) : (
                    '—'
                ),
        },
        {
            title: 'Người ghi',
            key: 'by',
            width: 150,
            render: (_: unknown, p) => (
                <Tooltip title={`Tạo lúc ${dayjs(p.createdAt).format('HH:mm DD/MM/YYYY')}`}>
                    <span>{p.createdBy?.name ?? '—'}</span>
                </Tooltip>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 90,
            render: (_: unknown, p) => (
                <Space size="small">
                    {flags.canManagePosts && <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(p)} />}
                    {flags.canDeletePosts && (
                        <Popconfirm title="Xoá bài đăng này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelete(p)}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <Space orientation="vertical" style={{ width: '100%' }}>
            {flags.canManagePosts && (
                <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
                    Thêm bài đăng
                </Button>
            )}
            <Table<FanpagePost>
                rowKey="id"
                size="small"
                loading={isLoading}
                columns={columns}
                dataSource={posts}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                locale={{ emptyText: <Empty description="Chưa có bài đăng nào" /> }}
                scroll={{ x: 'max-content' }}
            />
            <Modal
                title={editing && editing !== 'new' ? 'Sửa bài đăng' : 'Thêm bài đăng'}
                open={editing !== null}
                onCancel={() => setEditing(null)}
                onOk={() => form.submit()}
                okText="Lưu"
                cancelText="Huỷ"
                confirmLoading={saving}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" onFinish={handleFinish}>
                    <Form.Item
                        name="url"
                        label="URL bài đăng"
                        rules={[
                            { required: true, whitespace: true, message: 'Nhập URL bài đăng' },
                            { type: 'url', message: 'URL phải bắt đầu bằng http:// hoặc https://' },
                            { max: 500, message: 'Tối đa 500 ký tự' },
                        ]}
                    >
                        <Input placeholder="https://facebook.com/ten-page/posts/..." />
                    </Form.Item>
                    <Form.Item name="title" label="Tiêu đề (tuỳ chọn)" rules={[{ max: 200, message: 'Tối đa 200 ký tự' }]}>
                        <Input placeholder="VD: Bài review tháng 11" />
                    </Form.Item>
                    <Form.Item name="postedDate" label="Ngày đăng">
                        <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="note" label="Ghi chú bài đăng (nếu có)" rules={[{ max: 5000, message: 'Tối đa 5000 ký tự' }]}>
                        <Input.TextArea rows={3} />
                    </Form.Item>
                </Form>
            </Modal>
        </Space>
    );
}
