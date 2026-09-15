'use client';

import { useState } from 'react';
import { Modal, Typography, Tag, Avatar, Collapse, Empty, Spin, Pagination, Space } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePeriodicTaskAuditLogs } from '@/lib/hooks/usePeriodicTaskAuditLogs';
import { PERIODIC_TASK_AUDIT_ACTION_META } from '@/lib/types/periodic-task-audit.types';
import { AuditDiffViewer } from '@/components/audit/AuditDiffViewer';
import { PeriodicTask } from '@/lib/api/periodic-tasks.api';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  task: PeriodicTask | null;
}

/**
 * Nhãn tiếng Việt cho field riêng của `PeriodicTask` (khác Customer/User/
 * Deposit mà `AuditDiffViewer.FIELD_LABELS` gốc đã có sẵn) - truyền qua prop
 * `extraFieldLabels` (xem `AuditDiffViewer.tsx`), KHÔNG sửa file gốc dùng
 * chung với trang `/audit-logs`. Field object lồng (`status`/`primaryAssignee`/
 * `department`/`createdBy`/`updatedBy`) không liệt kê ở đây - `AuditDiffViewer`
 * tự fallback hiển thị "Dữ liệu phức hợp" cho `typeof val === 'object'`.
 */
const PERIODIC_TASK_FIELD_LABELS: Record<string, string> = {
  title: 'Tiêu đề',
  description: 'Mô tả',
  periodType: 'Loại kỳ',
  periodStartDate: 'Ngày bắt đầu kỳ',
  periodEndDate: 'Ngày kết thúc kỳ',
  statusId: 'Trạng thái',
  primaryAssigneeId: 'Phụ trách chính',
  departmentId: 'Phòng ban',
  color: 'Màu',
  isLocked: 'Đang khoá',
  lockNote: 'Ghi chú khoá',
  content: 'Nội dung',
  isDone: 'Đã xong',
  position: 'Vị trí',
};

/**
 * TaskAuditLogsModal - Phase 7 (CUỐI, PLAN_PERIODIC_TASKS_MODULE.md mục 2.6 +
 * mục 6): xem lịch sử audit RIÊNG của 1 Task, khớp `GET /periodic-tasks/:id/
 * audit-logs` (`periodicTaskAuditLogsApi`). Mirror nguyên tắc chung của
 * `TaskLinksModal`/`TaskChecklistModal` (Modal riêng gắn với 1 `task`, toast
 * lỗi qua `getApiErrorMessage` - nhưng modal này KHÔNG CÓ hành động sửa nào
 * (chỉ xem), nên không cần gate `periodic_tasks.edit`/`edit_locked` - chỉ cần
 * đứng được ở trang danh sách (đã có `periodic_tasks.view`) là xem được, đúng
 * `@RequirePermission('periodic_tasks.view')` ở Controller.
 *
 * KHÁC `TaskChecklistModal`/`TaskLinksModal` ở nguồn dữ liệu: 2 modal kia
 * fetch qua `usePeriodicTask(id)` (field đính kèm trong `GET /:id`), modal
 * này có endpoint/hook RIÊNG (`usePeriodicTaskAuditLogs`) vì là danh sách
 * PHÂN TRANG độc lập, không nằm trong response Task.
 *
 * Tái sử dụng `AuditDiffViewer` (component chung của trang `/audit-logs`) để
 * hiển thị chi tiết `oldData`/`newData` mỗi dòng - tránh viết lại logic diff,
 * chỉ truyền thêm `extraFieldLabels` cho field riêng của `PeriodicTask`.
 */
export function TaskAuditLogsModal({ open, onClose, task }: Props) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const taskId = task?.id ?? null;
  const { data, isLoading, isFetching } = usePeriodicTaskAuditLogs(taskId, { page, limit });
  const logs = data?.data ?? [];

  // Reset về trang 1 NGAY LÚC đóng (mirror `TaskChecklistModal.resetAndClose()`
  // - reset trực tiếp trong handler, không dùng `useEffect` theo dõi `open`
  // để tránh anti-pattern `react-hooks/set-state-in-effect`).
  const resetAndClose = () => {
    setPage(1);
    onClose();
  };

  return (
    <Modal
      title={`Lịch sử audit${task ? ` - "${task.title}"` : ''}`}
      open={open}
      onCancel={resetAndClose}
      footer={null}
      width={720}
    >
      {task && (
        <Spin spinning={isLoading}>
          {logs.length === 0 && !isLoading ? (
            <Empty description="Chưa có lịch sử audit nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <>
              <Collapse
                accordion
                items={logs.map((log) => {
                  const meta = PERIODIC_TASK_AUDIT_ACTION_META[log.action];
                  return {
                    key: log.id,
                    label: (
                      <Space wrap>
                        {meta ? <Tag color={meta.color}>{meta.label}</Tag> : <Tag>{log.action}</Tag>}
                        <Space size={4}>
                          <Avatar size={18} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                          <Text strong style={{ fontSize: 13 }}>
                            {log.user?.name ?? `User #${log.userId}`}
                          </Text>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(log.createdAt).format('HH:mm:ss DD/MM/YYYY')}
                        </Text>
                      </Space>
                    ),
                    children: (
                      <AuditDiffViewer
                        oldData={log.oldData}
                        newData={log.newData}
                        action={log.action}
                        extraFieldLabels={PERIODIC_TASK_FIELD_LABELS}
                      />
                    ),
                  };
                })}
              />

              <Pagination
                current={page}
                pageSize={limit}
                total={data?.total ?? 0}
                onChange={(p, ps) => {
                  setPage(p);
                  setLimit(ps || limit);
                }}
                showSizeChanger
                pageSizeOptions={['20', '50', '100']}
                showTotal={(t) => `Tổng cộng ${t.toLocaleString()} bản ghi`}
                disabled={isFetching}
                size="small"
                style={{ marginTop: 16, textAlign: 'right' }}
              />
            </>
          )}
        </Spin>
      )}
    </Modal>
  );
}
