import type { DemoCustomer } from './sample-customers';
import type { DemoPersona } from './personas';

/**
 * HÀM THUẦN mô phỏng "người này thấy gì" trên bảng Khách hàng. Nguồn đối chiếu (đọc code thật):
 *  - Dòng: `backend/.../customer-access.helper.ts` `applyViewFilter` -
 *      all = tất cả; department = phòng ban mình quản lý HOẶC "own"; own = mình tạo / Sales chính /
 *      Marketing phụ trách / có lượt gán active.
 *  - Cột: `customers/page.tsx` - `field:sales_assignment`, `field:marketing_assignment` ẩn cột Sales/Marketing;
 *      `tab:deposits` ẩn cột Nạp tiền; cột Thao tác chỉ có khi `customers.delete`.
 *  - Nút thanh công cụ: Thêm (customers.create), Nhập/Xuất Excel (import/export), "Gán cho Sales" (customers.assign
 *    và có chọn dòng).
 */
export interface CustomerTableView {
    rows: DemoCustomer[];
    columns: string[];
    toolbar: string[];
    canEditStatus: boolean;
}

export const COL = {
    stt: 'stt',
    inputDate: 'inputDate',
    name: 'name',
    phone: 'phone',
    source: 'source',
    utm: 'utm',
    sales: 'sales',
    marketing: 'marketing',
    status: 'status',
    joined: 'joined',
    deposit: 'deposit',
    notes: 'notes',
    action: 'action',
} as const;

export function isOwnRow(c: DemoCustomer, userId: number): boolean {
    return (
        c.createdById === userId ||
        c.salesUser?.id === userId ||
        c.marketingUser?.id === userId ||
        c.activeAssignees.some((a) => a.id === userId)
    );
}

export function canSeeRow(c: DemoCustomer, p: DemoPersona): boolean {
    if (p.scope === 'all') return true;
    if (p.scope === 'department') return p.managedDepartmentIds.includes(c.departmentId) || isOwnRow(c, p.userId);
    return isOwnRow(c, p.userId);
}

export function computeCustomerTableView(rows: DemoCustomer[], p: DemoPersona): CustomerTableView {
    const has = (k: string) => p.permissions.includes(k);
    const hidden = (k: string) => p.hiddenKeys.includes(k);
    const columns: string[] = [COL.stt, COL.inputDate, COL.name, COL.phone, COL.source, COL.utm];
    if (!hidden('field:sales_assignment')) columns.push(COL.sales);
    if (!hidden('field:marketing_assignment')) columns.push(COL.marketing);
    columns.push(COL.status, COL.joined);
    if (!hidden('tab:deposits')) columns.push(COL.deposit);
    columns.push(COL.notes);
    if (has('customers.delete')) columns.push(COL.action);

    const toolbar: string[] = ['Làm mới'];
    if (has('customers.create')) toolbar.push('Thêm khách hàng');
    if (has('customers.import')) toolbar.push('Nhập Excel');
    if (has('customers.export')) toolbar.push('Xuất Excel');
    if (has('customers.assign')) toolbar.push('Gán cho Sales (khi đã chọn dòng)');

    return {
        rows: has('customers.view') ? rows.filter((c) => canSeeRow(c, p)) : [],
        columns,
        toolbar,
        canEditStatus: has('customers.edit'),
    };
}
