'use client';

import { Tag, Tooltip } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { TaskChainInfo } from '@/lib/utils/taskLinkChains';
import dayjs from 'dayjs';

export interface TaskTitlePillProps {
    title: string;
    /** `task.color` (hex) - "màu được chọn" của chính Task (xem JSDoc field
     * ở `periodic-tasks.api.ts`: "CHỈ dùng hiển thị UI (Card/Kanban/
     * Calendar...)") - gộp thẳng vào tên thay vì tách riêng 1 chấm tròn như
     * trước, style Pill nhưng bo góc NHẸ (không tròn hẳn như viên thuốc) -
     * đúng yêu cầu chủ dự án 2026-09-15. */
    color?: string | null;
    style?: React.CSSProperties;
    /** Giới hạn số ký tự hiển thị - vượt quá sẽ cắt và thêm "…", kèm Tooltip
     * hiện đầy đủ tiêu đề khi hover. Chỉ dùng ở nơi cần TRIM cứng (vd Tab
     * "Bảng" - cột "Công việc" rộng cố định 260px, tiêu đề rất dài từng đẩy
     * hàng cao bất thường do `whiteSpace: 'normal'` tự xuống dòng không giới
     * hạn). Không truyền = giữ hành vi cũ (wrap tự do, không cắt) - dùng cho
     * TaskMiniCard (Agenda/Kanban/Calendar) nơi Card đã tự co giãn theo nội
     * dung, không cần trim. */
    maxLength?: number;
}

/** TaskTitlePill - dùng CHUNG cho Table/TaskMiniCard (Agenda/Kanban)/Calendar
 * (Phase 8) để tên Task hiển thị ĐỒNG NHẤT 1 kiểu Pill màu ở mọi View, thay
 * cho cách cũ mỗi nơi 1 kiểu (chấm tròn ở Table/Card, Tag riêng ở Calendar). */
export function TaskTitlePill({ title, color, style, maxLength }: TaskTitlePillProps) {
    const isTruncated = typeof maxLength === 'number' && title.length > maxLength;
    const displayTitle = isTruncated ? `${title.slice(0, maxLength)}…` : title;

    const tag = (
        <Tag
            color={resolveEntityColor(color)}
            style={{
                fontWeight: 500,
                borderRadius: 4, // "không tròn lắm" - bo nhẹ, không phải hình viên thuốc (pill tròn hẳn)
                margin: 0,
                whiteSpace: 'normal',
                lineHeight: 1.4,
                padding: '2px 8px',
                // BUG THẬT (2026-09-16, chữ tràn ra ngoài Card ở Kanban): `Tag`
                // mặc định là `inline-block`, không tự co theo bề rộng cha dù
                // đã có `whiteSpace: normal` - khi tiêu đề dài, Tag cứ nới rộng
                // theo chữ thay vì XUỐNG DÒNG, tràn khỏi mép Card 300px. Bắt
                // buộc `maxWidth: 100%` + `boxSizing: border-box` để Tag tự
                // giới hạn theo cha rồi mới wrap chữ bên trong đúng như kỳ vọng.
                maxWidth: '100%',
                boxSizing: 'border-box',
                ...style,
            }}
        >
            {displayTitle}
        </Tag>
    );

    if (!isTruncated) return tag;

    return (
        <Tooltip title={<div style={{ maxWidth: 280, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{title}</div>}>
            {tag}
        </Tooltip>
    );
}

export interface TaskChainBadgeProps {
    chain: TaskChainInfo;
    /** ID của chính Task đang hiển thị badge này - dùng để loại trừ khỏi
     * danh sách "liên kết với" trong Tooltip (không cần tự liệt kê chính nó). */
    currentTaskId: number;
    /** Tra tiêu đề/ngày hiển thị cho từng `memberId` trong chuỗi - CHỈ có dữ
     * liệu cho thành viên đang nằm trong `tasks` đã tải của View hiện tại
     * (thành viên khác trang/khác bộ lọc sẽ hiện "Task #id" trơn, KHÔNG ẩn
     * hẳn khỏi danh sách vì vẫn muốn người dùng biết chuỗi có bao nhiêu Task). */
    resolveTask: (taskId: number) => Pick<PeriodicTask, 'title' | 'periodStartDate'> | undefined;
}

/** TaskChainBadge - chấm nhỏ + icon 🔗, hover hiện Tooltip liệt kê CẢ chuỗi
 * (Phase 8) - dùng cho những nơi không tiện vẽ đường nối liên tục (Calendar,
 * hoặc khi các thành viên KHÔNG nằm cùng 1 khối hiển thị liền kề - vd khác
 * ngày ở Agenda, khác cột Trạng thái ở Kanban). */
export function TaskChainBadge({ chain, currentTaskId, resolveTask }: TaskChainBadgeProps) {
    const others = chain.memberIds.filter((id) => id !== currentTaskId);
    return (
        <Tooltip
            title={
                <div>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>
                        Chuỗi liên kết ({chain.memberIds.length} Công việc):
                    </div>
                    {chain.memberIds.map((id) => {
                        const t = resolveTask(id);
                        const isCurrent = id === currentTaskId;
                        return (
                            <div key={id} style={{ opacity: isCurrent ? 1 : 0.85 }}>
                                {isCurrent ? '➤ ' : '• '}
                                {t ? t.title : `Công việc #${id}`}
                                {t && (
                                    <span style={{ opacity: 0.7 }}> · {dayjs(t.periodStartDate).format('DD/MM')}</span>
                                )}
                                {isCurrent && ' (đang xem)'}
                            </div>
                        );
                    })}
                </div>
            }
        >
            <Tag
                icon={<LinkOutlined />}
                color={chain.color}
                style={{ margin: 0, cursor: 'default', fontSize: 11, lineHeight: '16px', padding: '0 6px' }}
            >
                {others.length}
            </Tag>
        </Tooltip>
    );
}