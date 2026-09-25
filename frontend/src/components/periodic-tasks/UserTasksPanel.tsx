'use client';

import { useState } from 'react';
import { App, Divider, Empty, Pagination, Select, Spin, Tag, Tooltip, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdatePeriodicTask } from '@/lib/hooks/usePeriodicTasks';
import { usePeriodicTaskStatuses } from '@/lib/hooks/usePeriodicTaskStatuses';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useUserTasks } from '@/lib/hooks/usePeriodicTaskPerformance';
import type { PeriodicTask } from '@/lib/api/periodic-tasks.api';
import type { PaginatedUserTasksResult, PerformanceFilterParams } from '@/lib/api/periodic-task-performance.api';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { TaskMiniCard } from './TaskMiniCard';
import { TaskChecklistInline } from './TaskChecklistInline';
import { TaskChecklistModal } from './TaskChecklistModal';

const { Text } = Typography;

interface Props {
  userId: number;
  /** `dateFrom`/`dateTo`/`periodType` - KHÔNG gồm `primaryPage`/`secondaryPage`
   * (2 field đó do chính Panel tự quản lý bên dưới, độc lập với params của
   * component cha, để đổi trang nhóm này không ảnh hưởng nhóm kia). */
  params: Omit<PerformanceFilterParams, 'primaryPage' | 'secondaryPage'>;
}

/**
 * UserTasksPanel - danh sách Task ĐẦY ĐỦ (không giới hạn "cần lưu ý") của 1
 * User, tách 2 nhóm "Phụ trách chính"/"Phụ trách phụ".
 *
 * MỚI 2026-09-25 (yêu cầu chủ dự án - phân trang THẬT ở BE, Separator rõ nét
 * hơn, tránh Drawer/view "own" quá dài):
 *  - Tự gọi `useUserTasks()` bên trong (thay vì nhận `data` đã fetch sẵn từ
 *    ngoài) để tự quản lý `primaryPage`/`secondaryPage` NGAY TẠI ĐÂY - tránh
 *    lặp state phân trang ở CẢ 2 nơi gọi (`PerformanceUserTasksDrawer` +
 *    `OwnPerformanceDetail`), đúng tinh thần "sửa 1 chỗ" đã áp dụng khi tách
 *    Panel này ra ban đầu.
 *  - Mỗi nhóm tối đa 2 Task/trang (`pageSize` do BE quyết định -
 *    `USER_TASKS_PAGE_SIZE`, FE chỉ hiển thị theo `total`/`page`/`pageSize`
 *    BE trả về, KHÔNG tự cắt mảng ở FE) - `<Pagination>` riêng cho từng nhóm.
 *  - Sắp xếp "Task gần ngày hôm nay nhất lên đầu" do BE xử lý hoàn toàn
 *    (`ORDER BY ABS(DATEDIFF(...))`) - FE giữ nguyên thứ tự BE trả về.
 *  - Khi `params` (khoảng ngày) đổi, component cha cần đổi `key` để remount
 *    Panel (mirror pattern `key={user.id}` đã dùng ở Drawer) - tự động đưa
 *    `primaryPage`/`secondaryPage` về lại 1, tránh phải `useEffect` reset
 *    state (từng bị ESLint `react-hooks/set-state-in-effect` chặn).
 *
 * Section header ("Phụ trách chính"/"Phụ trách phụ") đổi từ `Divider` mảnh
 * sang khối nền màu RÕ NÉT hơn (yêu cầu chủ dự án qua ảnh chụp Drawer) - 2 màu
 * khác nhau (xanh dương/tím) để phân biệt 2 nhóm ngay cả khi cuộn nhanh.
 */
export function UserTasksPanel({ userId, params }: Props) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { can } = useMyPermissions();
  const hasEditPermission = can('periodic_tasks.edit');
  const canEditLocked = can('periodic_tasks.edit_locked');

  const { statuses } = usePeriodicTaskStatuses();
  const updateStatusMutation = useUpdatePeriodicTask();
  const [checklistTask, setChecklistTask] = useState<PeriodicTask | null>(null);

  // Phân trang RIÊNG cho từng nhóm - lật trang nhóm này không ảnh hưởng nhóm kia.
  const [primaryPage, setPrimaryPage] = useState(1);
  const [secondaryPage, setSecondaryPage] = useState(1);

  const { data, isLoading, isError } = useUserTasks(userId, { ...params, primaryPage, secondaryPage });

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

  // MỚI (2026-09-25, chủ dự án khoanh đỏ ảnh chụp Drawer): border/shadow riêng
  // của `TaskMiniCard` vẫn chưa đủ RÕ giữa 2 Task liền kề khi Task phía trên có
  // Checklist dài (nhiều dòng) - thêm hẳn 1 `Divider` kẻ ngang giữa các Card
  // (không thêm trước Card đầu tiên của nhóm, group header đã đóng vai trò
  // ranh giới đó rồi).
  const renderTaskList = (items: PeriodicTask[]) =>
    items.map((task, idx) => (
      <div key={task.id}>
        {idx > 0 && <Divider style={{ margin: '4px 10 14px', borderColor: '#c9ced6' }} />}
        {renderTaskCard(task)}
      </div>
    ));

  /** Header nhóm - khối nền màu RÕ NÉT (thay `Divider` mảnh cũ) + Pagination
   * ở góc phải khi nhóm có nhiều hơn 1 trang. */
  const renderGroupHeader = (label: string, group: PaginatedUserTasksResult, color: 'blue' | 'purple', onPageChange: (p: number) => void) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
        background: color === 'blue' ? '#e6f4ff' : '#f9f0ff',
        border: `1px solid ${color === 'blue' ? '#91caff' : '#d3adf7'}`,
        borderRadius: 6,
        padding: '6px 12px',
        marginBottom: 10,
      }}
    >
      <Text strong style={{ fontSize: 13, color: color === 'blue' ? '#0958d9' : '#531dab' }}>
        {label} ({group.total})
      </Text>
      {group.total > group.pageSize && (
        <Pagination size="small" simple current={group.page} pageSize={group.pageSize} total={group.total} onChange={onPageChange} />
      )}
    </div>
  );

  if (isError) return <Text type="danger">Không tải được danh sách. Vui lòng thử lại.</Text>;
  if (isLoading || !data) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }

  const { primary, secondary } = data;

  if (primary.total === 0 && secondary.total === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có công việc nào trong khoảng đã chọn" style={{ padding: 48 }} />;
  }

  return (
    <>
      {renderGroupHeader('Phụ trách chính', primary, 'blue', setPrimaryPage)}
      {primary.items.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Không có Task nào ở vai trò Phụ trách chính.
        </Text>
      ) : (
          renderTaskList(primary.items)
      )}

      <div style={{ marginTop: 16 }}>{renderGroupHeader('Phụ trách phụ', secondary, 'purple', setSecondaryPage)}</div>
      {secondary.items.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Không có Task nào được thêm làm Phụ trách phụ.
        </Text>
      ) : (
          renderTaskList(secondary.items)
      )}

      <TaskChecklistModal open={!!checklistTask} onClose={() => setChecklistTask(null)} task={checklistTask} />
    </>
  );
}
