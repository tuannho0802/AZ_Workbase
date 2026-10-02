import { resourceLabel } from '@/lib/permissions/resource-labels';
import type { GuidePermissionBrief } from '@/lib/api/guides.api';

export interface PermissionOption {
  value: string;
  /** Hiện trong tag đã chọn (raw key). */
  label: string;
  description: string;
  /** Tên nhóm tiếng Việt - để tìm kiếm theo tên nhóm ("khách hàng" ra mọi quyền customers.*). */
  groupLabel: string;
}

export interface PermissionGroup {
  label: string;
  options: PermissionOption[];
}

/**
 * Gom permission theo resource như drawer trang Phân quyền (tiêu đề nhóm = tên tiếng Việt).
 * Nhóm xếp theo tên (vi), quyền trong nhóm giữ thứ tự BE trả về (resource, action ASC).
 */
export function groupPermissionOptions(permissions: GuidePermissionBrief[]): PermissionGroup[] {
  const byResource = new Map<string, PermissionOption[]>();
  for (const p of permissions) {
    const groupLabel = resourceLabel(p.resource);
    const list = byResource.get(p.resource) ?? [];
    list.push({ value: p.key, label: p.key, description: p.description ?? '', groupLabel });
    byResource.set(p.resource, list);
  }
  return [...byResource.entries()]
    .map(([resource, options]) => ({ label: resourceLabel(resource), options }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

/** Tìm theo key, mô tả hoặc tên nhóm (không phân biệt hoa thường). */
export function matchPermissionOption(
  input: string,
  option?: { value?: string | number | null; description?: string; groupLabel?: string },
): boolean {
  const q = input.trim().toLowerCase();
  if (!q) return true;
  return `${option?.value ?? ''} ${option?.description ?? ''} ${option?.groupLabel ?? ''}`.toLowerCase().includes(q);
}
