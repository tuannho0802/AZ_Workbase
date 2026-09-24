'use client';

import { Tag, Tooltip } from 'antd';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
import { useRoleColorMap } from '@/lib/hooks/useRoleColorMap';

interface Props {
    task: Pick<PeriodicTask, 'primaryAssignee' | 'secondaryAssignees'>;
    /**
     * `card` (mặc định): `UserMiniCard` chữ nhỏ, không Tag Vai trò - dùng ở Bảng/Ngày/Kanban.
     * `text`: chữ thuần "Chính · +Phụ A, Phụ B" - dùng ở chỗ hẹp/nền tối (Tooltip của Lịch).
     */
    variant?: 'card' | 'text';
}

const MAX_SECONDARY_SHOWN = 2;
const getRoleNameNoop = () => '';

/**
 * TaskAssignees - hiện Phụ trách CHÍNH + các Phụ trách PHỤ của 1 Task, dùng CHUNG cho
 * mọi view. `secondaryAssignees` do `GET /periodic-tasks` đính sẵn (1 query gom nhóm).
 *
 * Quy tắc hiển thị (yêu cầu chủ dự án):
 *  - Không có phụ trách phụ -> CHỈ card của người chính, KHÔNG có Tag.
 *  - Có phụ trách phụ -> card người chính kèm Tag "Phụ trách chính", rồi tới card từng
 *    người phụ (tối đa `MAX_SECONDARY_SHOWN`, còn lại gộp "+N" có Tooltip đủ danh sách).
 * Card không hiện Vai trò/Phòng ban (list chỉ có `{id,name}` và cần gọn).
 */
export function TaskAssignees({ task, variant = 'card' }: Props) {
    const { getRoleColor } = useRoleColorMap();
    const primaryName = task.primaryAssignee?.name ?? '—';
    const secondary = task.secondaryAssignees ?? [];
    const hasSecondary = secondary.length > 0;
    const shown = secondary.slice(0, MAX_SECONDARY_SHOWN);
    const hiddenCount = secondary.length - shown.length;

    if (variant === 'text') {
        return (
            <>
                {primaryName}
                {hasSecondary && (
                    <Tooltip title={`Phụ trách phụ: ${secondary.map((u) => u.name).join(', ')}`}>
                        <span style={{ opacity: 0.85 }}>
                            {' · '}+{shown.map((u) => u.name).join(', ')}
                            {hiddenCount > 0 ? ` +${hiddenCount}` : ''}
                        </span>
                    </Tooltip>
                )}
            </>
        );
    }

    // Card "vuông" (bo góc nhỏ + Avatar vuông); Tag "Phụ trách chính" nằm TRONG card người chính
    // (qua `subtitle`) thay vì tách rời bên ngoài.
    const card = (name: string, subtitle?: React.ReactNode) => (
        <UserMiniCard
            name={name}
            hideRoleTag
            nameFontSize={11}
            borderRadius={6}
            avatarShape="square"
            subtitle={subtitle}
            getRoleColor={getRoleColor}
            getRoleName={getRoleNameNoop}
        />
    );

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, minWidth: 0 }}>
            {card(
                primaryName,
                hasSecondary ? (
                    <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                        Phụ trách chính
                    </Tag>
                ) : undefined,
            )}
            {shown.map((u) => (
                <span key={u.id}>{card(u.name)}</span>
            ))}
            {hiddenCount > 0 && (
                <Tooltip title={`Phụ trách phụ: ${secondary.map((u) => u.name).join(', ')}`}>
                    <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, borderRadius: 6 }}>+{hiddenCount}</Tag>
                </Tooltip>
            )}
        </div>
    );
}
