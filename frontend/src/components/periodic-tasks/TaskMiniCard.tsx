'use client';

import { Card, Tag, Tooltip, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { TaskAssignees } from './TaskAssignees';
import { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { DEFAULT_ENTITY_COLOR, darkenColor, getTaskCardBackground, resolveEntityColor } from '@/lib/utils/entityColor';
import { useUsersList } from '@/lib/hooks/useUsers';
import { TaskTitlePill, TaskChainBadge } from './TaskTitlePill';
import { TaskChainInfo } from '@/lib/utils/taskLinkChains';
import { LinkifiedText } from '@/components/common/LinkifiedText';
import { PeriodTypeTag } from './PeriodTypeTag';

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

    // BUG THẬT #2 (2026-09-16, chủ dự án gửi ảnh 2 - vẫn tràn chữ dù đã fix
    // #1 ở trên, xảy ra khi Ghi chú/Mô tả là 1 "từ" dài liền không có
    // khoảng trắng để trình duyệt tự ngắt dòng, vd test data toàn "aaaa..."):
    // `Typography.Text ellipsis` của AntD tự set `display: inline-block` nội
    // bộ cho span - với `width: auto`, `inline-block` tính kích thước theo
    // kiểu "shrink-to-fit" (co theo NỘI DUNG, không theo bề rộng cha), nên 1
    // từ dài không chỗ ngắt cứ đẩy span rộng ra vô hạn, `overflow: hidden`
    // hoàn toàn không kịp cắt vì span đã tự nới rộng trước khi bị cắt. Bắt
    // buộc thêm `maxWidth: '100%'` (khác hẳn `width: '100%'` - `maxWidth`
    // mới thật sự GIỚI HẠN trần cho kiểu tính "shrink-to-fit", `width: 100%`
    // không có tác dụng với `inline-block` auto-sizing) thì `overflow:hidden`
    // + `textOverflow:ellipsis` mới có cửa để cắt chữ hiện "...".
    //
    // BUG THẬT #3 (2026-09-16, chủ dự án gửi ảnh 3 - Tooltip nổi LỆCH hẳn
    // khỏi vị trí con trỏ chuột đang hover): dùng `display: 'block'` khiến
    // span chiếm ĐỦ 100% bề rộng div cha (block auto-width = lấp đầy khung
    // cha) dù chữ hiển thị (đã bị ellipsis cắt) chỉ chiếm 1 phần nhỏ bên
    // trái - AntD `Tooltip` định vị theo TOÀN BỘ khung của phần tử trigger
    // (span rộng cả khung, phần lớn là khoảng trống vô hình bên phải), nên
    // Tooltip luôn canh giữa theo khung ĐÓ chứ không theo chữ thật đang thấy,
    // trông như "trôi" sang phải. Đổi `display: 'block'` -> `'inline-block'`
    // (giữ nguyên `maxWidth: '100%'` để không tái phát bug #2) - giờ span co
    // đúng theo ĐỘ RỘNG CHỮ THẬT (bị cắt), Tooltip bám sát đúng vị trí hover.
    const ellipsisTextStyle: React.CSSProperties = {
        fontSize: 12,
        display: 'inline-block',
        maxWidth: '100%',
        verticalAlign: 'top',
    };

    // MỚI (2026-09-25, yêu cầu chủ dự án - áp dụng cho TOÀN BỘ ant-Card Task,
    // vì đây là component DUY NHẤT render Card cho Task ở mọi view): border
    // không còn màu xám cố định nữa, đổi sang lấy ĐÚNG `task.color` (cột màu
    // Task đã chọn - cùng màu đang tô `TaskTitlePill`) rồi làm TỐI hơn 40%
    // (`darkenColor`) để border luôn tương phản rõ với nền pill/nền Card
    // trắng, đồng thời tự nhận diện Task nào cùng nhóm màu ngay từ viền
    // ngoài, không cần nhìn vào pill tiêu đề nữa.
    const resolvedTaskColor = resolveEntityColor(task.color);
    const borderColor = darkenColor(resolvedTaskColor, 0.4);
    // MỚI (2026-09-25, yêu cầu chủ dự án - lượt 2 sau khi xem ảnh Kanban thật):
    // BG từng Task Card dùng `getTaskCardBackground(task.color)` - sáng hơn màu
    // gốc 90% (không phải 50% như lượt đầu, ảnh chụp cho thấy 50% còn đậm, đè
    // chữ đen trong Card), riêng màu quá đậm/gần Đen thì hàm này tự ép về xám
    // trung tính gần trắng thay vì tiếp tục trộn theo tỉ lệ (xem JSDoc hàm).
    const bgColor = getTaskCardBackground(task.color);

    const cardStyle: React.CSSProperties = {
        marginBottom: 14,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        boxShadow: '0 1px 3px rgba(16, 24, 40, 0.06)',
        backgroundColor: bgColor,
        ...style,
    };

    return (
        <Card size={size} style={cardStyle} onClick={onClick} className={className}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 4 }}>
                        <TaskTitlePill title={task.title} color={task.color} />
                        {chainInfo && resolveChainTask && (
                            <TaskChainBadge chain={chainInfo} currentTaskId={task.id} resolveTask={resolveChainTask} />
                        )}
                    </div>
                    {/* Trước đây CHỈ hiện `task.note`, thiếu hẳn `task.description`,
                        và chỉ hiện 1 trong 2 (bug chủ dự án báo 2026-09-16) - giờ
                        hiện RIÊNG từng dòng cho Mô tả và Ghi chú (không ưu tiên/ẩn
                        cái nào), mỗi dòng 1 Tooltip RIÊNG y hệt hành vi hover cũ
                        (hover đúng dòng nào hiện đúng nội dung đầy đủ dòng đó,
                        không gộp chung 1 Tooltip to dễ hiểu lầm là của Task khác
                        khi dòng bị cắt/tràn). Dùng NHÃN CHỮ "Mô tả:"/"Ghi chú:"
                        (không dùng Emoji - phản hồi chủ dự án 2026-09-16: Emoji
                        khó hiểu, hiện thành ô vuông/icon lạ tuỳ font hệ điều
                        hành) ở CẢ dòng xem trước lẫn trong Tooltip.

                        MỚI (2026-09-16, yêu cầu chủ dự án qua ảnh chụp "Xem theo
                        Ngày"): tách riêng nhãn "Mô tả:"/"Ghi chú:" ra `<span>` đậm
                        (fontWeight 600) + to hơn nội dung 1px (13 so với 12) để dễ
                        phân biệt nhãn với nội dung khi lướt nhanh - áp dụng ở CẢ
                        dòng xem trước lẫn Tooltip. Nhãn "Ghi chú:" ép
                        `fontStyle: 'normal'` vì `<Text italic>` cha làm nghiêng cả
                        chữ - nhãn đậm nghiêng cùng lúc khó đọc hơn không nghiêng. */}
                    {hasDescription && (
                        <div style={{ minWidth: 0 }}>
                            <Tooltip
                                title={
                                    <div style={{ maxWidth: 280, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>Mô tả:</span> <LinkifiedText text={task.description ?? ''} linkColor="#69b1ff" />
                                    </div>
                                }
                            >
                                <Text type="secondary" style={ellipsisTextStyle} ellipsis>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: 'rgba(0,0,0,0.75)' }}>Mô tả:</span>{' '}
                                    <LinkifiedText text={task.description ?? ''} />
                                </Text>
                            </Tooltip>
                        </div>
                    )}
                    {hasNote && (
                        <div style={{ minWidth: 0 }}>
                            <Tooltip
                                title={
                                    <div style={{ maxWidth: 280, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>Ghi chú:</span> <LinkifiedText text={task.note ?? ''} linkColor="#69b1ff" />
                                    </div>
                                }
                            >
                                <Text type="secondary" italic style={ellipsisTextStyle} ellipsis>
                                    <span style={{ fontWeight: 600, fontSize: 13, color: 'rgba(0,0,0,0.75)', fontStyle: 'normal' }}>
                                        Ghi chú:
                                    </span>{' '}
                                    <LinkifiedText text={task.note ?? ''} />
                                </Text>
                            </Tooltip>
                        </div>
                    )}
                </div>
                {extra && <div style={{ flexShrink: 0 }}>{extra}</div>}
            </div>

            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                <PeriodTypeTag type={task.periodType} />
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
                </Text>
            </div>
            <div style={{ marginTop: 6 }}>
                <TaskAssignees task={task} />
            </div>

            {footer && <div style={{ marginTop: 8 }}>{footer}</div>}
        </Card>
    );
}