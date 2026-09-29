'use client';

import { Button, Space } from 'antd';
import type { Dayjs } from 'dayjs';
import { matchQuickRange, QUICK_RANGE_OPTIONS } from '@/lib/utils/reportCustomerDetail';

export type QuickRangeValue = [Dayjs | null, Dayjs | null] | null;

interface Props {
  value: QuickRangeValue;
  onChange: (range: QuickRangeValue) => void;
}

/** Nút lọc nhanh Hôm nay / Tuần này / Tuần trước / Tháng này. Bấm lại nút đang chọn = bỏ lọc. */
export default function ReportQuickRangeFilter({ value, onChange }: Props) {
  const active = matchQuickRange(value);
  return (
    <Space size={4} wrap>
      {QUICK_RANGE_OPTIONS.map((o) => (
        <Button
          key={o.key}
          size="small"
          type={active === o.key ? 'primary' : 'default'}
          onClick={() => onChange(active === o.key ? null : o.getRange())}
        >
          {o.label}
        </Button>
      ))}
    </Space>
  );
}
