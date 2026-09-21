'use client';

import { useState } from 'react';
import dayjs from 'dayjs';
import { Modal, Typography, Progress, Input, Button, App, Popconfirm, Checkbox, Space, Empty, Spin, Divider, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined, ArrowUpOutlined, ArrowDownOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { usePeriodicTask } from '@/lib/hooks/usePeriodicTasks';
import {
    useAddTaskChecklistItem,
    useUpdateTaskChecklistItem,
    useRemoveTaskChecklistItem,
    useReorderTaskChecklistItems,
} from '@/lib/hooks/usePeriodicTaskChecklistItems';
import { PeriodicTask, PeriodicTaskChecklistItem, PERIOD_TYPE_LABELS } from '@/lib/api/periodic-tasks.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { SimpleList } from '@/components/common/SimpleList';

const { Text } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
    task: PeriodicTask | null;
}

/**
 * TaskChecklistModal - UI Phase 6 (PLAN_PERIODIC_TASKS_MODULE.md mục 6):
 * checklist con kiểu Trello (item phẳng, không có vòng đời/recurring riêng).
 * Mirror TRỰC TIẾP `TaskLinksModal.tsx` về nguyên tắc chung (fetch riêng qua
 * `usePeriodicTask(id)` vì `task` prop từ danh sách KHÔNG có `checklistItems`,
 * gate quyền/khoá giống hệt, toast lỗi qua `getApiErrorMessage`) nhưng TÁCH
 * THÀNH modal riêng (không nhét vào `TaskLinksModal`) vì đây là 1 nhóm chức
 * năng độc lập, đủ lớn để có nút riêng ở bảng danh sách.
 *
 * Khớp đúng 5 endpoint BE của `PeriodicTasksController` phần Phase 6 (xem
 * `periodic-task-checklist-items.api.ts`). Không có permission/scope riêng -
 * xem = `periodic_tasks.view` (đã có sẵn vì đứng được ở trang danh sách), sửa
 * (thêm/tick/sửa nội dung/xoá/sắp xếp) = `periodic_tasks.edit`, và bị chặn
 * thêm bởi `edit_locked` khi Task đang khoá (mirror `TaskLinksModal`).
 *
 * ⚠️ Sắp xếp lại thứ tự: dự án CHƯA có thư viện kéo-thả (drag-and-drop) nào
 * được cài (`grep` xác nhận không có `@dnd-kit`/`react-beautiful-dnd` trong
 * `package.json`) - để tránh thêm phụ thuộc mới chỉ cho 1 tính năng nhỏ, dùng
 * 2 nút "Lên"/"Xuống" (đổi chỗ với item liền kề) rồi gọi API
 * `reorder(itemIds)` với TOÀN BỘ thứ tự mới - vẫn đúng đề bài "kéo-thả kiểu
 * Trello" về mặt kết quả (sắp xếp lại được `position`), chỉ khác cơ chế
 * tương tác. Nếu sau này chủ dự án muốn kéo-thả chuột thật, đổi phần render
 * danh sách + `handleMove` này sang 1 thư viện DnD, KHÔNG cần đổi API/hook.
 *
 * Phase 9 (tích hợp Task con vào chung Checklist): thêm section "Task con
 * liên kết" bên dưới, đọc `taskDetail.linkedChildrenChecklist` (field MỚI,
 * HOÀN TOÀN tách biệt khỏi `checklistItems` ở trên - xem JSDoc field đó ở
 * `periodic-tasks.api.ts`). Section này CHỈ hiển thị (checkbox luôn
 * `disabled`, không có nút sửa/xoá/sắp xếp nào) - Task con tick "xong" tự
 * động theo status thật của chính nó, không qua thao tác tay ở đây. % hoàn
 * thành ở đầu modal gộp CẢ 2 hạng mục thành 1 con số chung (đúng nghĩa
 * "chung 1 checklist"), nhưng 2 danh sách bên dưới vẫn hiển thị tách riêng.
 */
