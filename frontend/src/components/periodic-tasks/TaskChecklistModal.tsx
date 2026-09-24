'use client';

import { useState } from 'react';
import dayjs from 'dayjs';
import { Modal, Typography, Progress, Input, Button, App, Popconfirm, Checkbox, Space, Empty, Spin, Divider, Tag, Pagination } from 'antd';
import { DeleteOutlined, PlusOutlined, ArrowUpOutlined, ArrowDownOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import {
    useAddTaskChecklistItem,
    useUpdateTaskChecklistItem,
    useRemoveTaskChecklistItem,
    useMoveTaskChecklistItem,
    useTaskChecklistPage,
    useLinkedChildrenChecklistPage,
} from '@/lib/hooks/usePeriodicTaskChecklistItems';
import { PeriodicTask, PeriodicTaskChecklistItem } from '@/lib/api/periodic-tasks.api';
import { CHECKLIST_PAGE_SIZE } from '@/lib/api/periodic-task-checklist-items.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { SimpleList } from '@/components/common/SimpleList';
import { LinkifiedText } from '@/components/common/LinkifiedText';
import { PeriodTypeTag } from './PeriodTypeTag';

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
 * liên kết" bên dưới, đọc trang `GET /:id/linked-children-checklist` (phân trang 10 dòng) (field MỚI,
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
    // Khoá/quyền lấy từ `task` prop (danh sách đã có `isLocked`) - KHÔNG gọi `GET /:id`
    // nặng chỉ để đọc cờ này. 2 danh sách bên dưới tự PHÂN TRANG SERVER-SIDE (tối đa
    // `CHECKLIST_PAGE_SIZE` = 10 dòng/trang), chỉ fetch khi modal đang mở.
    const isLocked = task?.isLocked ?? false;
    const lockBlocksEdit = isLocked && !canEditLocked;
    const canEdit = hasEditPermission && !lockBlocksEdit;

    const [itemPage, setItemPage] = useState(1);
    const [childPage, setChildPage] = useState(1);
    const { data: itemsData, isLoading: itemsLoading, isFetching: itemsFetching } = useTaskChecklistPage(taskId, itemPage, open);
    const { data: childrenData, isLoading: childrenLoading } = useLinkedChildrenChecklistPage(taskId, childPage, open);

    const items = itemsData?.data ?? [];
    const linkedChildren = childrenData?.data ?? [];
    // `total`/`done` là của TOÀN BỘ danh sách (không chỉ trang đang xem) - % gộp CẢ
    // checklist item thật + Task con liên kết thành 1 con số chung, như trước.
    const itemsTotal = itemsData?.total ?? 0;
    const childrenTotal = childrenData?.total ?? 0;
    const totalCount = itemsTotal + childrenTotal;
    const totalDoneCount = (itemsData?.done ?? 0) + (childrenData?.done ?? 0);
    const percent = totalCount > 0 ? Math.round((totalDoneCount / totalCount) * 100) : 0;
    const itemTotalPages = itemsData?.totalPages ?? 0;

    const addMutation = useAddTaskChecklistItem();
    const updateMutation = useUpdateTaskChecklistItem();
    const removeMutation = useRemoveTaskChecklistItem();
    const moveMutation = useMoveTaskChecklistItem();

    const [newContent, setNewContent] = useState('');
    const [editingItemId, setEditingItemId] = useState<number | null>(null);
    const [editingContent, setEditingContent] = useState('');

    const handleAdd = () => {
        if (!task || !newContent.trim()) return;
        addMutation.mutate(
            { taskId: task.id, content: newContent.trim() },
            {
                onSuccess: (res) => {
                    message.success('Đã thêm checklist item');
                    setNewContent('');
                    // Item mới nằm CUỐI danh sách -> nhảy tới trang cuối để người dùng thấy ngay.
                    setItemPage(Math.max(1, Math.ceil(res.total / CHECKLIST_PAGE_SIZE)));
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
                onSuccess: () => {
                    message.success('Đã xoá checklist item');
                    // Xoá dòng duy nhất của trang cuối -> lùi 1 trang, tránh dừng ở trang trống.
                    if (items.length === 1 && itemPage > 1) setItemPage(itemPage - 1);
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Xoá checklist item thất bại')),
            },
        );
    };

    // Đổi chỗ với item liền kề (BE lo, xuyên trang) - chỉ gửi hướng, không gửi cả thứ tự.
    const handleMove = (item: PeriodicTaskChecklistItem, direction: 'up' | 'down') => {
        if (!task) return;
        moveMutation.mutate(
            { taskId: task.id, itemId: item.id, direction },
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
        setItemPage(1);
        setChildPage(1);
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

                    <Spin spinning={itemsLoading || (itemsFetching && !itemsData)}>
                        {itemsTotal === 0 ? (
                            <Empty description="Chưa có checklist item nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                            <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                                {items.map((item, index) => {
                                    const isEditing = editingItemId === item.id;
                                    const isBusy =
                                        (updateMutation.isPending && updateMutation.variables?.itemId === item.id) ||
                                        (removeMutation.isPending && removeMutation.variables?.itemId === item.id) ||
                                        moveMutation.isPending;

                                    return (
                                        <div
                                            key={item.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                padding: '10px 12px',
                                                borderBottom: index === items.length - 1 ? 'none' : '1px solid #f0f0f0',
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
                                                    <LinkifiedText text={item.content} />
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
                                                                disabled={itemPage === 1 && index === 0}
                                                                onClick={() => handleMove(item, 'up')}
                                                            />
                                                            <Button
                                                                size="small"
                                                                type="text"
                                                                icon={<ArrowDownOutlined />}
                                                                disabled={itemPage === itemTotalPages && index === items.length - 1}
                                                                onClick={() => handleMove(item, 'down')}
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

                    {itemsTotal > CHECKLIST_PAGE_SIZE && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                            <Pagination
                                size="small"
                                current={itemPage}
                                pageSize={CHECKLIST_PAGE_SIZE}
                                total={itemsTotal}
                                showSizeChanger={false}
                                onChange={setItemPage}
                            />
                        </div>
                    )}

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
                        <Text strong>Task con liên kết ({childrenTotal}):</Text>
                        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            Tự động tick khi Task con chuyển sang trạng thái hoàn thành - CHỈ hiển thị, không
                            sửa/xoá được ở đây.
                        </Text>
                    </div>
                    <SimpleList
                        loading={childrenLoading}
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
                                    <PeriodTypeTag type={c.periodType} />
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
                    {childrenTotal > CHECKLIST_PAGE_SIZE && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                            <Pagination
                                size="small"
                                current={childPage}
                                pageSize={CHECKLIST_PAGE_SIZE}
                                total={childrenTotal}
                                showSizeChanger={false}
                                onChange={setChildPage}
                            />
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}