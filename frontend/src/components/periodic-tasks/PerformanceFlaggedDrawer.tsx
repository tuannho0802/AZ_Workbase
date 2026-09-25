'use client';

import { useState } from 'react';
import { App, Alert, Divider, Drawer, Empty, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useUserFlaggedTasks } from '@/lib/hooks/usePeriodicTaskPerformance';
import { usePeriodicTaskStatuses } from '@/lib/hooks/usePeriodicTaskStatuses';
import { useUpdatePeriodicTask } from '@/lib/hooks/usePeriodicTasks';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { LATE_GRACE_DAYS, type PerformanceFilterParams } from '@/lib/api/periodic-task-performance.api';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import { classifyFlaggedTask, hasStartedWorking } from '@/lib/utils/periodicTaskPerformance';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { TaskMiniCard } from './TaskMiniCard';
import { TaskChecklistInline } from './TaskChecklistInline';
import { TaskChecklistModal } from './TaskChecklistModal';

const { Text } = Typography;

interface Props {
  /** `null` = đóng Drawer (và không fetch). */
  user: { id: number; name: string } | null;
  /** Cùng bộ lọc với bảng tổng hợp để số liệu drill-down khớp dòng đã bấm. */
  params: PerformanceFilterParams;
  onClose: () => void;
}

/**
 * PerformanceFlaggedDrawer - drill-down "Công việc cần lưu ý" từ 1 dòng bảng
 * Hiệu suất (Task hoàn thành muộn / quá hạn chưa xong của 1 User).
 *
 * VIẾT LẠI HOÀN TOÀN (yêu cầu chủ dự án 2026-09-25, thay bản Table cũ):
 *  - Hiển thị mỗi Task như 1 Card (tái dùng NGUYÊN `TaskMiniCard`, mirror
 *    ĐÚNG UI Tab "Xem theo ngày" - `PeriodicTasksAgendaView.tsx`) thay vì
 *    dòng bảng chật hẹp.
 *  - Chia 2 nhóm bằng `hasStartedWorking()` (xem JSDoc hàm đó): "Đang làm trở
 *    lên" (đã bắt đầu động vào) đứng TRƯỚC, "Chưa hoàn thành / Quá hạn" (chưa
 *    động vào gì) đứng SAU - giúp người xem ưu tiên nhắc việc CHƯA làm trước.
 *  - Mỗi Card có Checklist LUÔN HIỂN THỊ (`TaskChecklistInline`, không phải
 *    mở Modal riêng mới thấy) + Select đổi trạng thái NHANH ngay tại chỗ -
 *    cả 2 đều thao tác được trực tiếp trong Drawer (CRUD checklist + đổi
 *    status), không cần đóng Drawer rồi qua trang danh sách chính.
 *  - Nguồn dữ liệu VẪN gọi `useUserFlaggedTasks()` y hệt bản cũ (BE
 *    `buildFilteredTaskQuery()` đã áp ĐÚNG cùng bộ lọc ngày với bảng tổng hợp
 *    - xác nhận 2026-09-25, không có bug "tính luôn Task quá khứ").
 *  - Quyền sửa (đổi status/checklist) dùng CHÍNH XÁC pattern
 *    `periodic_tasks.edit` (+ `edit_locked` khi Task đang khoá) mirror
 *    `TaskChecklistModal`/`cong-viec-dinh-ky/page.tsx` - KHÔNG tự chế lại
 *    logic scope riêng (BE PATCH vẫn là chốt chặn thật, FE chỉ disable UI
 *    kèm Tooltip lý do, lỗi 403 nếu có vẫn hiện qua toast).
 *  - `useUpdatePeriodicTask`/checklist mutations mặc định CHỈ invalidate
 *    namespace `periodic-tasks` - Drawer này tự invalidate THÊM
 *    `periodic-task-performance` sau mỗi lần đổi status thành công, để bảng
 *    tổng hợp Hiệu suất (cột %, Checklist) tự cập nhật ngay không cần F5.
 */
export function PerformanceFlaggedDrawer({ user, params, onClose }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { can } = useMyPermissions();
  const hasEditPermission = can('periodic_tasks.edit');
  const canEditLocked = can('periodic_tasks.edit_locked');

  const { data, isLoading, isError } = useUserFlaggedTasks(user?.id ?? null, params);
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

  const tasks = data ?? [];
  const startedTasks = tasks.filter(hasStartedWorking);
  const notStartedTasks = tasks.filter((t) => !hasStartedWorking(t));

  const renderTaskCard = (task: PeriodicTask) => {
    const lockBlocksEdit = task.isLocked && !canEditLocked;
    const canEditTask = hasEditPermission && !lockBlocksEdit;
    const isUpdatingThis = updateStatusMutation.isPending && updateStatusMutation.variables?.id === task.id;
    const kind = classifyFlaggedTask(task);

    return (
      <TaskMiniCard
        key={task.id}
        task={task}
        extra={
          kind === 'late' ? (
            <Tag color="warning">Hoàn thành muộn</Tag>
          ) : (
            <Tag color="error">Quá hạn chưa xong</Tag>
          )
        }
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

  return (
    <>
      <Drawer
        open={!!user}
        onClose={onClose}
        size="large"
        title={user ? `Công việc cần lưu ý — ${user.name}` : ''}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title={`Gồm Task hoàn thành sau kỳ hạn + ${LATE_GRACE_DAYS} ngày, và Task chưa chuyển In review/Hoàn thành dù đã qua mốc đó. Bạn có thể đổi trạng thái và cập nhật checklist trực tiếp bên dưới.`}
        />

        {isError ? (
          <Text type="danger">Không tải được danh sách. Vui lòng thử lại.</Text>
        ) : isLoading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Spin />
          </div>
        ) : tasks.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có công việc nào cần lưu ý trong khoảng đã chọn" style={{ padding: 48 }} />
        ) : (
          <>
            <Divider orientation="left" orientationMargin={0} style={{ marginTop: 0 }}>
              <Text strong>Đang làm trở lên ({startedTasks.length})</Text>
            </Divider>
            {startedTasks.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Không có Task nào đã bắt đầu xử lý.
              </Text>
            ) : (
              startedTasks.map(renderTaskCard)
            )}

            <Divider orientation="left" orientationMargin={0}>
              <Text strong>Chưa hoàn thành / Quá hạn ({notStartedTasks.length})</Text>
            </Divider>
            {notStartedTasks.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Không có Task nào còn ở nhóm này.
              </Text>
            ) : (
              notStartedTasks.map(renderTaskCard)
            )}
          </>
        )}
      </Drawer>

      <TaskChecklistModal open={!!checklistTask} onClose={() => setChecklistTask(null)} task={checklistTask} />
    </>
  );
}
