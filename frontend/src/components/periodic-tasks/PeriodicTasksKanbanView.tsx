'use client';

import { useMemo, useState } from 'react';
import { App, Badge, Empty, Spin, Typography } from 'antd';
import {
    CollisionDetection,
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    pointerWithin,
    rectIntersection,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { PeriodicTaskStatus } from '@/lib/api/periodic-task-statuses.api';
import { useUpdatePeriodicTask } from '@/lib/hooks/usePeriodicTasks';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { TaskMiniCard } from './TaskMiniCard';
import { TaskActionsBar, TaskActionsBarProps } from './TaskActionsBar';
import { TaskChainInfo } from '@/lib/utils/taskLinkChains';

const { Text } = Typography;

type ActionHandlers = Pick<
    TaskActionsBarProps,
    'canEdit' | 'canEditLocked' | 'canApprove' | 'canDelete' | 'onLink' | 'onChecklist' | 'onCustomers' | 'onAudit' | 'onEdit' | 'onLock' | 'onUnlock' | 'onDelete'
> & {
    isUnlocking: (taskId: number) => boolean;
};

export interface PeriodicTasksKanbanViewProps extends ActionHandlers {
    tasks: PeriodicTask[];
    statuses: PeriodicTaskStatus[];
    loading?: boolean;
    /** Phase 8 - xem JSDoc tương ứng ở `PeriodicTasksAgendaViewProps`. Kanban
     * CHỈ hiện `TaskChainBadge` (không vẽ đường nối liên tục như Agenda) vì
     * mỗi Card đang gắn `ref` cho `useSortable()` (dnd-kit) - bọc thêm 1 lớp
     * div định vị riêng cho đường nối có rủi ro lệch toạ độ kéo-thả, không
     * đáng đánh đổi cho 1 chi tiết trang trí. */
    chains?: Map<number, TaskChainInfo>;
    resolveChainTask?: (taskId: number) => Pick<PeriodicTask, 'title' | 'periodStartDate'> | undefined;
}

const TASK_PREFIX = 'task-';
const COLUMN_PREFIX = 'col-';

/**
 * PeriodicTasksKanbanView - View 2 (Phase 8, PLAN mục Phase 8). Cột = từng
 * `PeriodicTaskStatus`, sắp xếp theo `sortOrder` tăng dần (ĐÚNG yêu cầu chủ
 * dự án: "cột chính sắp xếp theo trạng thái" - Admin tự cấu hình thứ tự
 * qua `/quan-ly-trang-thai-cong-viec`, KHÔNG hardcode thứ tự ở FE). Kéo Task
 * sang cột khác = gọi `PATCH /periodic-tasks/:id { statusId }` (dùng lại
 * NGUYÊN `useUpdatePeriodicTask` đã có từ Phase 1 - Kanban KHÔNG cần endpoint
 * BE riêng, đổi status qua field có sẵn). Audit log `status_changed` (Phase
 * 7) tự sinh ở BE, FE không cần code thêm.
 *
 * RBAC: 1 Task KHÔNG kéo được nếu thiếu `periodic_tasks.edit`, hoặc đang
 * `isLocked` mà thiếu `periodic_tasks.edit_locked` (mirror ĐÚNG điều kiện
 * `editDisabled` ở nút "Sửa" của Table gốc/`TaskActionsBar`) - disable NGAY
 * ở `useSortable({ disabled })` để Task không kéo được lên (khác cách BE
 * 403 rồi mới biết), đúng nguyên tắc "FE tự ẩn trước" của dự án.
 *
 * Chỉ đổi CỘT (statusId) mới gọi API - thả lại đúng cột cũ (kể cả đổi vị trí
 * trong cùng cột) KHÔNG làm gì, vì Task không có cột `position` riêng theo
 * từng status để lưu thứ tự trong 1 cột.
 */
export function PeriodicTasksKanbanView({ tasks, statuses, loading, chains, resolveChainTask, ...actions }: PeriodicTasksKanbanViewProps) {
    const { message } = App.useApp();
    const updateMutation = useUpdatePeriodicTask();

    // Ghi đè TẠM statusId ngay khi thả (optimistic) - dọn khi mutation xong
    // (thành công lẫn thất bại), tránh Task "nhảy" ngược cột cũ trong lúc
    // đợi PATCH rồi mới nhảy đúng cột khi query invalidate xong.
    const [pendingOverride, setPendingOverride] = useState<Record<number, number>>({});
    const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

    const effectiveStatusId = (task: PeriodicTask) => pendingOverride[task.id] ?? task.statusId;

    const canDragTask = (task: PeriodicTask) => actions.canEdit && !(task.isLocked && !actions.canEditLocked);

    const columns = useMemo(
        () => [...statuses].sort((a, b) => a.sortOrder - b.sortOrder),
        [statuses],
    );

    const tasksByStatus = useMemo(() => {
        const map = new Map<number, PeriodicTask[]>();
        for (const status of columns) map.set(status.id, []);
        for (const task of tasks) {
            const statusId = effectiveStatusId(task);
            const arr = map.get(statusId) ?? [];
            arr.push(task);
            map.set(statusId, arr);
        }
        return map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasks, columns, pendingOverride]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    // BUG THẬT (2026-09-15, xem WORKFLOW_LOG): `closestCorners` so khoảng
    // cách góc TUYỆT ĐỐI giữa Card đang kéo với MỌI droppable (cả cột rỗng
    // lẫn từng Card ở cột khác) - khi 1 cột NẰM GIỮA 1 cột có Card và 1 cột
    // trống, góc của Card thuộc cột bên cạnh luôn gần hơn góc của cột giữa
    // (diện tích lớn, rỗng), khiến `over` liên tục trả về Card/cột SAI, cột
    // giữa không bao giờ sáng `isOver` (và có thể tính sai cột đích lúc thả)
    // - lỗi CÀNG DỄ gặp khi Admin thêm Trạng thái mới nằm giữa 2 cột khác
    // (đúng như quan sát của chủ dự án). Đổi sang chiến lược chuẩn của
    // dnd-kit cho Kanban nhiều cột ("Multiple Containers"): ưu tiên
    // `pointerWithin` (khớp THEO VỊ TRÍ CON TRỎ thực tế đang nằm trong
    // droppable nào, không phụ thuộc khoảng cách góc), chỉ fallback
    // `rectIntersection` khi con trỏ ra khỏi MỌI droppable (kéo nhanh/ra rìa
    // ngoài bảng).
    const collisionDetectionStrategy: CollisionDetection = (args) => {
        const pointerCollisions = pointerWithin(args);
        if (pointerCollisions.length > 0) return pointerCollisions;
        return rectIntersection(args);
    };

    const activeTask = activeTaskId != null ? tasks.find((t) => t.id === activeTaskId) : undefined;

    const handleDragStart = (event: DragStartEvent) => {
        const id = String(event.active.id);
        if (id.startsWith(TASK_PREFIX)) setActiveTaskId(Number(id.slice(TASK_PREFIX.length)));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTaskId(null);
        if (!over) return;

        const activeId = String(active.id);
        if (!activeId.startsWith(TASK_PREFIX)) return;
        const taskId = Number(activeId.slice(TASK_PREFIX.length));
        const task = tasks.find((t) => t.id === taskId);
        if (!task) return;

        const overId = String(over.id);
        let targetStatusId: number | undefined;
        if (overId.startsWith(COLUMN_PREFIX)) {
            targetStatusId = Number(overId.slice(COLUMN_PREFIX.length));
        } else if (overId.startsWith(TASK_PREFIX)) {
            const overTaskId = Number(overId.slice(TASK_PREFIX.length));
            const overTask = tasks.find((t) => t.id === overTaskId);
            if (overTask) targetStatusId = effectiveStatusId(overTask);
        }
        if (targetStatusId == null) return;

        const currentStatusId = effectiveStatusId(task);
        if (targetStatusId === currentStatusId) return;

        // Kiểm tra lại quyền lần 2 (phòng hờ) - `disabled` ở `useSortable`
        // đã chặn từ lúc bắt đầu kéo, đây chỉ là lớp bảo vệ thêm.
        if (!canDragTask(task)) {
            message.warning('Bạn không có quyền đổi trạng thái Công việc này');
            return;
        }

        setPendingOverride((prev) => ({ ...prev, [task.id]: targetStatusId! }));
        updateMutation.mutate(
            { id: task.id, data: { statusId: targetStatusId } },
            {
                onSuccess: () => {
                    message.success(`Đã chuyển "${task.title}" sang trạng thái mới`);
                    setPendingOverride((prev) => {
                        const next = { ...prev };
                        delete next[task.id];
                        return next;
                    });
                },
                onError: (err) => {
                    message.error(getApiErrorMessage(err, 'Đổi trạng thái thất bại'));
                    setPendingOverride((prev) => {
                        const next = { ...prev };
                        delete next[task.id];
                        return next;
                    });
                },
            },
        );
    };

    if (loading) {
        return (
            <div style={{ padding: 48, textAlign: 'center' }}>
                <Spin />
            </div>
        );
    }

    if (columns.length === 0) {
        return <Empty description="Chưa có Trạng thái nào - vào &quot;Quản lý Trạng thái&quot; để tạo" style={{ padding: 48 }} />;
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
                {columns.map((status) => {
                    const columnTasks = tasksByStatus.get(status.id) ?? [];
                    return (
                        <KanbanColumn key={status.id} status={status} taskIds={columnTasks.map((t) => `${TASK_PREFIX}${t.id}`)}>
                            {columnTasks.map((task) => (
                                <KanbanCard
                                    key={task.id}
                                    task={task}
                                    disabled={!canDragTask(task)}
                                    actions={actions}
                                    chainInfo={chains?.get(task.id)}
                                    resolveChainTask={resolveChainTask}
                                />
                            ))}
                            {columnTasks.length === 0 && (
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', padding: 12 }}>
                                    Không có Công việc
                                </Text>
                            )}
                        </KanbanColumn>
                    );
                })}
            </div>
            <DragOverlay>
                {activeTask && <TaskMiniCard task={activeTask} style={{ width: 280, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} />}
            </DragOverlay>
        </DndContext>
    );
}

function KanbanColumn({
    status,
    taskIds,
    children,
}: {
    status: PeriodicTaskStatus;
    taskIds: string[];
    children: React.ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: `${COLUMN_PREFIX}${status.id}` });
    return (
        <div
            ref={setNodeRef}
            style={{
                width: 300,
                flexShrink: 0,
                background: isOver ? '#e6f4ff' : '#fafafa',
                borderRadius: 8,
                padding: 10,
                border: '1px solid #f0f0f0',
                transition: 'background 0.15s',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 2 }}>
                <span
                    style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: status.color }}
                />
                <Text strong>{status.name}</Text>
                <Badge count={taskIds.length} color={status.color} showZero />
            </div>
            <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                <div style={{ minHeight: 40 }}>{children}</div>
            </SortableContext>
        </div>
    );
}

