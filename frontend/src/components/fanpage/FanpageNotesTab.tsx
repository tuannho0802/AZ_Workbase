'use client';

import { useState } from 'react';
import { App, Button, Card, Collapse, Empty, Form, Input, Popconfirm, Space, Spin, Tag, Typography } from 'antd';
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
import { buildLeadPayload } from '@/lib/utils/fanpageLead';
import { FanpageLeadFields, useLeadDuplicateCheck } from './FanpageLeadFields';

const { Text } = Typography;

interface Props {
    fanpageId: number;
    flags: FanpageFlags;
    /** GĐ5b: mục "Thêm khách hàng từ ghi chú này" chỉ hiện khi `can('customers.create')` (Drawer truyền) VÀ Page chưa lưu trữ. */
    canCreateLead?: boolean;
    archived?: boolean;
    platformName?: string;
}

const fmt = (iso: string) => dayjs(iso).format('HH:mm DD/MM/YYYY');

/** Timeline ghi chú tiến trình phát triển Page (mới nhất trước) - mirror tab ghi chú của khách hàng. */
export function FanpageNotesTab({ fanpageId, flags, canCreateLead = false, archived = false, platformName }: Props) {
    const { message } = App.useApp();
    const { notes, isLoading } = useFanpageNotes(fanpageId);
    const createMut = useCreateFanpageNote(fanpageId);
    const updateMut = useUpdateFanpageNote(fanpageId);
    const deleteMut = useDeleteFanpageNote(fanpageId);
    const [draft, setDraft] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editDraft, setEditDraft] = useState('');
    const [leadOpen, setLeadOpen] = useState(false);
    const [leadForm] = Form.useForm();
    const confirmNotDuplicate = useLeadDuplicateCheck();
    const showLead = flags.canManageNotes && canCreateLead && !archived;

    const handleAdd = async () => {
        const text = draft.trim();
        if (!text || createMut.isPending) return;
        try {
            let lead: ReturnType<typeof buildLeadPayload> | undefined;
            if (showLead && leadOpen) {
                lead = buildLeadPayload(await leadForm.validateFields());
                // Trùng SĐT -> KHÔNG lưu ghi chú cho tới khi người dùng sửa/bỏ phần thêm khách (15.5).
                if (!(await confirmNotDuplicate(lead.phone, lead.email))) return;
            }
            await createMut.mutateAsync({ note: text, lead });
            setDraft('');
            if (lead) {
                leadForm.resetFields();
                setLeadOpen(false);
            }
            message.success(lead ? 'Đã thêm ghi chú và khách hàng' : 'Đã thêm ghi chú');
        } catch (err) {
            if ((err as { errorFields?: unknown })?.errorFields) return; // lỗi validate form (đã hiện dưới từng ô)
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
                    {showLead && (
                        <Collapse
                            size="small"
                            activeKey={leadOpen ? ['lead'] : []}
                            onChange={(keys) => setLeadOpen((Array.isArray(keys) ? keys : [keys]).includes('lead'))}
                            items={[
                                {
                                    key: 'lead',
                                    label: '＋ Thêm khách hàng từ ghi chú này',
                                    children: (
                                        <Form form={leadForm} layout="vertical" preserve>
                                            <FanpageLeadFields platformName={platformName} />
                                        </Form>
                                    ),
                                },
                            ]}
                        />
                    )}
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
                                {n.leadCustomerId != null && <Tag color="purple">Đã tạo khách</Tag>}
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