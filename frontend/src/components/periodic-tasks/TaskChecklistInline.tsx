'use client';

import { useState } from 'react';
import { App, Button, Checkbox, Empty, Input, Popconfirm, Progress, Space, Spin, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
    useAddTaskChecklistItem,
    useUpdateTaskChecklistItem,
    useRemoveTaskChecklistItem,
    useTaskChecklistPage,
} from '@/lib/hooks/usePeriodicTaskChecklistItems';
import { PeriodicTaskChecklistItem } from '@/lib/api/periodic-tasks.api';
import { CHECKLIST_PAGE_SIZE } from '@/lib/api/periodic-task-checklist-items.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { LinkifiedText } from '@/components/common/LinkifiedText';

const { Text } = Typography;

interface Props {
    taskId: number;
    /** Đã gộp sẵn `periodic_tasks.edit` + khoá (mirror `canEdit` ở `TaskChecklistModal`). */
    canEdit: boolean;
    /** Mở `TaskChecklistModal` đầy đủ (xem hết trang, sắp xếp lại, Task con liên kết). */
    onOpenFull: () => void;
}

/**
 * TaskChecklistInline - bản RÚT GỌN của `TaskChecklistModal` (yêu cầu chủ dự
 * án 2026-09-25: Drawer "Hiệu suất công việc" cần hiển thị LUÔN checklist,
 * thao tác nhanh được, không phải mở Modal riêng mới thấy).
 *
 * CHỈ khác Modal gốc ở:
 *  - Luôn hiện SẴN (không đóng/mở), chỉ tải TRANG 1 (`CHECKLIST_PAGE_SIZE` =
 *    10) - nếu còn nữa (`total > 10`) hoặc muốn sắp xếp lại/xem "Task con
 *    liên kết", có link "Xem đầy đủ" mở `TaskChecklistModal` thật (không viết
 *    lại logic đó ở đây, tránh lệch 2 nơi).
 *  - BỎ 2 nút "Lên"/"Xuống" (sắp xếp lại) để giữ card gọn trong Drawer nhiều
 *    Task cùng lúc - vẫn tick/thêm/sửa nội dung/xoá được đầy đủ (CRUD).
 *  - MỖI mutation invalidate THÊM namespace `periodic-task-performance`
 *    (khác 3 hook gốc chỉ invalidate `periodic-tasks`) để bảng tổng hợp Hiệu
 *    suất (cột Checklist) tự cập nhật ngay khi tick/thêm/xoá trong Drawer này.
 */
