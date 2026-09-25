'use client';

import { useState } from 'react';
import { App, Divider, Empty, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdatePeriodicTask } from '@/lib/hooks/usePeriodicTasks';
import { usePeriodicTaskStatuses } from '@/lib/hooks/usePeriodicTaskStatuses';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import type { UserTasksResult } from '@/lib/api/periodic-task-performance.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { TaskMiniCard } from './TaskMiniCard';
import { TaskChecklistInline } from './TaskChecklistInline';
import { TaskChecklistModal } from './TaskChecklistModal';

const { Text } = Typography;

interface Props {
  data: UserTasksResult | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * UserTasksPanel - danh sách Task ĐẦY ĐỦ (không giới hạn "cần lưu ý") của 1
 * User, tách 2 nhóm "Phụ trách chính"/"Phụ trách phụ" bằng `Divider` (mirror
 * ĐÚNG pattern separator đã dùng cho "Đang làm trở lên"/"Chưa hoàn thành" ở
 * bản Drawer cũ, và pattern gộp nhóm theo Collapse ở `TaskChecklistModal`).
 *
 * Tách riêng khỏi `PerformanceUserTasksDrawer` để DÙNG CHUNG cho 2 chỗ (yêu
 * cầu chủ dự án 2026-09-25):
 *  1. Drawer xem User khác (role cao hơn, xem được bất kỳ lúc nào - không cần
 *     User đó đang có Task "chưa hoàn thành").
 *  2. View "own" nhúng thẳng trên trang (không qua Drawer) khi
 *     `periodic_tasks.performance_view` tắt hoặc scope resolve = 'own' - cần
 *     giao diện CHI TIẾT hơn bảng tổng hợp, khác hẳn bảng tổng hợp.
 *
 * Mỗi Card LUÔN cho đổi trạng thái nhanh + Checklist rút gọn ngay tại chỗ
 * (giữ nguyên hành vi bản Drawer cũ) - quyền sửa vẫn chốt ở BE, FE chỉ
 * disable UI + Tooltip lý do.
 */
export function UserTasksPanel({ data, isLoading, isError }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { can } = useMyPermissions();
  const hasEditPermission = can('periodic_tasks.edit');
  const canEditLocked = can('periodic_tasks.edit_locked');

  const { statuses } = usePeriodicTaskStatuses();
  const updateStatusMutation = useUpdatePeriodicTask();
  const [checklistTask, setChecklistTask] = useState<PeriodicTask | null>(null);

  const invalidatePerformance = () => queryClient.invalidateQueries({ queryKey: ['periodic-task-performance'] });

  const handleStatusChange = (task: PeriodicTask, statusId: number) => {
    updateStatusMutation.mutate(
      { id: task.id, data: { statusId } },
      {
        onSuccess: () => {
          message.success('Đã đổi trạng thái');
          invalidatePerformance();
        },
        onError: (err) => message.error(getApiErrorMessage(err, 'Đổi trạng thái thất bại')),
      },
    );
  };

  const renderTaskCard = (task: PeriodicTask) => {
    const lockBlocksEdit = task.isLocked && !canEditLocked;
    const canEditTask = hasEditPermission && !lockBlocksEdit;
    const isUpdatingThis = updateStatusMutation.isPending && updateStatusMutation.variables?.id === task.id;

    return (
      <TaskMiniCard
        key={task.id}
        task={task}
        footer={
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đổi trạng thái nhanh:
              </Text>
              <Tooltip
                title={
                  !hasEditPermission
                    ? 'Cần quyền "Sửa Công việc định kỳ" để đổi trạng thái.'
                    : lockBlocksEdit
                      ? 'Công việc đang bị khoá - cần quyền "Sửa khi đang khoá".'
                      : undefined
                }
              >
                <Select
                  size="small"
                  style={{ minWidth: 170 }}
                  value={task.statusId}
                  disabled={!canEditTask}
                  loading={isUpdatingThis}
                  onChange={(v) => handleStatusChange(task, v)}
                  options={statuses.map((s) => ({
                    value: s.id,
                    label: (
                      <Tag color={s.color} style={{ marginInlineEnd: 0 }}>
                        {s.name}
                      </Tag>
                    ),
                  }))}
                />
              </Tooltip>
            </div>
            <TaskChecklistInline taskId={task.id} canEdit={canEditTask} onOpenFull={() => setChecklistTask(task)} />
          </div>
        }
      />
    );
  };

  if (isError) return <Text type="danger">Không tải được danh sách. Vui lòng thử lại.</Text>;
  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  const primaryTasks = data?.primaryTasks ?? [];
  const secondaryTasks = data?.secondaryTasks ?? [];

  if (primaryTasks.length === 0 && secondaryTasks.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có công việc nào trong khoảng đã chọn" style={{ padding: 48 }} />;
  }

  return (
    <>
      <Divider titlePlacement="left" styles={{ content: { margin: 0 } }} style={{ marginTop: 0 }}>
        <Text strong>Phụ trách chính ({primaryTasks.length})</Text>
      </Divider>
      {primaryTasks.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Không có Task nào ở vai trò Phụ trách chính.
        </Text>
      ) : (
        primaryTasks.map(renderTaskCard)
      )}

      <Divider titlePlacement="left" styles={{ content: { margin: 0 } }}>
        <Text strong>Phụ trách phụ ({secondaryTasks.length})</Text>
      </Divider>
      {secondaryTasks.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Không có Task nào được thêm làm Phụ trách phụ.
        </Text>
      ) : (
        secondaryTasks.map(renderTaskCard)
      )}

      <TaskChecklistModal open={!!checklistTask} onClose={() => setChecklistTask(null)} task={checklistTask} />
    </>
  );
}
