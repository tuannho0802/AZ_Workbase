'use client';

import { Select, DatePicker, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { ReportPeriodType, ReportQuery, ReportPeriodInfo } from '@/lib/types/reports.types';

const { RangePicker } = DatePicker;
const { Text } = Typography;

const PERIOD_OPTIONS: { value: ReportPeriodType; label: string }[] = [
  { value: 'week', label: 'Tuần' },
  { value: 'month', label: 'Tháng' },
  { value: 'quarter', label: 'Quý' },
  { value: 'year', label: 'Năm' },
  { value: 'custom', label: 'Tuỳ chọn' },
];

interface PeriodSelectorProps {
  value: ReportQuery;
  onChange: (next: ReportQuery) => void;
  /** Khoảng ngày THẬT đã được BE tính ra (trả về trong response) - hiển thị
   * lại để người dùng luôn thấy đúng khoảng đang xem, không phải đoán qua
   * DatePicker (đặc biệt với period=week: BE tự tính Thứ Hai->CN theo
   * getDay(), không phụ thuộc "tuần bắt đầu từ đâu" theo locale dayjs -
   * picker="week" của antd dễ lệch nếu locale/plugin isoWeek khác giả định
   * của BE, nên KHÔNG dùng picker="week" ở đây, chỉ cho chọn 1 ngày bất kỳ
   * trong tuần muốn xem rồi hiển thị lại range thật). */
  resolvedPeriod?: ReportPeriodInfo | null;
}

/**
 * Chọn kỳ báo cáo - dùng CHUNG cho cả 2 tab (Doanh thu/Doanh số khách), theo
 * đúng yêu cầu: LUÔN là mốc lịch TRỌN VẸN (Thứ Hai->CN, ngày 1->cuối
 * tháng...), KHÔNG phải "N ngày gần đây tính từ hôm nay" - logic tính nằm
 * hoàn toàn ở BE (`getReportPeriodRange()`), component này chỉ gửi
 * period/anchor (hoặc customFrom/customTo) lên, KHÔNG tự tính range ở FE.
 */
export default function PeriodSelector({ value, onChange, resolvedPeriod }: PeriodSelectorProps) {
  const anchorValue: Dayjs = value.anchor ? dayjs(value.anchor) : dayjs();
  const customValue: [Dayjs, Dayjs] | null =
    value.customFrom && value.customTo ? [dayjs(value.customFrom), dayjs(value.customTo)] : null;

  const picker = value.period === 'month' ? 'month' : value.period === 'quarter' ? 'quarter' : value.period === 'year' ? 'year' : 'date';

  return (
    <Space orientation="vertical" size={6}>
      <Space wrap>
        <Select
          style={{ width: 140 }}
          value={value.period}
          options={PERIOD_OPTIONS}
          onChange={(period: ReportPeriodType) => {
            if (period === 'custom') {
              onChange({ period, customFrom: undefined, customTo: undefined });
            } else {
              onChange({ period, anchor: dayjs().format('YYYY-MM-DD') });
            }
          }}
        />

        {value.period === 'custom' ? (
          <RangePicker
            value={customValue}
            format="DD/MM/YYYY"
            onChange={(v) => {
              if (v && v[0] && v[1]) {
                onChange({
                  ...value,
                  customFrom: v[0].format('YYYY-MM-DD'),
                  customTo: v[1].format('YYYY-MM-DD'),
                });
              }
            }}
          />
        ) : (
          <DatePicker
            picker={picker}
            value={anchorValue}
            allowClear={false}
            format={value.period === 'week' ? 'DD/MM/YYYY' : undefined}
            onChange={(v) => v && onChange({ ...value, anchor: v.format('YYYY-MM-DD') })}
          />
        )}

        {value.period === 'week' && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chọn 1 ngày bất kỳ trong tuần muốn xem
          </Text>
        )}
      </Space>

      {resolvedPeriod && (
        <Text type="secondary" style={{ fontSize: 13 }}>
          Đang xem: <Text strong>{dayjs(resolvedPeriod.from).format('DD/MM/YYYY')}</Text> →{' '}
          <Text strong>{dayjs(resolvedPeriod.to).format('DD/MM/YYYY')}</Text>
        </Text>
      )}
    </Space>
  );
}