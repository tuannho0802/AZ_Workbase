'use client';

import { Card, Tag, Tooltip, Typography } from 'antd';
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

    // BUG THẬT (2026-09-16, chữ tràn ra ngoài Card ở Kanban - xem ảnh chủ dự
    // án gửi): `Space` cũ bọc khối tiêu đề/ghi chú KHÔNG co được (flex item
    // mặc định `min-width: auto`), khiến div con cứ nới rộng theo chữ dài
    // thay vì co lại theo bề rộng Card 300px rồi mới wrap/ellipsis bên trong.
    // Đổi sang flex row tự viết tay: cột nội dung có `flex: 1, minWidth: 0`
    // (bắt buộc để flex item CHO PHÉP co nhỏ hơn nội dung của nó - đây là chỗ
    // hay bị quên nhất khi debug tràn chữ trong flexbox), cột `extra` giữ
    // nguyên kích thước (`flexShrink: 0`).
    const hasNote = !!task.note;
    const hasDescription = !!task.description;

    return (
        <Card size={size} style={{ marginBottom: 8, ...style }} onClick={onClick} className={className}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 4 }}>
                        <TaskTitlePill title={task.title} color={task.color} />
                        {chainInfo && resolveChainTask && (
                            <TaskChainBadge chain={chainInfo} currentTaskId={task.id} resolveTask={resolveChainTask} />
                        )}
                    </div>
                    {/* Trước đây CHỈ hiện `task.note`, thiếu hẳn `task.description`
                        (bug chủ dự án báo 2026-09-16) - giờ Tooltip hiện CẢ 2 mục
                        có nhãn riêng, dòng xem trước ưu tiên Ghi chú (giữ đúng UI
                        cũ khi cả 2 cùng có) nhưng fallback sang Mô tả nếu Task
                        chỉ có Mô tả mà không có Ghi chú (trước đây bị ẩn hẳn). */}
                    {(hasNote || hasDescription) && (
                        <div style={{ minWidth: 0 }}>
                            <Tooltip
                                title={
                                    <div style={{ maxWidth: 280 }}>
                                        {hasDescription && (
                                            <div>
                                                <div style={{ fontWeight: 600 }}>Mô tả:</div>
                                                <div style={{ whiteSpace: 'pre-wrap' }}>{task.description}</div>
                                            </div>
                                        )}
                                        {hasNote && (
                                            <div style={{ marginTop: hasDescription ? 8 : 0 }}>
                                                <div style={{ fontWeight: 600 }}>Ghi chú:</div>
                                                <div style={{ whiteSpace: 'pre-wrap' }}>{task.note}</div>
                                            </div>
                                        )}
                                    </div>
                                }
                            >
                                <Text type="secondary" style={{ fontSize: 12, display: 'block' }} ellipsis>
                                    {task.note || task.description}
                                </Text>
                            </Tooltip>
                        </div>
                    )}
                </div>
                {extra && <div style={{ flexShrink: 0 }}>{extra}</div>}
            </div>

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