'use client';

import { useState } from 'react';
import { Card, Space, Typography } from 'antd';
import { UnorderedListOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { useUserTasks } from '@/lib/hooks/usePeriodicTaskPerformance';
import { getDefaultPerformanceRange, PerformanceRangeFilter } from './PerformanceRangeFilter';
import { UserTasksPanel } from './UserTasksPanel';

const { Text } = Typography;
const FMT = 'YYYY-MM-DD';

interface Props {
  userId: number;
  periodType?: string;
}

/**
 * OwnPerformanceDetail - view CHI TIẾT dành riêng cho `viewScope === 'own'`
 * (yêu cầu chủ dự án 2026-09-25): khi `periodic_tasks.performance_view` TẮT
 * (hoặc BẬT nhưng resolve về 'own' - 2 trường hợp CÙNG 1 logic, xem JSDoc
 * `resolveScope()` ở BE), bảng tổng hợp nhiều-user phía trên gần như vô
 * nghĩa (luôn đúng 1 dòng) - nên hiển thị THÊM danh sách Task dạng Card ngay
 * dưới bảng tổng hợp, CHI TIẾT hơn hẳn (đổi trạng thái/checklist trực tiếp),
 * KHÁC HẲN giao diện bảng tổng hợp phía trên (không phải bảng số liệu nữa)
 * để phân biệt rõ 2 khối - viền màu xanh (`variant="borderless"` + nền nhấn)
 * để không lẫn với `Card` bảng tổng hợp mặc định phía trên.
 *
 * SKETCH SƠ (yêu cầu chủ dự án): tái dùng `UserTasksPanel` NGUYÊN VẸN với
 * `PerformanceFlaggedDrawer` cũ/`PerformanceUserTasksDrawer` mới (xem User
 * khác) - chỉ khác ở chỗ nhúng thẳng trên trang (không qua Drawer) và có
 * `Title` + bộ lọc riêng (mặc định Tuần này, độc lập bộ lọc Tháng này của
 * bảng tổng hợp phía trên) thay vì `Drawer.title`.
 */
export function OwnPerformanceDetail({ userId, periodType }: Props) {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(getDefaultPerformanceRange);

  const params = {
    dateFrom: dateRange[0].format(FMT),
    dateTo: dateRange[1].format(FMT),
    periodType: periodType as never,
  };

  const { data, isLoading, isError } = useUserTasks(userId, params);

  return (
    <Card
      size="small"
      style={{ marginTop: 16, background: '#f0f7ff', border: '1px solid #91caff' }}
      title={
        <Space size={6}>
          <UnorderedListOutlined />
          <Text strong>Chi tiết công việc của tôi</Text>
        </Space>
      }
    >
      <PerformanceRangeFilter value={dateRange} onChange={setDateRange} />
      <UserTasksPanel data={data} isLoading={isLoading} isError={isError} />
    </Card>
  );
}
