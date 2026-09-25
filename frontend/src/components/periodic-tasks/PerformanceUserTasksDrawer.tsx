'use client';

import { useState } from 'react';
import { Alert, Drawer, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { getDefaultPerformanceRange, PerformanceRangeFilter } from './PerformanceRangeFilter';
import { UserTasksPanel } from './UserTasksPanel';
import { PeriodTypeTag } from './PeriodTypeTag';
import { PERIOD_TYPE_LABELS, type PeriodType } from '@/lib/api/periodic-tasks.api';

const FMT = 'YYYY-MM-DD';

interface Props {
  /** `null` = đóng Drawer (và không fetch). */
  user: { id: number; name: string } | null;
  /** Giá trị KHỞI TẠO cho bộ lọc "Loại kỳ" RIÊNG của Drawer (xem
   * `DrawerBody` bên dưới) - kế thừa từ bảng tổng hợp để đồng bộ ngữ cảnh
   * đang xem lúc mở Drawer, nhưng sau đó User có thể tự đổi/bỏ lọc NGAY
   * trong Drawer (yêu cầu chủ dự án 2026-09-25: thêm Select "Loại kỳ" độc
   * lập, có colorTag đúng `PERIOD_TYPE_COLORS`) mà KHÔNG ảnh hưởng ngược lại
   * bộ lọc của bảng tổng hợp ngoài trang. Riêng khoảng ngày Drawer đã có bộ
   * lọc RIÊNG từ trước (xem `dateRange` bên dưới) - không dùng chung với
   * bảng tổng hợp, cùng tinh thần với `periodType` giờ cũng vậy. */
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
  // Khởi tạo từ giá trị kế thừa (bảng tổng hợp), sau đó ĐỘC LẬP hoàn toàn -
  // đổi/bỏ lọc ở đây không ghi ngược lại state của trang ngoài (xem JSDoc `Props.periodType`).
  const [filterPeriodType, setFilterPeriodType] = useState<PeriodType | undefined>(periodType as PeriodType | undefined);

  const params = {
    dateFrom: dateRange[0].format(FMT),
    dateTo: dateRange[1].format(FMT),
    periodType: filterPeriodType,
  };

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <PerformanceRangeFilter value={dateRange} onChange={setDateRange} />
        <Select
          allowClear
          placeholder="Loại kỳ"
          style={{ minWidth: 160 }}
          value={filterPeriodType}
          onChange={(v) => setFilterPeriodType(v)}
          options={(Object.keys(PERIOD_TYPE_LABELS) as PeriodType[]).map((pt) => ({
            value: pt,
            label: <PeriodTypeTag type={pt} style={{ marginInlineEnd: 0 }} />,
          }))}
        />
      </div>
      {/* `key` = khoảng ngày + Loại kỳ -> đổi filter remount Panel, tự đưa
          phân trang của CẢ 2 nhóm về lại trang 1 (mirror pattern `key={user.id}` ở trên). */}
      <UserTasksPanel key={`${params.dateFrom}_${params.dateTo}_${filterPeriodType ?? 'all'}`} userId={userId} params={params} />
    </>
  );
}