export function TaskChecklistInline({ taskId, canEdit, onOpenFull }: Props) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const invalidatePerformance = () => queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });

    const { data, isLoading } = useTaskChecklistPage(taskId, 1, true);
    const items = data?.data ?? [];
    const total = data?.total ?? 0;
    const done = data?.done ?? 0;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const hasMore = total > CHECKLIST_PAGE_SIZE;

    const addMutation = useAddTaskChecklistItem();
    const updateMutation = useUpdateTaskChecklistItem();
    const removeMutation = useRemoveTaskChecklistItem();

    const [newContent, setNewContent] = useState('');
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState('');

    const handleAdd = () => {
        if (!newContent.trim()) return;
        addMutation.mutate(
            { taskId, content: newContent.trim() },
            {
                onSuccess: () => {
                    setNewContent('');
                    invalidatePerformance();
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Thêm checklist item thất bại')),
            },
        );
    };

    const handleToggleDone = (item: PeriodicTaskChecklistItem) => {
        updateMutation.mutate(
            { taskId, itemId: item.id, data: { isDone: !item.isDone } },
            {
                onSuccess: invalidatePerformance,
                onError: (err) => message.error(getApiErrorMessage(err, 'Cập nhật trạng thái thất bại')),
            },
        );
    };

    const startEdit = (item: PeriodicTaskChecklistItem) => {
        setEditingItemId(item.id);
        setEditingContent(item.content);
    };
    const cancelEdit = () => {
        setEditingItemId(null);
        setEditingContent('');
    };
    const handleSaveEdit = (item: PeriodicTaskChecklistItem) => {
        const trimmed = editingContent.trim();
        if (!trimmed) {
            message.error('Nội dung không được để trống');
            return;
        }
        if (trimmed === item.content) {
            cancelEdit();
            return;
        }
        updateMutation.mutate(
            { taskId, itemId: item.id, data: { content: trimmed } },
            {
                onSuccess: () => {
                    cancelEdit();
                    invalidatePerformance();
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Sửa nội dung thất bại')),
            },
        );
    };

    const handleRemove = (item: PeriodicTaskChecklistItem) => {
        removeMutation.mutate(
            { taskId, itemId: item.id },
            {
                onSuccess: invalidatePerformance,
                onError: (err) => message.error(getApiErrorMessage(err, 'Xoá checklist item thất bại')),
            },
        );
    };

    return (
        <div onClick={(e) => e.stopPropagation()}>
            {total > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Progress percent={percent} size="small" style={{ flex: 1 }} />
                    <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {done}/{total}
                    </Text>
                </div>
            )}

            <Spin spinning={isLoading}>
                {total === 0 ? (
                    <Empty description="Chưa có checklist item nào" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ margin: '4px 0' }} />
                ) : (
                    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
                        {items.map((item, index) => {
                            const isEditing = editingItemId === item.id;
                            const isBusy =
                                (updateMutation.isPending && updateMutation.variables?.itemId === item.id) ||
                                (removeMutation.isPending && removeMutation.variables?.itemId === item.id);
                            return (
                                <div
                                    key={item.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '6px 8px',
                                        borderBottom: index === items.length - 1 ? 'none' : '1px solid #f0f0f0',
                                        opacity: isBusy ? 0.6 : 1,
                                    }}
                                >
                                    <Checkbox checked={item.isDone} disabled={!canEdit} onChange={() => handleToggleDone(item)} />
                                    {isEditing ? (
                                        <Input
                                            autoFocus
                                            size="small"
                                            value={editingContent}
                                            maxLength={500}
                                            onChange={(e) => setEditingContent(e.target.value)}
                                            onPressEnter={() => handleSaveEdit(item)}
                                            style={{ flex: 1 }}
                                        />
                                    ) : (
                                        <Text
                                            style={{
                                                flex: 1,
                                                fontSize: 13,
                                                textDecoration: item.isDone ? 'line-through' : undefined,
                                                color: item.isDone ? 'rgba(0,0,0,0.45)' : undefined,
                                                cursor: canEdit ? 'pointer' : undefined,
                                            }}
                                            onClick={() => canEdit && startEdit(item)}
                                        >
                                            <LinkifiedText text={item.content} />
                                        </Text>
                                    )}
                                    {canEdit && (
                                        <Space size={2}>
                                            {isEditing ? (
                                                <>
                                                    <Button
                                                        size="small"
                                                        type="text"
                                                        icon={<CheckOutlined />}
                                                        loading={updateMutation.isPending && updateMutation.variables?.itemId === item.id}
                                                        onClick={() => handleSaveEdit(item)}
                                                    />
                                                    <Button size="small" type="text" icon={<CloseOutlined />} onClick={cancelEdit} />
                                                </>
                                            ) : (
                                                <Popconfirm title="Xoá checklist item này?" onConfirm={() => handleRemove(item)} okText="Xoá" cancelText="Huỷ">
                                                    <Button
                                                        size="small"
                                                        danger
                                                        type="text"
                                                        icon={<DeleteOutlined />}
                                                        loading={removeMutation.isPending && removeMutation.variables?.itemId === item.id}
                                                    />
                                                </Popconfirm>
                                            )}
                                        </Space>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </Spin>

            {hasMore && (
                <Button type="link" size="small" style={{ padding: '4px 0' }} onClick={onOpenFull}>
                    Xem đầy đủ ({total} mục, gồm cả Task con liên kết)...
                </Button>
            )}

            {canEdit && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                    <Input
                        size="small"
                        placeholder="Thêm checklist item mới..."
                        maxLength={500}
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        onPressEnter={handleAdd}
                    />
                    <Button
                        size="small"
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={!newContent.trim()}
                        loading={addMutation.isPending}
                        onClick={handleAdd}
                    >
                        Thêm
                    </Button>
                </div>
            )}
        </div>
    );
}
