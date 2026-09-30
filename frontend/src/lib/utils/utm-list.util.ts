import dayjs, { type Dayjs } from 'dayjs';
import type { UtmView } from '@/lib/api/utms.api';
import { normalizeUtmName } from '@/components/utms/UtmSelect';

export type UtmStatusFilter = 'active' | 'inactive';
export type UtmRoleFilter = 'primary' | 'secondary';
export type UtmVisibilityFilter = 'shared' | 'restricted';
/** 'none' = UTM chưa gán Quản lý chính. */
export type UtmPrimaryFilter = number | 'none';
export type UtmSortKey =
  | 'newest'
  | 'oldest'
  | 'name_asc'
  | 'name_desc'
  | 'customers_desc'
  /** Tab "Tất cả": theo tên Quản lý chính A→Z, UTM chưa gán xếp cuối. */
  | 'primary_asc'
  /** Tab "Đã khoá": cập nhật gần nhất (xấp xỉ thời điểm khoá) lên đầu. */
  | 'updated_desc';

/** Sắp xếp mặc định: mới nhất. */
export const DEFAULT_UTM_SORT: UtmSortKey = 'newest';

export interface UtmExtraFilters {
  primary?: UtmPrimaryFilter;
  visibility?: UtmVisibilityFilter;
  /** Khoảng ngày tạo (gồm cả ngày đầu và ngày cuối). */
  createdRange?: [Dayjs | null, Dayjs | null] | null;
}

/** Lọc client-side: danh sách UTM là BOUNDED, không phân trang ở BE (giống "Nhóm tôi quản lý"). */
export const filterUtmRows = (
  rows: UtmView[],
  q: string,
  status: UtmStatusFilter | undefined,
  role: UtmRoleFilter | undefined,
  extra: UtmExtraFilters = {},
): UtmView[] => {
  const key = normalizeUtmName(q);
  const from = extra.createdRange?.[0]?.startOf('day');
  const to = extra.createdRange?.[1]?.endOf('day');
  return rows.filter((r) => {
    if (key && !normalizeUtmName(r.name).includes(key) && !normalizeUtmName(r.description ?? '').includes(key)) return false;
    if (status === 'active' && !r.isActive) return false;
    if (status === 'inactive' && r.isActive) return false;
    if (role && r.myRole !== role) return false;
    if (extra.primary === 'none' && r.primaryManager) return false;
    if (typeof extra.primary === 'number' && r.primaryManager?.id !== extra.primary) return false;
    if (extra.visibility && r.visibility !== extra.visibility) return false;
    if (from || to) {
      const created = dayjs(r.createdAt);
      if (from && created.isBefore(from)) return false;
      if (to && created.isAfter(to)) return false;
    }
    return true;
  });
};

const createdMs = (u: UtmView): number => {
  const t = dayjs(u.createdAt).valueOf();
  return Number.isNaN(t) ? 0 : t;
};

const updatedMs = (u: UtmView): number => {
  const t = dayjs(u.updatedAt).valueOf();
  return Number.isNaN(t) ? 0 : t;
};

/** Trả về mảng MỚI (không mutate). Hoà thì lấy id giảm dần cho 'newest' (UTM backfill cùng createdAt). */
export const sortUtmRows = (
  rows: UtmView[],
  sortKey: UtmSortKey = DEFAULT_UTM_SORT,
  counts: Record<number, number> = {},
): UtmView[] => {
  const byName = (a: UtmView, b: UtmView) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
  const copy = [...rows];
  switch (sortKey) {
    case 'oldest':
      return copy.sort((a, b) => createdMs(a) - createdMs(b) || a.id - b.id);
    case 'name_asc':
      return copy.sort(byName);
    case 'name_desc':
      return copy.sort((a, b) => byName(b, a));
    case 'customers_desc':
      return copy.sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || byName(a, b));
    case 'primary_asc':
      return copy.sort((a, b) => {
        const pa = a.primaryManager?.name;
        const pb = b.primaryManager?.name;
        if (!pa && !pb) return byName(a, b);
        if (!pa) return 1;
        if (!pb) return -1;
        return pa.localeCompare(pb, 'vi', { sensitivity: 'base' }) || byName(a, b);
      });
    case 'updated_desc':
      return copy.sort((a, b) => updatedMs(b) - updatedMs(a) || b.id - a.id);
    case 'newest':
    default:
      return copy.sort((a, b) => createdMs(b) - createdMs(a) || b.id - a.id);
  }
};
