/**
 * Người xem MẪU cho các mẫu minh hoạ trong Hướng dẫn. Dữ liệu cứng, KHÔNG gọi API.
 * Quy tắc mô phỏng (đối chiếu code thật, xem `compute-view.ts`):
 *  - `scope` = phạm vi XEM của `customers.view` (own | department | all) - `CustomerAccessHelper.applyViewFilter`.
 *  - `permissions` = các key `customers.*` người này đang có (quyết định nút trên thanh công cụ / cột Thao tác).
 *  - `hiddenKeys` = `field:*`/`tab:*` bị ẩn theo cấu hình "Ẩn trường" (ui-visibility, resource `customers`).
 */
export type DemoScope = 'own' | 'department' | 'all';

export interface DemoPerson {
    id: number;
    name: string;
}

export interface DemoPersona {
    id: string;
    label: string;
    userId: number;
    roleLabel: string;
    /** Phòng ban người này QUẢN LÝ (department_managers) - chỉ có nghĩa với scope = department. */
    managedDepartmentIds: number[];
    scope: DemoScope;
    permissions: string[];
    hiddenKeys: string[];
    /** Câu giải thích hiển thị dưới bảng. */
    note: string;
}

export const DEMO_DEPARTMENTS: Record<number, string> = {
    1: 'Kinh doanh 1',
    2: 'Kinh doanh 2',
    3: 'Marketing',
};

export const DEMO_PEOPLE: Record<string, DemoPerson> = {
    admin: { id: 1, name: 'Admin' },
    assistant: { id: 2, name: 'Trợ lý Hà' },
    manager: { id: 3, name: 'Quản lý Nam' },
    salesA: { id: 4, name: 'Sales An' },
    salesB: { id: 5, name: 'Sales Bình' },
    marketingM: { id: 6, name: 'Marketing Mai' },
    contentC: { id: 7, name: 'Content Chi' },
    salesD: { id: 8, name: 'Sales Dũng' },
};

const BASE_EMPLOYEE = ['customers.view', 'customers.create', 'customers.edit', 'customers.assign'];

export const DEMO_PERSONAS: DemoPersona[] = [
    {
        id: 'admin',
        label: 'Admin',
        userId: 1,
        roleLabel: 'Admin',
        managedDepartmentIds: [],
        scope: 'all',
        permissions: [...BASE_EMPLOYEE, 'customers.import', 'customers.export', 'customers.delete'],
        hiddenKeys: [],
        note: 'Admin thấy mọi khách hàng và có đủ nút, kể cả cột Thao tác (Xoá).',
    },
    {
        id: 'assistant',
        label: 'Assistant',
        userId: 2,
        roleLabel: 'Assistant',
        managedDepartmentIds: [],
        scope: 'all',
        permissions: [...BASE_EMPLOYEE, 'customers.import', 'customers.export'],
        hiddenKeys: [],
        note: 'Assistant thấy mọi khách hàng như Admin nhưng không có quyền Xoá nên bảng không có cột Thao tác.',
    },
    {
        id: 'manager',
        label: 'Manager',
        userId: 3,
        roleLabel: 'Manager (quản lý Kinh doanh 1)',
        managedDepartmentIds: [1],
        scope: 'department',
        permissions: [...BASE_EMPLOYEE, 'customers.import', 'customers.export'],
        hiddenKeys: [],
        note: 'Manager thấy khách thuộc phòng ban mình quản lý, CỘNG thêm khách của chính mình (tạo / Sales chính / Marketing / được chia).',
    },
    {
        id: 'sales-primary',
        label: 'Sales chính',
        userId: 4,
        roleLabel: 'Employee - Sales An',
        managedDepartmentIds: [],
        scope: 'own',
        permissions: BASE_EMPLOYEE,
        hiddenKeys: [],
        note: 'Employee chỉ thấy khách mình tạo, mình là Sales chính, mình là Marketing phụ trách hoặc đang được chia.',
    },
    {
        id: 'sales-shared',
        label: 'Sales phụ',
        userId: 5,
        roleLabel: 'Employee - Sales Bình',
        managedDepartmentIds: [],
        scope: 'own',
        permissions: BASE_EMPLOYEE,
        hiddenKeys: [],
        note: 'Sales phụ thấy được các khách mà mình được chia, ngoài các khách của chính mình.',
    },
    {
        id: 'marketing',
        label: 'Marketing',
        userId: 6,
        roleLabel: 'Employee - phòng Marketing',
        managedDepartmentIds: [],
        scope: 'own',
        permissions: BASE_EMPLOYEE,
        hiddenKeys: [],
        note: 'Marketing thấy khách mình tạo hoặc mình là Marketing phụ trách.',
    },
    {
        id: 'content',
        label: 'Content (ví dụ ẩn cột)',
        userId: 7,
        roleLabel: 'Employee - vị trí Content',
        managedDepartmentIds: [],
        scope: 'own',
        permissions: ['customers.view', 'customers.create'],
        hiddenKeys: ['field:sales_assignment', 'field:marketing_assignment', 'field:assigned_date', 'field:closed_date', 'tab:deposits'],
        note: 'Ví dụ cấu hình: Admin ẩn các trường phân công/ngày chốt cho vị trí Content nên bảng mất cột Sales, Marketing và Nạp tiền. Cấu hình thật do Admin quyết định.',
    },
];

export function findPersona(id: string): DemoPersona | undefined {
    return DEMO_PERSONAS.find((p) => p.id === id);
}
