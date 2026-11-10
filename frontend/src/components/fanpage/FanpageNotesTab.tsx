'use client';

import { useState } from 'react';
import { App, Button, Card, Empty, Input, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FanpageFlags } from '@/lib/api/fanpages.api';
import {
    useCreateFanpageNote,
    useDeleteFanpageNote,
    useFanpageNotes,
    useUpdateFanpageNote,
} from '@/lib/hooks/useFanpages';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;

interface Props {
    fanpageId: number;
    flags: FanpageFlags;
}

const fmt = (iso: string) => dayjs(iso).format('HH:mm DD/MM/YYYY');

/** Timeline ghi chú tiến trình phát triển Page (mới nhất trước) - mirror tab ghi chú của khách hàng. */
export function FanpageNotesTab({ fanpageId, flags }: Props) {
    const { message } = App.useApp();
    const { notes, isLoading } = useFanpageNotes(fanpageId);
    const createMut = useCreateFanpageNote(fanpageId);
    const updateMut = useUpdateFanpageNote(fanpageId);
    const deleteMut = useDeleteFanpageNote(fanpageId);
    const [draft, setDraft] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState('');

    const handleAdd = async () => {
        const text = draft.trim();
        if (!text || createMut.isPending) return;
        try {
            await createMut.mutateAsync(text);
            setDraft('');
            message.success('Đã thêm ghi chú');
        } catch (err) {
            toastApiError(message, err, 'Không thể thêm ghi chú');
        }
    };

    const handleSaveEdit = async (noteId: number) => {
        const text = editDraft.trim();
        if (!text || updateMut.isPending) return;
        try {
            await updateMut.mutateAsync({ noteId, note: text });
            setEditingId(null);
            message.success('Đã cập nhật ghi chú');
        } catch (err) {
            toastApiError(message, err, 'Không thể cập nhật ghi chú');
        }
    };

    const handleDelete = async (noteId: number) => {
        try {
            await deleteMut.mutateAsync(noteId);
            message.success('Đã xoá ghi chú');
        } catch (err) {
            toastApiError(message, err, 'Không thể xoá ghi chú');
        }
    };

    return (
        <Space orientation="vertical" style={{ width: '100%' }}>
            {flags.canManageNotes && (
                <Space orientation="vertical" style={{ width: '100%' }}>
                    <Input.TextArea
                        rows={3}
                        value={draft}
                        maxLength={5000}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Ghi lại tiến trình phát triển Page (số follow, thay đổi nội dung, kết quả chiến dịch...)"
                    />
                    <Button type="primary" loading={createMut.isPending} disabled={!draft.trim()} onClick={handleAdd}>
                        Thêm ghi chú
                    </Button>
                </Space>
            )}

            {isLoading ? (
                <Spin />
            ) : notes.length === 0 ? (
                <Empty description="Chưa có ghi chú nào" />
            ) : (
                notes.map((n) => (
                    <Card
                        key={n.id}
                        size="small"
                        extra={
                            <Space size="small">
                                {flags.canManageNotes && editingId !== n.id && (
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<EditOutlined />}
                                        onClick={() => {
                                            setEditingId(n.id);
                                            setEditDraft(n.note);
                                        }}
                                    />
                                )}
                                {flags.canDeleteNotes && (
                                    <Popconfirm title="Xoá ghi chú này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => handleDelete(n.id)}>
                                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                )}
                            </Space>
                        }
                        title={
                            <Space size="small" wrap>
                                <Text strong>{n.createdBy?.name ?? 'Không xác định'}</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {fmt(n.createdAt)}
                                </Text>
                                {n.editCount > 0 && (
                                    <Tag>
                                        Đã sửa {n.editCount} lần{n.updatedBy ? ` · ${n.updatedBy.name}, ${fmt(n.updatedAt)}` : ''}
                                    </Tag>
                                )}
                            </Space>
                        }
                    >
                        {editingId === n.id ? (
                            <Space orientation="vertical" style={{ width: '100%' }}>
                                <Input.TextArea rows={3} value={editDraft} maxLength={5000} onChange={(e) => setEditDraft(e.target.value)} />
                                <Space>
                                    <Button type="primary" size="small" loading={updateMut.isPending} disabled={!editDraft.trim()} onClick={() => handleSaveEdit(n.id)}>
                                        Lưu
                                    </Button>
                                    <Button size="small" onClick={() => setEditingId(null)}>
                                        Huỷ
                                    </Button>
                                </Space>
                            </Space>
                        ) : (
                            <span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span>
                        )}
                    </Card>
                ))
            )}
        </Space>
    );
}