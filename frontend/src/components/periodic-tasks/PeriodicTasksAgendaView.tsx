'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Collapse, Badge, Tag, Typography, Empty, Spin } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { TaskMiniCard } from './TaskMiniCard';
import { TaskActionsBar, TaskActionsBarProps } from './TaskActionsBar';

dayjs.locale('vi');

const { Text } = Typography;

type ActionHandlers = Pick<
    TaskActionsBarProps,
    'canEdit' | 'canEditLocked' | 'canApprove' | 'canDelete' | 'onLink' | 'onChecklist' | 'onAudit' | 'onEdit' | 'onLock' | 'onUnlock' | 'onDelete'
> & {
    isUnlocking: (taskId: number) => boolean;
};

export interface PeriodicTasksAgendaViewProps extends ActionHandlers {
    tasks: PeriodicTask[];
    loading?: boolean;
}

/**
 * PeriodicTasksAgendaView - View 1 (Phase 8, PLAN mục Phase 8 "Cải tiến view
 * switcher"). Nhóm `tasks` theo `periodStartDate` (Y-M-D), mỗi ngày 1 panel
 * Collapse gập/mở, mặc định GẬP HẾT trừ panel khớp HÔM NAY - nếu hôm nay
 * không có Task nào, tự mở panel ngày GẦN NHẤT SẮP TỚI (tương lai gần nhất);
 * nếu không còn ngày nào trong tương lai (toàn bộ Task đã ở quá khứ), mở
 * panel ngày GẦN NHẤT ĐÃ QUA (mới nhất trong quá khứ) để không mở lên trống
 * trơn. Chỉ tính toán mặc định NGAY LẦN ĐẦU dữ liệu tải xong - không tự đóng
 * lại panel người dùng vừa mở tay khi `tasks` refetch lại (vd sau khi Sửa 1
 * Task) - xem `hasSetDefaultRef` bên dưới.
 *
 * KHÔNG tự lọc/phân trang lại - nhận nguyên `tasks` đã được BE áp RBAC +
 * filter từ trang cha (`cong-viec-dinh-ky/page.tsx`), mirror đúng nguyên tắc
 * "FE chỉ việc gọi bình thường" ở JSDoc đầu file đó.
 */
export function PeriodicTasksAgendaView({ tasks, loading, ...actions }: PeriodicTasksAgendaViewProps) {
    const groups = useMemo(() => {
        const map = new Map<string, PeriodicTask[]>();
        for (const t of tasks) {
            const key = dayjs(t.periodStartDate).format('YYYY-MM-DD');
            const arr = map.get(key) ?? [];
            arr.push(t);
            map.set(key, arr);
        }
        // Sắp xếp key tăng dần theo ngày (gần nhất trước).
        return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    }, [tasks]);

    const [activeKeys, setActiveKeys] = useState<string[]>([]);
    // Chỉ set mặc định 1 LẦN DUY NHẤT (lần đầu có dữ liệu) - tránh việc mỗi
    // lần `tasks` refetch (vd sau khi Sửa/Khoá 1 Task) lại đè mất panel người
    // dùng đang mở tay.
    const hasSetDefaultRef = useRef(false);

    useEffect(() => {
        if (hasSetDefaultRef.current || groups.length === 0) return;
        const todayKey = dayjs().format('YYYY-MM-DD');
        const keys = groups.map(([key]) => key);
        let defaultKey: string;
        if (keys.includes(todayKey)) {
            defaultKey = todayKey;
        } else {
            const nextFuture = keys.find((key) => key > todayKey);
            defaultKey = nextFuture ?? keys[keys.length - 1];
        }
        setActiveKeys([defaultKey]);
        hasSetDefaultRef.current = true;
    }, [groups]);

    if (loading) {
        return (
            <div style={{ padding: 48, textAlign: 'center' }}>
                <Spin />
            </div>
        );
    }

    if (groups.length === 0) {
        return <Empty description="Không có Công việc nào khớp bộ lọc" style={{ padding: 48 }} />;
    }

    const todayKey = dayjs().format('YYYY-MM-DD');

    return (
        <Collapse
            activeKey={activeKeys}
            onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys : [keys])}
            items={groups.map(([dateKey, groupTasks]) => {
                const isToday = dateKey === todayKey;
                const doneCount = groupTasks.filter((t) => t.status?.isDoneState).length;
                return {
                    key: dateKey,
                    label: (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text strong>{dayjs(dateKey).format('dddd, DD/MM/YYYY')}</Text>
                            {isToday && <Tag color="blue">Hôm nay</Tag>}
                            <Badge count={groupTasks.length} color="#1890ff" showZero />
                            {doneCount > 0 && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {doneCount}/{groupTasks.length} đã xong
                                </Text>
                            )}
                        </span>
                    ),
                    children: groupTasks.map((task) => (
                        <TaskMiniCard
                            key={task.id}
                            task={task}
                            footer={
                                <TaskActionsBar
                                    task={task}
                                    canEdit={actions.canEdit}
                                    canEditLocked={actions.canEditLocked}
                                    canApprove={actions.canApprove}
                                    canDelete={actions.canDelete}
                                    onLink={actions.onLink}
                                    onChecklist={actions.onChecklist}
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
                    )),
                };
            })}
        />
    );
}
