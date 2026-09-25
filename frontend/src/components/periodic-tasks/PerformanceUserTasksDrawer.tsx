'use client';

import { useState } from 'react';
import { Alert, Drawer } from 'antd';
import type { Dayjs } from 'dayjs';
import { getDefaultPerformanceRange, PerformanceRangeFilter } from './PerformanceRangeFilter';
import { UserTasksPanel } from './UserTasksPanel';

const FMT = 'YYYY-MM-DD';

interface Props {
  /** `null` = đóng Drawer (và không fetch). */
  user: { id: number; name: string } | null;
  /** `periodType`/`departmentId` kế thừa từ bảng tổng hợp để đồng bộ ngữ cảnh
   * đang xem - riêng khoảng ngày Drawer có bộ lọc RIÊNG (xem `dateRange` bên
   * dưới), không dùng chung với bảng tổng hợp. */
  periodType?: string;
  onClose: () => void;
}

/**
 * PerformanceUserTasksDrawer - THAY THẾ HOÀN TOÀN `PerformanceFlaggedDrawer`
 * (yêu cầu chủ dự án 2026-09-25):
 *  - Nguồn dữ liệu đổi từ `getUserFlaggedTasks` (chỉ Task muộn/quá hạn) sang
 *    `getUserTasks` (ĐẦY ĐỦ Task, tách Phụ trách chính/phụ) - xem được BẤT
 *    KỲ LÚC NÀO, không cần User đó đang có Task "cần lưu ý" (nút "Chi tiết"
 *    ở `page.tsx` không còn `disabled` theo `flagged === 0` nữa).
 *  - Có bộ lọc RIÊNG trong Drawer (RangePicker + Lọc nhanh Hôm nay/Tuần này/
 *    Tháng này, mặc định Tuần này) - ĐỘC LẬP với bộ lọc ngày của bảng tổng
 *    hợp ngoài trang (trang ngoài mặc định Tháng này cho số liệu rollup, còn
 *    Drawer xem chi tiết Task nên mặc định hẹp hơn - Tuần này).
 *  - Phần hiển thị Card/Checklist/đổi trạng thái tách ra `UserTasksPanel`
 *    dùng chung với view "own" nhúng trên trang.
 */
export function PerformanceUserTasksDrawer({ user, periodType, onClose }: Props) {
  return (
    <Drawer open={!!user} onClose={onClose} size="large" title={user ? `Chi tiết công việc — ${user.name}` : ''} destroyOnHidden>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        title="Danh sách đầy đủ Task (Phụ trách chính + Phụ trách phụ) trong khoảng đã chọn - không giới hạn Task muộn/quá hạn. Có thể đổi trạng thái và cập nhật checklist trực tiếp bên dưới."
      />

      {/* `key={user.id}` thay cho `useEffect` reset state (tránh lỗi lint
          `react-hooks/set-state-in-effect` - setState đồng bộ trong effect) -
          đổi `key` tự remount toàn bộ nội dung khi chuyển sang xem User khác,
          bộ lọc ngày tự về lại mặc định "Tuần này" mà không cần effect. */}
      {user && <DrawerBody key={user.id} userId={user.id} periodType={periodType} />}
    </Drawer>
  );
}

function DrawerBody({ userId, periodType }: { userId: number; periodType?: string }) {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(getDefaultPerformanceRange);

  const params = {
    dateFrom: dateRange[0].format(FMT),
    dateTo: dateRange[1].format(FMT),
    periodType: periodType as never,
  };

  return (
    <>
      <PerformanceRangeFilter value={dateRange} onChange={setDateRange} />
      {/* `key` = khoảng ngày -> đổi ngày remount Panel, tự đưa phân trang của
          CẢ 2 nhóm về lại trang 1 (mirror pattern `key={user.id}` ở trên). */}
      <UserTasksPanel key={`${params.dateFrom}_${params.dateTo}`} userId={userId} params={params} />
    </>
  );
}
