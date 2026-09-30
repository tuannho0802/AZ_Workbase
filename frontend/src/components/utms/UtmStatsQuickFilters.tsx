'use client';

import { useMemo } from 'react';
import { Button, Select, Space } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import type { UtmStatsUtmBrief } from '@/lib/api/utms.api';
import {
  hasActiveStatsFilters,
  managerOptions,
  pruneUtmSelection,
  utmOptionsFor,
  EMPTY_STATS_FILTERS,
  type UtmStatsFilters,
} from '@/lib/utils/utm-stats.util';

interface Props {
  /** Toàn bộ UTM trong phạm vi utms.view (kèm Quản lý chính/phụ) - nguồn dựng option. */
  utms: UtmStatsUtmBrief[];
  value: UtmStatsFilters;
  onChange: (next: UtmStatsFilters) => void;
  disabled?: boolean;
}

/**
 * Quick Filter DÙNG CHUNG cho tab "Thống kê" và Mini Table khách (2 nơi luôn lọc giống nhau):
 *  - Quản lý chính / Quản lý phụ: CHỈ liệt kê user đang quản lý ít nhất 1 UTM (user không quản lý UTM nào không hiện).
 *  - UTM hoạt động / UTM đã khoá: 2 dropdown riêng, chọn nhiều; option thu hẹp theo người quản lý đang chọn.
 * Các bộ lọc chỉ THU HẸP tập UTM trong phạm vi quyền - BE vẫn là nơi quyết định UTM/khách nào được xem.
 */
export function UtmStatsQuickFilters({ utms, value, onChange, disabled }: Props) {
  const primaryOptions = useMemo(() => managerOptions(utms, 'primary'), [utms]);
  const secondaryOptions = useMemo(() => managerOptions(utms, 'secondary'), [utms]);
  const activeOptions = useMemo(() => utmOptionsFor(utms, value, true), [utms, value]);
  const lockedOptions = useMemo(() => utmOptionsFor(utms, value, false), [utms, value]);

  const setManager = (patch: Pick<Partial<UtmStatsFilters>, 'primaryManagerId' | 'secondaryManagerId'>) =>
    onChange(pruneUtmSelection(utms, { ...value, ...patch }));

  return (
    <Space size={[8, 8]} wrap>
      <Select
        allowClear
        showSearch
        disabled={disabled}
        style={{ minWidth: 190 }}
        placeholder="Quản lý chính"
        aria-label="Lọc theo Quản lý chính"
        value={value.primaryManagerId}
        onChange={(v) => setManager({ primaryManagerId: v ?? undefined })}
        optionFilterProp="label"
        options={primaryOptions}
        notFoundContent="Chưa có Quản lý chính nào"
      />
      <Select
        allowClear
        showSearch
        disabled={disabled}
        style={{ minWidth: 190 }}
        placeholder="Quản lý phụ"
        aria-label="Lọc theo Quản lý phụ"
        value={value.secondaryManagerId}
        onChange={(v) => setManager({ secondaryManagerId: v ?? undefined })}
        optionFilterProp="label"
        options={secondaryOptions}
        notFoundContent="Chưa có Quản lý phụ nào"
      />
      <Select
        mode="multiple"
        allowClear
        showSearch
        disabled={disabled}
        style={{ minWidth: 220, maxWidth: 360 }}
        maxTagCount="responsive"
        placeholder="UTM hoạt động"
        aria-label="Lọc theo UTM hoạt động"
        value={value.activeUtmIds}
        onChange={(v: number[]) => onChange({ ...value, activeUtmIds: v })}
        optionFilterProp="label"
        options={activeOptions}
        notFoundContent="Không có UTM hoạt động nào"
      />
      <Select
        mode="multiple"
        allowClear
        showSearch
        disabled={disabled}
        style={{ minWidth: 220, maxWidth: 360 }}
        maxTagCount="responsive"
        placeholder="UTM đã khoá"
        aria-label="Lọc theo UTM đã khoá"
        value={value.lockedUtmIds}
        onChange={(v: number[]) => onChange({ ...value, lockedUtmIds: v })}
        optionFilterProp="label"
        options={lockedOptions}
        notFoundContent="Không có UTM đã khoá nào"
      />
      {hasActiveStatsFilters(value) && (
        <Button type="link" size="small" icon={<ClearOutlined />} disabled={disabled} onClick={() => onChange(EMPTY_STATS_FILTERS)}>
          Xoá lọc
        </Button>
      )}
    </Space>
  );
}
