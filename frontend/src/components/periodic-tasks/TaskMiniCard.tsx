'use client';

import { Card, Tag, Tooltip, Space, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { PeriodicTask, PERIOD_TYPE_LABELS } from '@/lib/api/periodic-tasks.api';
import { DEFAULT_ENTITY_COLOR, resolveEntityColor } from '@/lib/utils/entityColor';
import { useUsersList } from '@/lib/hooks/useUsers';
import { TaskTitlePill, TaskChainBadge } from './TaskTitlePill';
import { TaskChainInfo } from '@/lib/utils/taskLinkChains';

const { Text } = Typography;

/**
 * TaskMiniCard - card thu gọn 1 `PeriodicTask`, mirror ĐÚNG nội dung 3 cột
 * "Công việc"/"Kỳ hạn"/"Trạng thái"/"Phụ trách chính"/"Phòng ban" ở Table gốc
 * (`cong-viec-dinh-ky/page.tsx`), gộp lại thành 1 khối để dùng ở Agenda (Phase
 * 8, View 1) và Kanban (Phase 8, View 2) - view nào cần thêm phần riêng
 * (Popconfirm kéo-thả, nút Thao tác...) tự bọc thêm bên ngoài qua `extra`/
 * `footer`, KHÔNG sửa trực tiếp file này để tránh lệch UI giữa 2 view.
 */
export interface TaskMiniCardProps {
    task: PeriodicTask;
    /** Nội dung thêm ở góc phải tiêu đề card (vd: handle kéo-thả ở Kanban). */
    extra?: React.ReactNode;
    /** Nội dung thêm bên dưới cùng card (vd: `TaskActionsBar`). */
    footer?: React.ReactNode;
    size?: 'small' | 'default';
    style?: React.CSSProperties;
    /** Kanban card cần chặn onClick lan ra khi đang kéo - cho phép view cha
     * tự bọc thêm listener/style qua đây thay vì phải fork component. */
    onClick?: () => void;
    className?: string;
    /** Phase 8 - thông tin chuỗi liên kết của CHÍNH `task` này (nếu có),
     * `undefined` = Task không thuộc chuỗi nào -> KHÔNG hiện badge. */
    chainInfo?: TaskChainInfo;
    /** Tra tiêu đề/ngày của từng thành viên trong chuỗi (mirror
     * `TaskChainBadgeProps.resolveTask`) - bắt buộc truyền cùng `chainInfo`. */
    resolveChainTask?: (taskId: number) => Pick<PeriodicTask, 'title' | 'periodStartDate'> | undefined;
}

export function TaskMiniCard({
    task,
    extra,
    footer,
    size = 'small',
    style,
    onClick,
    className,
    chainInfo,
    resolveChainTask,
}: TaskMiniCardProps) {
    // `lockedById` KHÔNG kèm object quan hệ từ BE (xem JSDoc
    // `PeriodicTask.lockedById` ở periodic-tasks.api.ts) - tự tra tên qua
    // `useUsersList()`, mirror ĐÚNG `userNameById` ở page gốc.
    const { users } = useUsersList();
    const lockedByName = task.lockedById
        ? (users as Array<{ id: number; name: string }>).find((u) => u.id === task.lockedById)?.name
        : undefined;

    return (
        <Card size={size} style={{ marginBottom: 8, ...style }} onClick={onClick} className={className}>
            <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
                <div>
                    <Space align="start" wrap size={4}>
                        <TaskTitlePill title={task.title} color={task.color} />
                        {chainInfo && resolveChainTask && (
                            <TaskChainBadge chain={chainInfo} currentTaskId={task.id} resolveTask={resolveChainTask} />
                        )}
                    </Space>
                    {task.note && (
                        <div>
                            <Tooltip title={task.note}>
                                <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                                    {task.note}
                                </Text>
                            </Tooltip>
                        </div>
                    )}
                </div>
                {extra}
            </Space>

            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                <Tag>{PERIOD_TYPE_LABELS[task.periodType]}</Tag>
                <Tag color={task.status?.color ?? DEFAULT_ENTITY_COLOR}>{task.status?.name ?? '—'}</Tag>
                {task.department && (
                    <Tag color={resolveEntityColor(task.department.color)}>{task.department.name}</Tag>
                )}
                {task.isLocked && (
                    <Tooltip
                        title={
                            <>
                                <div>Khoá bởi: {lockedByName ?? '—'}</div>
                                {task.lockedAt && <div>Lúc: {dayjs(task.lockedAt).format('HH:mm DD/MM/YYYY')}</div>}
                                {task.lockNote && <div>Ghi chú: {task.lockNote}</div>}
                            </>
                        }
                    >
                        <Tag color="red" icon={<LockOutlined />}>
                            Đã khoá
                        </Tag>
                    </Tooltip>
                )}
            </div>

            <div style={{ marginTop: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {dayjs(task.periodStartDate).format('DD/MM/YYYY')}
                    {task.periodStartDate !== task.periodEndDate &&
                        ` → ${dayjs(task.periodEndDate).format('DD/MM/YYYY')}`}
                    {' · '}
                    {task.primaryAssignee?.name ?? '—'}
                </Text>
            </div>

            {footer && <div style={{ marginTop: 8 }}>{footer}</div>}
        </Card>
    );
}