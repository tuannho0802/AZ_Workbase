'use client';

import { useMemo } from 'react';
import { Calendar, Tag, Tooltip, Badge, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { PeriodicTask, PERIOD_TYPE_LABELS } from '@/lib/api/periodic-tasks.api';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { TaskChainInfo } from '@/lib/utils/taskLinkChains';

const { Text } = Typography;

export interface PeriodicTasksCalendarViewProps {
    tasks: PeriodicTask[];
    /** Mở modal Sửa của trang cha - CHỈ gọi khi `canEdit` (page cha tự kiểm
     * tra trước khi truyền prop này, mirror `TaskActionsBar`/nút "Sửa"). Khi
     * không có quyền sửa, click Tag chỉ hiện Tooltip chi tiết (không làm gì
     * thêm) - không truyền `onSelectTask` trong trường hợp đó. */
    onSelectTask?: (task: PeriodicTask) => void;
    /** Phase 8 - xem JSDoc tương ứng ở `PeriodicTasksAgendaViewProps`. Lưới
     * ngày KHÔNG phải khối dọc liên tục nên không vẽ được đường nối như
     * Agenda - chỉ tô viền màu chuỗi lên Tag + liệt kê trong Tooltip. */
    chains?: Map<number, TaskChainInfo>;
    resolveChainTask?: (taskId: number) => Pick<PeriodicTask, 'title' | 'periodStartDate'> | undefined;
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
export function PeriodicTasksCalendarView({ tasks, onSelectTask, chains, resolveChainTask }: PeriodicTasksCalendarViewProps) {
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
                {dayTasks.slice(0, 3).map((task) => {
                    const chain = chains?.get(task.id);
                    return (
                        <Tooltip
                            key={task.id}
                            title={
                                <>
                                    <div>{task.title}</div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                                        {PERIOD_TYPE_LABELS[task.periodType]} · {task.status?.name ?? '—'} ·{' '}
                                        {task.primaryAssignee?.name ?? '—'}
                                    </div>
                                    {/* Trước đây thiếu HẲN Mô tả/Ghi chú ở Calendar (bug chủ
                                        dự án báo 2026-09-16) - thêm để đồng nhất với
                                        TaskMiniCard (Kanban/Agenda) và Table gốc. */}
                                    {task.description && (
                                        <div style={{ fontSize: 12, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 4, maxWidth: 240, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                            <strong>Mô tả:</strong> {task.description}
                                        </div>
                                    )}
                                    {task.note && (
                                        <div style={{ fontSize: 12, marginTop: 4, borderTop: task.description ? undefined : '1px solid rgba(255,255,255,0.2)', paddingTop: 4, maxWidth: 240, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                            <strong>Ghi chú:</strong> {task.note}
                                        </div>
                                    )}
                                    {chain && resolveChainTask && (
                                        <div style={{ fontSize: 12, marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 4 }}>
                                            <LinkOutlined /> Chuỗi liên kết ({chain.memberIds.length} Công việc):
                                            {chain.memberIds.map((id) => {
                                                const t = resolveChainTask(id);
                                                return (
                                                    <div key={id} style={{ opacity: id === task.id ? 1 : 0.8 }}>
                                                        {id === task.id ? '➤ ' : '• '}
                                                        {t ? `${t.title} (${dayjs(t.periodStartDate).format('DD/MM')})` : `Công việc #${id}`}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            }
                        >
                            <Tag
                                color={resolveEntityColor(task.color)}
                                style={{
                                    margin: 0,
                                    cursor: onSelectTask ? 'pointer' : 'default',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '100%',
                                    borderRadius: 4,
                                    fontWeight: 500,
                                    // Phase 8: viền màu chuỗi liên kết (khác hẳn màu nền của Tag,
                                    // dùng `boxShadow` inset thay vì `border` để không đổi kích
                                    // thước Tag) - CHỈ hiện khi Task thuộc 1 chuỗi >= 2 thành viên.
                                    boxShadow: chain ? `inset 0 0 0 2px ${chain.color}` : undefined,
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectTask?.(task);
                                }}
                            >
                                {chain && <LinkOutlined style={{ marginRight: 3, fontSize: 10 }} />}
                                {task.title}
                            </Tag>
                        </Tooltip>
                    );
                })}
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