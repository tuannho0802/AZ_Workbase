'use client';

import { Button, Select, Space, Tag } from 'antd';
import type { SelectProps } from 'antd';
import { ClearOutlined } from '@ant-design/icons';
import type { UtmStatsUtmBrief } from '@/lib/api/utms.api';
import { UserMiniCard } from '@/app/(dashboard)/attendance-device/UserMiniCard';
import { UtmTag } from '@/components/utms/UtmTag';
import { resolveEntityColor } from '@/lib/utils/entityColor';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import {
  hasActiveStatsFilters,
  managerOptions,
  pruneUtmSelection,
  utmOptionsFor,
  EMPTY_STATS_FILTERS,
  type SelectOption,
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
  const { getRoleColor } = useRoleColorMap();
  const { roleColors } = useRoleColors();
  const getRoleName = (code?: string) => (code ? roleColors.find((r) => r.code === code)?.name || code : '');

  // `label` là ReactNode (tag màu) nên tìm kiếm phải theo `searchText` (tên thuần).
  const managerOpt = (o: SelectOption) => ({
    value: o.value,
    searchText: o.label,
    label: <UserMiniCard name={o.label} role={o.role ?? undefined} getRoleColor={getRoleColor} getRoleName={getRoleName} hideRoleTag size="small" />,
  });
  const utmOpt = (o: SelectOption, inactive: boolean) => ({
    value: o.value,
    searchText: o.label,
    label: <UtmTag name={o.label} color={o.color} inactive={inactive} />,
  });

  const primaryOptions = managerOptions(utms, 'primary').map(managerOpt);
  const secondaryOptions = managerOptions(utms, 'secondary').map(managerOpt);
  const activeOptions = utmOptionsFor(utms, value, true).map((o) => utmOpt(o, false));
  const lockedOptions = utmOptionsFor(utms, value, false).map((o) => utmOpt(o, true));

  // Chip đã chọn của dropdown nhiều lựa chọn: hiện đúng Tag UTM (màu + gạch nếu đã khoá) thay vì chip xám chứa tag.
  // maxTagCount="responsive" cũng gọi tagRender cho chip "+ N ..." (value = undefined) -> phải giữ nguyên nhãn đó.
  const utmChip = (inactive: boolean) =>
    function UtmChip(props: Parameters<NonNullable<SelectProps['tagRender']>>[0]) {
      const u = utms.find((x) => x.id === props.value);
      return (
        <span style={{ marginInlineEnd: 4, display: 'inline-flex' }} onMouseDown={(e) => e.preventDefault()}>
          <Tag
            color={u ? resolveEntityColor(u.color) : undefined}
            closable={!!u && props.closable}
            onClose={props.onClose}
            style={{ marginInlineEnd: 0, ...(u && inactive ? { opacity: 0.55, textDecoration: 'line-through' } : null) }}
          >
            {u ? u.name : props.label}
          </Tag>
        </span>
      );
    };

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
        optionFilterProp="searchText"
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
        optionFilterProp="searchText"
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
        optionFilterProp="searchText"
        tagRender={utmChip(false)}
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
        optionFilterProp="searchText"
        tagRender={utmChip(true)}
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