export function TaskChecklistModal({ open, onClose, task }: Props) {
    const { message } = App.useApp();
    const { can } = useMyPermissions();
    const hasEditPermission = can('periodic_tasks.edit');
    const canEditLocked = can('periodic_tasks.edit_locked');

    const taskId = task?.id ?? null;
    // `task` prop (từ danh sách) KHÔNG có `checklistItems` - phải fetch riêng
    // qua `GET /:id` (mirror `TaskLinksModal` với `linkedCustomers`).
    const { data: taskDetail, isLoading: taskDetailLoading } = usePeriodicTask(taskId);
    const isLocked = taskDetail?.isLocked ?? task?.isLocked ?? false;
    const lockBlocksEdit = isLocked && !canEditLocked;
    const canEdit = hasEditPermission && !lockBlocksEdit;
    // Không có case `undefined` do thiếu quyền (mirror `secondaryAssignees`,
    // xem JSDoc `attachChecklistItems()` ở BE) - mặc định mảng rỗng lúc tải.
    const items = taskDetail?.checklistItems ?? [];
    const sortedItems = [...items].sort((a, b) => a.position - b.position);
    const doneCount = sortedItems.filter((i) => i.isDone).length;
    // Phase 9: Task con liên kết (mảng "checklist ảo" tính LIVE ở BE, xem
    // JSDoc field `linkedChildrenChecklist` ở `periodic-tasks.api.ts`) - HOÀN
    // TOÀN tách biệt khỏi `items`/`sortedItems` ở trên (không đọc/ghi chung
    // bảng `periodic_task_checklist_items`), không có id/position, không có
    // route sửa/xoá nào áp lên được - CHỈ hiển thị, tick tự động theo đúng
    // status hiện tại của Task con.
    const linkedChildren = taskDetail?.linkedChildrenChecklist ?? [];
    const linkedDoneCount = linkedChildren.filter((c) => c.isDone).length;
    // "Tích hợp Task con vào CHUNG checklist" (đúng yêu cầu) - % hoàn thành
    // ở đầu modal gộp CẢ 2 hạng mục làm 1 con số duy nhất, dù UI vẫn tách
    // riêng 2 danh sách bên dưới.
    const totalCount = sortedItems.length + linkedChildren.length;
    const totalDoneCount = doneCount + linkedDoneCount;
    const percent = totalCount > 0 ? Math.round((totalDoneCount / totalCount) * 100) : 0;

    const addMutation = useAddTaskChecklistItem();
    const updateMutation = useUpdateTaskChecklistItem();
    const removeMutation = useRemoveTaskChecklistItem();
    const reorderMutation = useReorderTaskChecklistItems();

    const [newContent, setNewContent] = useState('');
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState('');

    const handleAdd = () => {
        if (!task || !newContent.trim()) return;
        addMutation.mutate(
            { taskId: task.id, content: newContent.trim() },
            {
                onSuccess: () => {
                    message.success('Đã thêm checklist item');
                    setNewContent('');
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Thêm checklist item thất bại')),
            },
        );
    };

    const handleToggleDone = (item: PeriodicTaskChecklistItem) => {
        if (!task) return;
        updateMutation.mutate(
            { taskId: task.id, itemId: item.id, data: { isDone: !item.isDone } },
            {
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
        if (!task) return;
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
            { taskId: task.id, itemId: item.id, data: { content: trimmed } },
            {
                onSuccess: () => {
                    message.success('Đã sửa nội dung');
                    cancelEdit();
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Sửa nội dung thất bại')),
            },
        );
    };

    const handleRemove = (item: PeriodicTaskChecklistItem) => {
        if (!task) return;
        removeMutation.mutate(
            { taskId: task.id, itemId: item.id },
            {
                onSuccess: () => message.success('Đã xoá checklist item'),
                onError: (err) => message.error(getApiErrorMessage(err, 'Xoá checklist item thất bại')),
            },
        );
    };

    // Đổi chỗ item ở `index` với item liền kề (lên: index-1, xuống: index+1)
    // rồi gửi lại TOÀN BỘ mảng ID theo thứ tự mới - khớp đúng hợp đồng
    // `ReorderPeriodicTaskChecklistItemsDto` (hoán vị đầy đủ) ở BE.
    const handleMove = (index: number, direction: 'up' | 'down') => {
        if (!task) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= sortedItems.length) return;

        const reordered = [...sortedItems];
        [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

        reorderMutation.mutate(
            { taskId: task.id, itemIds: reordered.map((i) => i.id) },
            {
                onError: (err) => message.error(getApiErrorMessage(err, 'Sắp xếp lại thất bại')),
            },
        );
    };

    // Reset form phụ NGAY LÚC đóng (không dùng `useEffect` theo dõi `open`
    // để tránh anti-pattern "setState đồng bộ trong effect" -
    // `react-hooks/set-state-in-effect` - mirror cách `TaskLinksModal.resetAndClose()`
    // reset trực tiếp trong handler, không qua effect).
    const resetAndClose = () => {
        setNewContent('');
        setEditingItemId(null);
        setEditingContent('');
        onClose();
    };

    return (
        <Modal
            title={`Checklist${task ? ` - "${task.title}"` : ''}`}
            open={open}
            onCancel={resetAndClose}
            footer={<Button onClick={resetAndClose}>Đóng</Button>}
            width={640}
        >
            {task && (
                <>
                    {totalCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <Progress percent={percent} style={{ flex: 1 }} />
                            <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                                {totalDoneCount}/{totalCount} hoàn thành
                            </Text>
                        </div>
                    )}

                    <Spin spinning={taskDetailLoading}>
                        {sortedItems.length === 0 ? (
                            <Empty description="Chưa có checklist item nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                                {sortedItems.map((item, index) => {
                                    const isEditing = editingItemId === item.id;
                                    const isBusy =
                                        (updateMutation.isPending && updateMutation.variables?.itemId === item.id) ||
                                        (removeMutation.isPending && removeMutation.variables?.itemId === item.id) ||
                                        reorderMutation.isPending;

                                    return (
                                        <div
                                            key={item.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                padding: '10px 12px',
                                                borderBottom: index === sortedItems.length - 1 ? 'none' : '1px solid #f0f0f0',
                                                opacity: isBusy ? 0.6 : 1,
                                            }}
                                        >
                                            <Checkbox
                                                checked={item.isDone}
                                                disabled={!canEdit}
                                                onChange={() => handleToggleDone(item)}
                                            />

                                            {isEditing ? (
                                                <Input
                                                    autoFocus
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
                                                        textDecoration: item.isDone ? 'line-through' : undefined,
                                                        color: item.isDone ? 'rgba(0,0,0,0.45)' : undefined,
                                                        cursor: canEdit ? 'pointer' : undefined,
                                                    }}
                                                    onClick={() => canEdit && startEdit(item)}
                                                >
                                                    {item.content}
                                                </Text>
                                            )}

                                            {canEdit && (
                                                <Space size={4}>
                                                    {isEditing ? (
                                                        <>
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                icon={<CheckOutlined />}
                                                                loading={
                                                                    updateMutation.isPending &&
                                                                    updateMutation.variables?.itemId === item.id
                                                                }
                                                                onClick={() => handleSaveEdit(item)}
                                                            />
                                                            <Button size="small" type="text" icon={<CloseOutlined />} onClick={cancelEdit} />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                icon={<ArrowUpOutlined />}
                                                                disabled={index === 0}
                                                                onClick={() => handleMove(index, 'up')}
                                                            />
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                icon={<ArrowDownOutlined />}
                                                                disabled={index === sortedItems.length - 1}
                                                                onClick={() => handleMove(index, 'down')}
                                                            />
                                                            <Popconfirm
                                                                title="Xoá checklist item này?"
                                                                onConfirm={() => handleRemove(item)}
                                                                okText="Xoá"
                                                                cancelText="Huỷ"
                                                            >
                                                                <Button
                                                                    size="small"
                                                                    danger
                                                                    type="text"
                                                                    icon={<DeleteOutlined />}
                                                                    loading={
                                                                        removeMutation.isPending &&
                                                                        removeMutation.variables?.itemId === item.id
                                                                    }
                                                                />
                                                            </Popconfirm>
                                                        </>
                                                    )}
                                                </Space>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Spin>

                    {canEdit && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <Input
                                placeholder="Thêm checklist item mới..."
                                maxLength={500}
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                                onPressEnter={handleAdd}
                            />
                            <Button
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

                    {!canEdit && (
                        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                            {lockBlocksEdit && hasEditPermission
                                ? 'Công việc đang bị khoá - cần quyền "Sửa khi đang khoá" để sửa Checklist.'
                                : 'Bạn chỉ có quyền xem - cần quyền "Sửa Công việc định kỳ" để thêm/sửa/xoá Checklist.'}
                        </Text>
                    )}

                    <Divider style={{ margin: '20px 0 12px' }} />

                    <div style={{ marginBottom: 8 }}>
                        <Text strong>Task con liên kết ({linkedChildren.length}):</Text>
                        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            Tự động tick khi Task con chuyển sang trạng thái hoàn thành - CHỈ hiển thị, không
                            sửa/xoá được ở đây.
                        </Text>
                    </div>
                    <SimpleList
                        loading={taskDetailLoading}
                        size="small"
                        bordered
                        dataSource={linkedChildren}
                        rowKey={(c) => c.childTaskId}
                        emptyText="Chưa liên kết Task con nào"
                        renderMeta={(c) => ({
                            avatar: <Checkbox checked={c.isDone} disabled />,
                            title: (
                                <Text
                                    style={{
                                        textDecoration: c.isDone ? 'line-through' : undefined,
                                        color: c.isDone ? 'rgba(0,0,0,0.45)' : undefined,
                                    }}
                                >
                                    {c.title}
                                </Text>
                            ),
                            description: (
                                <Space size={4} wrap>
                                    <Tag>{PERIOD_TYPE_LABELS[c.periodType]}</Tag>
                                    <Tag color={c.status.color}>{c.status.name}</Tag>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {dayjs(c.periodStartDate).format('DD/MM/YYYY')}
                                        {c.periodStartDate !== c.periodEndDate &&
                                            ` → ${dayjs(c.periodEndDate).format('DD/MM/YYYY')}`}
                                    </Text>
                                </Space>
                            ),
                        })}
                    />
                </>
            )}
        </Modal>
    );
}