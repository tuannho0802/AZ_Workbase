'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { Card, Statistic, Typography } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { deltaOf, fmtCount, formatUsd } from '@/lib/utils/marketingReport';
import { rateColor } from '@/lib/utils/rateColor';

const { Text } = Typography;

export const REPORT_COLORS = {
  danger: '#f5222d',
  warning: '#fa8c16',
  primary: '#1677ff',
  muted: '#bfbfbf',
  ok: '#52c41a',
  gold: '#faad14',
};

interface Props {
  title: ReactNode;
  value: number;
  /** Có -> hiện chênh lệch so với kỳ liền trước. */
  previous?: number;
  money?: boolean;
  color?: string;
  loading?: boolean;
  hint?: ReactNode;
  icon?: ReactNode;
  suffix?: string;
  /** true -> màu số lớn theo ngưỡng tỷ lệ (< 40% đỏ, 40-80% vàng, > 80% xanh), đè lên `color`. Dùng cho thẻ TỶ LỆ %. */
  rateColored?: boolean;
  /** Có -> thẻ bấm được, mở Mini Table danh sách khách phía sau con số. */
  onClick?: () => void;
}

/**
 * Thẻ KPI dùng CHUNG cho cả 4 tab báo cáo. `onClick` -> thẻ thành nút (hover, Enter/Space) mở Mini Table
 * khách hàng đứng sau con số (drill-down).
 */
export default function ReportKpiCard({ title, value, previous, money, color, loading, hint, icon, suffix, rateColored, onClick }: Props) {
  const d = previous == null ? null : deltaOf(value, previous);
  const fmtVal = money ? formatUsd : fmtCount;
  const onKey = (e: KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <Card
      size="small"
      loading={loading}
      hoverable={!!onClick}
      onClick={onClick}
      onKeyDown={onKey}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{ height: '100%', cursor: onClick ? 'pointer' : undefined }}
    >
      <Statistic
        title={title}
        value={value}
        prefix={icon}
        suffix={suffix}
        formatter={(v) => fmtVal(Number(v))}
        styles={{ content: { color: (rateColored ? rateColor(value) : undefined) ?? color, fontSize: 24 } }}
      />
      {d && (
        <Text
          style={{
            fontSize: 12,
            color: d.direction === 'up' ? REPORT_COLORS.ok : d.direction === 'down' ? REPORT_COLORS.danger : REPORT_COLORS.muted,
          }}
        >
          {d.direction === 'flat'
            ? `Bằng kỳ trước (${fmtVal(previous!)})`
            : `${d.direction === 'up' ? '▲ +' : '▼ '}${fmtVal(d.diff)}${d.percent != null ? ` (${d.diff > 0 ? '+' : ''}${d.percent}%)` : ''} so với kỳ trước (${fmtVal(previous!)})`}
        </Text>
      )}
      {hint && <div><Text type="secondary" style={{ fontSize: 12 }}>{hint}</Text></div>}
      {onClick && (
        <div style={{ marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Xem danh sách <RightOutlined style={{ fontSize: 10 }} /></Text>
        </div>
      )}
    </Card>
  );
}
