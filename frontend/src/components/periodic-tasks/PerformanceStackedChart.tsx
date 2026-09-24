'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { PerformanceUserRow } from '@/lib/api/periodic-task-performance.api';

/** Tối đa số User vẽ trên biểu đồ - nhiều hơn thì cột chữ quá chật, bảng bên dưới vẫn đủ toàn bộ. */
export const CHART_MAX_USERS = 20;

const SERIES = [
  { key: 'completedOnTime', label: 'Hoàn thành đúng hạn', color: '#52c41a' },
  { key: 'completedLate', label: 'Hoàn thành muộn', color: '#faad14' },
  { key: 'overdueNotCompleted', label: 'Quá hạn chưa xong', color: '#f5222d' },
  { key: 'pendingFuture', label: 'Đang trong hạn', color: '#91caff' },
] as const;

interface Props {
  rows: PerformanceUserRow[];
}

/** Biểu đồ cột ngang xếp chồng: mỗi User 1 thanh, chia theo 4 nhóm trạng thái hiệu suất. */
export function PerformanceStackedChart({ rows }: Props) {
  const data = [...rows]
    .sort((a, b) => b.total - a.total)
    .slice(0, CHART_MAX_USERS)
    .map((r) => ({
      name: r.userName,
      completedOnTime: r.completedOnTime,
      completedLate: r.completedLate,
      overdueNotCompleted: r.overdueNotCompleted,
      pendingFuture: r.pendingFuture,
    }));

  const height = Math.min(Math.max(data.length * 38 + 80, 220), 820);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }} maxBarSize={26}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {SERIES.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="perf" fill={s.color} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
