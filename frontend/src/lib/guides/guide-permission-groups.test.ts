import { describe, expect, it } from 'vitest';
import { groupPermissionOptions, matchPermissionOption } from './guide-permission-groups';

const P = (key: string, description: string | null = null) => {
  const [resource, action] = key.split('.');
  return { key, resource, action, description };
};

describe('groupPermissionOptions', () => {
  const groups = groupPermissionOptions([
    P('roles.view', 'Xem phân quyền'),
    P('customers.assign', 'Chia data'),
    P('customers.edit'),
    P('mystery.do'),
  ]);

  it('gom theo resource, đặt tên nhóm tiếng Việt (resource lạ giữ raw key)', () => {
    expect(groups.map((g) => g.label).sort()).toEqual(['Khách hàng', 'Phân quyền', 'mystery'].sort());
  });

  it('giữ thứ tự quyền trong nhóm như BE trả về và mang theo tên nhóm để tìm kiếm', () => {
    const customers = groups.find((g) => g.label === 'Khách hàng')!;
    expect(customers.options.map((o) => o.value)).toEqual(['customers.assign', 'customers.edit']);
    expect(customers.options[1]).toMatchObject({ label: 'customers.edit', description: '', groupLabel: 'Khách hàng' });
  });
});

describe('matchPermissionOption', () => {
  const opt = { value: 'customers.assign', description: 'Chia data', groupLabel: 'Khách hàng' };
  it('khớp theo key, mô tả hoặc tên nhóm, không phân biệt hoa thường', () => {
    expect(matchPermissionOption('ASSIGN', opt)).toBe(true);
    expect(matchPermissionOption('chia', opt)).toBe(true);
    expect(matchPermissionOption('khách hàng', opt)).toBe(true);
    expect(matchPermissionOption('roles', opt)).toBe(false);
  });
  it('ô tìm trống -> khớp hết', () => {
    expect(matchPermissionOption('  ', opt)).toBe(true);
  });
});
