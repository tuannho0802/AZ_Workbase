'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { App, Button, Checkbox, Collapse, Empty, Input, Popconfirm, Progress, Space, Spin, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
    useAddTaskChecklistItem,
    useUpdateTaskChecklistItem,
    useRemoveTaskChecklistItem,
    useTaskChecklistPage,
} from '@/lib/hooks/usePeriodicTaskChecklistItems';
import { useUsersList } from '@/lib/hooks/useUsers';
import { useRoleColorMap } from '@/lib/hooks/useRoleColorMap';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
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
 *  - MỚI (2026-09-25, yêu cầu chủ dự án - "áp dụng separator tương tự Task
 *    checklist"): mirror ĐÚNG cơ chế gom nhóm theo Người tạo (`createdById`)
 *    của `TaskChecklistModal` - CHỈ gom (bọc `Collapse.Panel`, border của nó
 *    đóng vai trò "separator" giữa các nhóm) khi trang 1 hiện tại có TỪ 2
 *    người tạo khác nhau trở lên, ngược lại giữ nguyên danh sách phẳng như
 *    trước. Panel header dùng `UserMiniCard` y hệt Modal gốc (không lặp lại
 *    style riêng ở đây để tránh lệch UI giữa Modal đầy đủ và bản rút gọn này).
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

    // Gom nhóm theo Người tạo (mirror ĐÚNG `TaskChecklistModal` - xem JSDoc đầu file).
    const { users: allUsers } = useUsersList();
    const { getRoleColor } = useRoleColorMap();
    const userNameById = useMemo(
        () => new Map<number, string>((allUsers as Array<{ id: number; name: string }>).map((u) => [u.id, u.name])),
        [allUsers],
    );
    const groupedByCreator = useMemo(() => {
        const map = new Map<string, PeriodicTaskChecklistItem[]>();
        for (const it of items) {
            const key = it.createdById == null ? 'unknown' : String(it.createdById);
            const bucket = map.get(key);
            if (bucket) bucket.push(it);
            else map.set(key, [it]);
        }
        return map;
    }, [items]);
    const shouldGroupByCreator = groupedByCreator.size >= 2;

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

    /**
     * Dòng log nhỏ "Tạo lúc ... • hoàn thành lúc ..." dưới nội dung mỗi
     * checklist item - mirror ĐÚNG `formatChecklistTimestampLine` ở
     * `TaskChecklistModal` (yêu cầu chủ dự án: áp dụng tương tự cho trang
     * Hiệu suất, không viết lại logic riêng để tránh lệch 2 nơi).
     */
    const formatChecklistTimestampLine = (item: PeriodicTaskChecklistItem): string => {
        const created = dayjs(item.createdAt);
        const createdText = `Tạo lúc ${created.format('HH:mm DD/MM/YYYY')}`;

        if (!item.isDone) return createdText;

        const updated = dayjs(item.updatedAt);
        if (!updated.isValid() || !updated.isAfter(created)) return createdText;

        const completedText = updated.isSame(created, 'day')
            ? `hoàn thành lúc ${updated.format('HH:mm')}`
            : `hoàn thành lúc ${updated.format('HH:mm DD/MM/YYYY')}`;

        return `${createdText} • ${completedText}`;
    };

    // Render 1 dòng checklist item - dùng CHUNG cho cả danh sách phẳng lẫn
    // bên trong từng `Collapse.Panel` khi có gom nhóm (mirror `TaskChecklistModal`).
    const renderItemRow = (item: PeriodicTaskChecklistItem, isLast: boolean) => {
        const isEditing = editingItemId === item.id;
        const isBusy =
            (updateMutation.isPending && updateMutation.variables?.itemId === item.id) ||
            (removeMutation.isPending && removeMutation.variables?.itemId === item.id);
        return (
            <div
                key={item.id}
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    padding: '6px 8px',
                    borderBottom: isLast ? 'none' : '1px solid #f0f0f0',
                    opacity: isBusy ? 0.6 : 1,
                }}
            >
                <Checkbox checked={item.isDone} disabled={!canEdit} onChange={() => handleToggleDone(item)} style={{ marginTop: 2 }} />
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
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <Text
                            style={{
                                display: 'block',
                                fontSize: 13,
                                textDecoration: item.isDone ? 'line-through' : undefined,
                                color: item.isDone ? 'rgba(0,0,0,0.45)' : undefined,
                                cursor: canEdit ? 'pointer' : undefined,
                            }}
                            onClick={() => canEdit && startEdit(item)}
                        >
                            <LinkifiedText text={item.content} />
                        </Text>
                        <Text type="secondary" style={{ display: 'block', fontSize: 10, marginTop: 1 }}>
                            {formatChecklistTimestampLine(item)}
                        </Text>
                    </div>
                )}
                {canEdit && (
                    <Space size={2} style={{ marginTop: 1 }}>
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
                ) : shouldGroupByCreator ? (
                    <Collapse
                        size="small"
                        defaultActiveKey={[...groupedByCreator.keys()]}
                        items={[...groupedByCreator.entries()].map(([creatorKey, groupItems]) => {
                            const creatorId = creatorKey === 'unknown' ? null : Number(creatorKey);
                            const creatorName = creatorId != null ? userNameById.get(creatorId) ?? `User #${creatorId}` : 'Không xác định';
                            const doneInGroup = groupItems.filter((i) => i.isDone).length;
                            return {
                                key: creatorKey,
                                label: (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <UserMiniCard
                                            name={creatorName}
                                            hideRoleTag
                                            nameFontSize={11}
                                            borderRadius={6}
                                            avatarShape="square"
                                            getRoleColor={getRoleColor}
                                            getRoleName={() => ''}
                                        />
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            {doneInGroup}/{groupItems.length} hoàn thành
                                        </Text>
                                    </div>
                                ),
                                children: (
                                    <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
                                        {groupItems.map((item, idxInGroup) => renderItemRow(item, idxInGroup === groupItems.length - 1))}
                                    </div>
                                ),
                            };
                        })}
                        />
                    ) : (
                        <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
                            {items.map((item, index) => renderItemRow(item, index === items.length - 1))}
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