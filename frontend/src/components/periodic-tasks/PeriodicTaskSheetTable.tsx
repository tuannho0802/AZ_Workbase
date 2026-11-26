'use client';

import { useMemo } from 'react';
import { Tag, Tooltip, Typography, theme } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { TaskActionsBar, TaskActionsBarProps } from './TaskActionsBar';
import { TaskChainBadge } from './TaskTitlePill';
import { LinkifiedText } from '@/components/common/LinkifiedText';
import { getTaskCardBackground, resolveEntityColor } from '@/lib/utils/entityColor';
import { getOverdueDays, isPastPeriodEnd, isManualOverdueActive, isTaskOverdue } from '@/lib/utils/periodicTaskOverdue';
import { extractSheetLinks, groupTasksByAssignee, sheetNameColor, stripUrls } from '@/lib/utils/taskSheet';
import { sortTasksByPeriodHierarchy, TaskChainInfo } from '@/lib/utils/taskLinkChains';

const { Text } = Typography;

type ActionHandlers = Pick<
    TaskActionsBarProps,
    'canEdit' | 'canEditLocked' | 'canApprove' | 'canDelete' | 'onLink' | 'onChecklist' | 'onCustomers' | 'onAudit' | 'onEdit' | 'onLock' | 'onUnlock' | 'onDelete'
> & { isUnlocking: (taskId: number) => boolean };

export interface PeriodicTaskSheetTableProps extends ActionHandlers {
    /** Task của ĐÚNG 1 ngày (panel Agenda). */
    tasks: PeriodicTask[];
    iconActions?: boolean;
    chains?: Map<number, TaskChainInfo>;
    resolveChainTask?: (taskId: number) => Pick<PeriodicTask, 'title' | 'periodStartDate'> | undefined;
}

const HEADERS = ['TÊN', 'NỘI DUNG CÔNG VIỆC', 'TIẾN ĐỘ CÔNG VIỆC', 'LINK SẢN PHẨM', 'GHI CHÚ', 'NGÀY THỰC HIỆN', 'DEADLINE', 'TÌNH TRẠNG', 'THAO TÁC'] as const;

/** Ô "Tình trạng": Đã xong / Quá hạn N ngày / Quá deadline / Trong hạn (cùng ngưỡng với cờ quá hạn ở TaskMiniCard). */
function TaskState({ task }: { task: PeriodicTask }) {
    if (task.status?.isDoneState) return <Tag color="success" style={{ margin: 0 }}>Đã xong</Tag>;
    if (isTaskOverdue(task) || isManualOverdueActive(task)) {
        return <Tag color="error" style={{ margin: 0 }}>Quá hạn {getOverdueDays(task)} ngày</Tag>;
    }
    if (isPastPeriodEnd(task)) return <Tag color="warning" style={{ margin: 0 }}>Quá deadline</Tag>;
    return <Tag color="processing" style={{ margin: 0 }}>Trong hạn</Tag>;
}

/**
 * Bảng KIỂU SHEET cho 1 ngày (Xem theo Ngày): gom theo Người phụ trách chính (ô TÊN gộp dòng, màu riêng từng người),
 * mỗi Task 1 dòng: Nội dung | Tiến độ (ô tô màu trạng thái) | Link sản phẩm (URL trong Mô tả) | Ghi chú | Ngày thực hiện |
 * Deadline | Tình trạng | Thao tác. Chỉ đổi cách HIỂN THỊ - dữ liệu/RBAC/nút thao tác giữ nguyên (TaskActionsBar dùng chung).
 */
export function PeriodicTaskSheetTable({ tasks, iconActions = true, chains, resolveChainTask, ...actions }: PeriodicTaskSheetTableProps) {
    const { token } = theme.useToken();
    const groups = useMemo(() => {
        const ordered = chains ? sortTasksByPeriodHierarchy(tasks, chains) : tasks;
        return groupTasksByAssignee(ordered);
    }, [tasks, chains]);

    const border = `1px solid ${token.colorBorder}`;
    const th: React.CSSProperties = { border, padding: '6px 8px', background: token.colorFillTertiary, fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' };
    const td: React.CSSProperties = { border, padding: '6px 8px', verticalAlign: 'middle', wordBreak: 'break-word' };

    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr>
                        {HEADERS.map((h) => (
                            <th key={h} style={th}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {groups.map((g) =>
                        g.tasks.map((task, idx) => {
                            const links = extractSheetLinks(task.description);
                            const descText = stripUrls(task.description);
                            const chain = chains?.get(task.id);
                            const statusColor = resolveEntityColor(task.status?.color);
                            const secondary = task.secondaryAssignees ?? [];
                            return (
                                <tr key={task.id}>
                                    {idx === 0 && (
                                        <td rowSpan={g.tasks.length} style={{ ...td, background: sheetNameColor(g.assigneeId), color: '#fff', fontWeight: 700, textAlign: 'center', minWidth: 110 }}>
                                            {g.assigneeName.toUpperCase()}
                                        </td>
                                    )}
                                    <td style={{ ...td, background: getTaskCardBackground(task.color), minWidth: 220 }}>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                            <Text strong style={{ whiteSpace: 'pre-wrap' }}>{task.title}</Text>
                                            {task.isLocked && (
                                                <Tooltip title="Đã khoá">
                                                    <LockOutlined aria-label="Đã khoá" style={{ color: token.colorTextSecondary }} />
                                                </Tooltip>
                                            )}
                                            {chain && resolveChainTask && <TaskChainBadge chain={chain} currentTaskId={task.id} resolveTask={resolveChainTask} />}
                                        </div>
                                        {descText && <div style={{ color: token.colorTextSecondary, whiteSpace: 'pre-wrap' }}>{descText}</div>}
                                        {secondary.length > 0 && (
                                            <div style={{ color: token.colorTextSecondary, fontSize: 12 }}>Phụ trách phụ: {secondary.map((u) => u.name).join(', ')}</div>
                                        )}
                                    </td>
                                    <td style={{ ...td, background: statusColor, color: '#fff', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', minWidth: 120 }}>
                                        {task.status?.name ?? '—'}
                                    </td>
                                    <td style={{ ...td, minWidth: 150 }}>
                                        {links.length === 0 ? null : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                {links.map((l) => (
                                                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" title={l.url} style={{ textDecoration: 'underline' }}>
                                                        {l.label}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...td, minWidth: 140 }}>{task.note ? <LinkifiedText text={task.note} /> : null}</td>
                                    <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>{dayjs(task.periodStartDate).format('DD/MM/YYYY')}</td>
                                    <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}>{dayjs(task.periodEndDate).format('DD/MM/YYYY')}</td>
                                    <td style={{ ...td, textAlign: 'center', whiteSpace: 'nowrap' }}><TaskState task={task} /></td>
                                    <td style={{ ...td, minWidth: 120 }}>
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
                                            iconOnly={iconActions}
                                        />
                                    </td>
                                </tr>
                            );
                        }),
                    )}
                </tbody>
            </table>
        </div>
    );
}