function KanbanCard({
    task,
    disabled,
    actions,
    chainInfo,
    resolveChainTask,
}: {
    task: PeriodicTask;
    disabled: boolean;
    actions: ActionHandlers;
        chainInfo?: TaskChainInfo;
        resolveChainTask?: (taskId: number) => Pick<PeriodicTask, 'title' | 'periodStartDate'> | undefined;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: `${TASK_PREFIX}${task.id}`,
        disabled,
    });

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition: transition ?? undefined,
                opacity: isDragging ? 0.4 : 1,
                cursor: disabled ? 'default' : 'grab',
            }}
            {...(disabled ? {} : { ...attributes, ...listeners })}
        >
            <TaskMiniCard
                task={task}
                chainInfo={chainInfo}
                resolveChainTask={resolveChainTask}
                footer={
                    <TaskActionsBar
                        task={task}
                        canEdit={actions.canEdit}
                        canEditLocked={actions.canEditLocked}
                        canApprove={actions.canApprove}
                        canDelete={actions.canDelete}
                        onLink={actions.onLink}
                        onChecklist={actions.onChecklist}
                        onCustomers={actions.onCustomers}
                        onAudit={actions.onAudit}
                        onEdit={actions.onEdit}
                        onLock={actions.onLock}
                        onUnlock={actions.onUnlock}
                        onDelete={actions.onDelete}
                        unlockLoading={actions.isUnlocking(task.id)}
                        wrap
                    />
                }
            />
        </div>
    );
}