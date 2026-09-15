'use client';

import { useMemo } from 'react';
import { Calendar, Tag, Tooltip, Badge, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { PeriodicTask, PERIOD_TYPE_LABELS } from '@/lib/api/periodic-tasks.api';
import { DEFAULT_ENTITY_COLOR } from '@/lib/utils/entityColor';

const { Text } = Typography;

export interface PeriodicTasksCalendarViewProps {
    tasks: PeriodicTask[];
    /** Mở modal Sửa của trang cha - CHỈ gọi khi `canEdit` (page cha tự kiểm
     * tra trước khi truyền prop này, mirror `TaskActionsBar`/nút "Sửa"). Khi
     * không có quyền sửa, click Tag chỉ hiện Tooltip chi tiết (không làm gì
     * thêm) - không truyền `onSelectTask` trong trường hợp đó. */
    onSelectTask?: (task: PeriodicTask) => void;
}

/**
 * PeriodicTasksCalendarView - View 3 (Phase 8, PLAN mục Phase 8). Dùng
 * NGUYÊN component `Calendar` có sẵn của antd (không cài thêm thư viện nào -
 * chi phí thấp nhất trong 4 view đề xuất, xem research). 1 Task loại 'Ngày'
 * (periodType='daily') phủ ĐÚNG 1 ô; loại Tuần/Tháng/Năm phủ NHIỀU ô liên
 * tiếp (từ `periodStartDate` đến `periodEndDate`) - hiển thị lặp lại Tag ở
 * MỖI ngày trong khoảng đó (KHÔNG vẽ thanh range như Timeline/Gantt thật -
 * đó là View 4, đã lùi lại theo đúng research, xem PLAN).
 *
 * Không phân trang - nhận `tasks` đã tải với `limit` đủ lớn từ trang cha
 * (mirror Agenda/Kanban, xem `page.tsx` phần chọn `viewLimit`).
 */
export function PeriodicTasksCalendarView({ tasks, onSelectTask }: PeriodicTasksCalendarViewProps) {
    // Index theo NGÀY (YYYY-MM-DD) -> danh sách Task phủ ngày đó. Tính 1 lần
    // cho toàn bộ `tasks` hiện có (quy mô dự án hiện tại nhỏ - vài chục Task
    // - lặp qua từng ngày trong khoảng của mỗi Task là đủ rẻ, không cần tối
    // ưu thêm theo tháng đang xem).
    const tasksByDate = useMemo(() => {
        const map = new Map<string, PeriodicTask[]>();
        for (const task of tasks) {
            let cursor = dayjs(task.periodStartDate);
            const end = dayjs(task.periodEndDate);
            // Chặn vòng lặp vô hạn nếu dữ liệu lỗi (end < start) - tối đa 366
            // ngày/Task là đủ dùng cho periodType='yearly' (loại dài nhất).
            let guard = 0;
            while ((cursor.isBefore(end) || cursor.isSame(end, 'day')) && guard < 366) {
                const key = cursor.format('YYYY-MM-DD');
                const arr = map.get(key) ?? [];
                arr.push(task);
                map.set(key, arr);
                cursor = cursor.add(1, 'day');
                guard += 1;
            }
        }
        return map;
    }, [tasks]);

    const cellRender = (date: Dayjs) => {
        const dayTasks = tasksByDate.get(date.format('YYYY-MM-DD')) ?? [];
        if (dayTasks.length === 0) return null;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayTasks.slice(0, 3).map((task) => (
                    <Tooltip
                        key={task.id}
                        title={
                            <>
                                <div>{task.title}</div>
                                <div style={{ fontSize: 12, opacity: 0.8 }}>
                                    {PERIOD_TYPE_LABELS[task.periodType]} · {task.status?.name ?? '—'} ·{' '}
                                    {task.primaryAssignee?.name ?? '—'}
                                </div>
                            </>
                        }
                    >
                        <Tag
                            color={task.status?.color ?? DEFAULT_ENTITY_COLOR}
                            style={{
                                margin: 0,
                                cursor: onSelectTask ? 'pointer' : 'default',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%',
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelectTask?.(task);
                            }}
                        >
                            {task.title}
                        </Tag>
                    </Tooltip>
                ))}
                {dayTasks.length > 3 && (
                    <Badge
                        count={`+${dayTasks.length - 3}`}
                        style={{ backgroundColor: '#f0f0f0', color: 'rgba(0,0,0,0.65)' }}
                    />
                )}
            </div>
        );
    };

    return (
        <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                Mỗi ô hiển thị Công việc có Kỳ hạn phủ ngày đó {onSelectTask ? '- bấm vào tên để sửa nhanh.' : '.'}
            </Text>
            <Calendar cellRender={(date, info) => (info.type === 'date' ? cellRender(date) : info.originNode)} />
        </div>
    );
}
