'use client';

import { App, Button, DatePicker, Space, Switch, Typography } from 'antd';
import { FlagFilled } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { clampRange, getLastMonthRange, getLastWeekRange, getThisWeekRange, getThisMonthRange, getTodayRange, MAX_TASK_RANGE_DAYS } from '@/lib/utils/periodicTaskRange';

const { RangePicker } = DatePicker;
const { Text } = Typography;
const FMT = 'YYYY-MM-DD';

export type QuickRangeKey = 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
const QUICK_RANGES: { key: QuickRangeKey; label: string; getRange: () => [Dayjs, Dayjs] }[] = [
  { key: 'today', label: 'Hôm nay', getRange: () => getTodayRange() },
  { key: 'thisWeek', label: 'Tuần này', getRange: () => getThisWeekRange() },
  { key: 'lastWeek', label: 'Tuần trước', getRange: () => getLastWeekRange() },
  { key: 'thisMonth', label: 'Tháng này', getRange: () => getThisMonthRange() },
  { key: 'lastMonth', label: 'Tháng trước', getRange: () => getLastMonthRange() },
];

/** Mặc định "Tuần này" (yêu cầu chủ dự án 2026-09-25) - khớp mặc định BE khi
 * không truyền `dateFrom`/`dateTo` (`resolveListWindow()`). */
export const getDefaultPerformanceRange = (): [Dayjs, Dayjs] => getThisWeekRange();

interface Props {
  value: [Dayjs, Dayjs];
  onChange: (range: [Dayjs, Dayjs]) => void;
  size?: 'small' | 'middle';
  /** Truyền CẢ 2 prop này để hiện Toggle "Chỉ hiển thị Task quá hạn" (không truyền = không hiện). */
  overdueOnly?: boolean;
  onOverdueOnlyChange?: (value: boolean) => void;
}

/**
 * PerformanceRangeFilter - RangePicker + 5 nút Lọc nhanh (Hôm nay/Tuần này/
 * Tuần trước/Tháng này/Tháng trước), mặc định Tuần này. Dùng CHUNG cho `PerformanceUserTasksDrawer`
 * (xem User khác) và view "own" nhúng trên trang - tách riêng khỏi bộ lọc
 * chính của bảng tổng hợp (`hieu-suat-cong-viec/page.tsx` mặc định THÁNG NÀY)
 * vì đây là yêu cầu RIÊNG của chủ dự án cho phần xem chi tiết theo Task.
 */
export function PerformanceRangeFilter({ value, onChange, size = 'small', overdueOnly, onOverdueOnlyChange }: Props) {
  const { message } = App.useApp();

  const activeQuick = QUICK_RANGES.find(({ getRange }) => {
    const [f, t] = getRange();
    return f.format(FMT) === value[0].format(FMT) && t.format(FMT) === value[1].format(FMT);
  })?.key;

  const applyRange = (from: Dayjs, to: Dayjs) => {
    const { range, clamped } = clampRange(from, to);
    if (clamped) message.warning(`Khoảng ngày tối đa ${MAX_TASK_RANGE_DAYS} ngày - đã tự cắt bớt ngày kết thúc.`);
    onChange(range);
  };

  return (
    <Space size={8} wrap style={{ marginBottom: 12 }}>
      <RangePicker
        size={size}
        format="DD/MM/YYYY"
        placeholder={['Từ ngày', 'Đến ngày']}
        allowClear={false}
        value={value}
        onChange={(vals) => vals?.[0] && vals?.[1] && applyRange(vals[0], vals[1])}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>Lọc nhanh:</Text>
      {QUICK_RANGES.map(({ key, label, getRange }) => (
        <Button
          key={key}
          size={size}
          type={activeQuick === key ? 'primary' : 'default'}
          onClick={() => applyRange(...getRange())}
        >
          {label}
        </Button>
      ))}
      {onOverdueOnlyChange && (
        <Space size={6} style={{ marginInlineStart: 8 }}>
          <Switch size="small" checked={!!overdueOnly} onChange={onOverdueOnlyChange} aria-label="Chỉ hiển thị Task quá hạn" />
          <Text style={{ fontSize: 12, color: overdueOnly ? '#cf1322' : undefined }}>
            <FlagFilled style={{ color: '#ff4d4f', marginInlineEnd: 4 }} />
            Chỉ hiển thị Task quá hạn
          </Text>
        </Space>
      )}
    </Space>
  );
}
