import { describe, expect, it } from 'vitest';
import { DEMO_CUSTOMERS } from './sample-customers';
import { DEMO_PERSONAS, findPersona } from './personas';
import { COL, computeCustomerTableView } from './compute-view';

const view = (id: string) => computeCustomerTableView(DEMO_CUSTOMERS, findPersona(id)!);
const ids = (id: string) => view(id).rows.map((r) => r.id);

describe('computeCustomerTableView - dòng thấy theo phạm vi', () => {
  it('Admin/Assistant: thấy tất cả', () => {
    expect(ids('admin')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids('assistant')).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('Manager (department): phòng ban 1 + khách của chính mình (superset của own)', () => {
    expect(ids('manager')).toEqual([1, 3]);
  });
  it('Sales chính: khách mình tạo/chính/được chia', () => {
    expect(ids('sales-primary')).toEqual([1]);
  });
  it('Sales phụ: thấy khách được chia + khách của mình', () => {
    expect(ids('sales-shared')).toEqual([1, 3]);
  });
  it('Marketing: khách mình tạo hoặc phụ trách marketing', () => {
    expect(ids('marketing')).toEqual([1, 2]);
  });
  it('Content: chỉ khách mình tạo', () => {
    expect(ids('content')).toEqual([4]);
  });
  it('không có customers.view -> không thấy dòng nào', () => {
    const p = { ...findPersona('admin')!, permissions: [] };
    expect(computeCustomerTableView(DEMO_CUSTOMERS, p).rows).toEqual([]);
  });
});

describe('computeCustomerTableView - cột & nút', () => {
  it('chỉ người có customers.delete mới có cột Thao tác', () => {
    expect(view('admin').columns).toContain(COL.action);
    for (const id of ['assistant', 'manager', 'sales-primary', 'content']) {
      expect(view(id).columns).not.toContain(COL.action);
    }
  });
  it('Content: ẩn cột Sales, Marketing, Nạp tiền theo hiddenKeys', () => {
    const cols = view('content').columns;
    for (const c of [COL.sales, COL.marketing, COL.deposit]) expect(cols).not.toContain(c);
    expect(cols).toContain(COL.status);
  });
  it('các persona khác có đủ 12 cột (13 với Admin)', () => {
    expect(view('assistant').columns).toHaveLength(12);
    expect(view('admin').columns).toHaveLength(13);
  });
  it('thanh công cụ theo permission', () => {
    expect(view('admin').toolbar).toContain('Xuất Excel');
    expect(view('sales-primary').toolbar).not.toContain('Nhập Excel');
    expect(view('content').toolbar).toEqual(['Làm mới', 'Thêm khách hàng']);
  });
  it('canEditStatus theo customers.edit', () => {
    expect(view('sales-primary').canEditStatus).toBe(true);
    expect(view('content').canEditStatus).toBe(false);
  });
  it('mọi persona dùng key permission/hidden hợp lệ (field:*/tab:* thuộc CUSTOMER_ELEMENT_KEYS)', () => {
    const allowed = ['field:sales_assignment', 'field:marketing_assignment', 'field:assigned_date', 'field:closed_date', 'tab:deposits', 'tab:assignments', 'tab:groups'];
    for (const p of DEMO_PERSONAS) {
      for (const k of p.hiddenKeys) expect(allowed).toContain(k);
      for (const k of p.permissions) expect(k).toMatch(/^customers\.[a-z_]+$/);
    }
  });
});
