'use client';

import { Button, Space, Tooltip, Popconfirm } from 'antd';
import {
    ApartmentOutlined,
    CheckSquareOutlined,
    HistoryOutlined,
    TeamOutlined,
    EditOutlined,
    LockOutlined,
    UnlockOutlined,
    DeleteOutlined,
} from '@ant-design/icons';
import { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { getChecklistProgress, getChecklistTone } from '@/lib/utils/checklistProgress';

/**
 * TaskActionsBar - nhóm nút Thao tác cho 1 `PeriodicTask`, tách ra từ cột
 * "Thao tác" gốc ở `cong-viec-dinh-ky/page.tsx` (Phase 1-7) để Phase 8 (view
 * switcher - PLAN mục Phase 8) tái dùng NGUYÊN VẸN cho Agenda/Kanban/Calendar,
 * tránh 4 nơi tự viết lại logic RBAC (dễ lệch nhau, đúng nguyên tắc "sửa 1
 * chỗ" của dự án). KHÔNG tự tính permission - nhận sẵn `canEdit`/`canApprove`/
 * `canDelete` từ trang cha (đã gọi `useMyPermissions()` 1 lần duy nhất).
 *
 * Nút "Liên kết"/"Checklist"/"Lịch sử" LUÔN hiện (chỉ cần `periodic_tasks.view`
 * - ai đứng được ở trang này cũng có), mirror đúng hành vi cột gốc.
 */
export interface TaskActionsBarProps {
    task: PeriodicTask;
    canEdit: boolean;
    canEditLocked: boolean;
    canApprove: boolean;
    /** boolean, hoặc hàm theo từng Task (xoá theo scope 'own' cần biết Task của ai). */
    canDelete: boolean | ((task: PeriodicTask) => boolean);
    onLink: (task: PeriodicTask) => void;
    onChecklist: (task: PeriodicTask) => void;
    /** Mở modal "Khách hàng liên quan". Nút chỉ hiện khi có prop này VÀ `task.customerCount > 0`. */
    onCustomers?: (task: PeriodicTask) => void;
    onAudit: (task: PeriodicTask) => void;
    onEdit: (task: PeriodicTask) => void;
    onLock: (task: PeriodicTask) => void;
    onUnlock: (task: PeriodicTask) => void;
    onDelete: (task: PeriodicTask) => void;
    /** Đang gọi PATCH .../unlock cho ĐÚNG task này (mirror check
     * `unlockMutation.variables === record.id` ở page gốc). */
    unlockLoading?: boolean;
    size?: 'small' | 'middle';
    /** Cho phép nút xuống dòng (dùng ở Card hẹp của Agenda/Kanban) thay vì
     * tràn ngang như ở Table gốc. */
    wrap?: boolean;
}

export function TaskActionsBar({
    task,
    canEdit,
    canEditLocked,
    canApprove,
    canDelete,
    onLink,
    onChecklist,
    onCustomers,
    onAudit,
    onEdit,
    onLock,
    onUnlock,
    onDelete,
    unlockLoading,
    size = 'small',
    wrap = false,
}: TaskActionsBarProps) {
    // Phase 5 (PLAN mục 2.9) - Task khoá mà thiếu `edit_locked` -> vẫn HIỆN
    // nút Sửa (biết mình có periodic_tasks.edit) nhưng disable kèm Tooltip,
    // tránh gọi PATCH ăn 403 mới biết - mirror ĐÚNG cột gốc.
    const editDisabled = task.isLocked && !canEditLocked;
    const checklistProgress = getChecklistProgress(task);

    return (
        <Space size="small" wrap={wrap}>
            <Button size={size} icon={<ApartmentOutlined />} onClick={() => onLink(task)}>
                Liên kết
            </Button>
            {checklistProgress ? (
                // Nhãn "X/Z" + màu theo tiến độ (đỏ < 1/2, vàng >= 1/2, xanh khi xong đủ) -
                // xem `getChecklistTone()`. Dùng `color` preset của antd v6 nên hover/focus vẫn đúng chuẩn.
                <Tooltip title={`Đã hoàn thành ${checklistProgress.done}/${checklistProgress.total} mục checklist`}>
                    <Button
                        size={size}
                        color={getChecklistTone(checklistProgress)}
                        variant="outlined"
                        icon={<CheckSquareOutlined />}
                        onClick={() => onChecklist(task)}
                    >
                        Checklist {checklistProgress.done}/{checklistProgress.total}
                    </Button>
                </Tooltip>
            ) : (
                <Button size={size} icon={<CheckSquareOutlined />} onClick={() => onChecklist(task)}>
                    Checklist
                </Button>
            )}
            {onCustomers && (task.customerCount ?? 0) > 0 && (
                <Button size={size} icon={<TeamOutlined />} onClick={() => onCustomers(task)}>
                    Khách hàng ({task.customerCount})
                </Button>
            )}
            <Button size={size} icon={<HistoryOutlined />} onClick={() => onAudit(task)}>
                Lịch sử
            </Button>
            {canEdit && (
                <Tooltip title={editDisabled ? 'Công việc đang bị khoá - cần quyền "Sửa khi đang khoá"' : ''}>
                    <Button size={size} icon={<EditOutlined />} disabled={editDisabled} onClick={() => onEdit(task)}>
                        Sửa
                    </Button>
                </Tooltip>
            )}
            {canApprove &&
                (task.isLocked ? (
                    <Popconfirm
                        title="Mở khoá Công việc này?"
                        onConfirm={() => onUnlock(task)}
                        okText="Mở khoá"
                        cancelText="Huỷ"
                    >
                        <Button size={size} icon={<UnlockOutlined />} loading={unlockLoading}>
                            Mở khoá
                        </Button>
                    </Popconfirm>
                ) : (
                    <Button size={size} icon={<LockOutlined />} onClick={() => onLock(task)}>
                        Khoá
                    </Button>
                ))}
            {(typeof canDelete === 'function' ? canDelete(task) : canDelete) && (
                <Button size={size} danger icon={<DeleteOutlined />} onClick={() => onDelete(task)}>
                    Xoá
                </Button>
            )}
        </Space>
    );
}
