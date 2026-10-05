import type { DemoScope } from './personas';

/**
 * Người xem MẪU cho các mẫu minh hoạ module Công việc định kỳ. Dữ liệu cứng, KHÔNG gọi API.
 * Đối chiếu seed migration (xem `compute-task-view.test.ts`):
 *  - `1782100000000`: view/create/edit = admin+assistant `all`, manager `department`, employee `own`; delete = chỉ admin.
 *  - `1782600000000`: approve = admin+assistant `all`, manager `department` (employee KHÔNG có); edit_locked = chỉ admin.
 *  - `1782400000000`: link_customer = admin+assistant.   `1784300000000`: trash_manage = chỉ admin.
 *  - `1783200000000`: audit_view = sao chép từ view.
 * `scopes` khai phạm vi cho từng key có hỗ trợ scope (key thiếu = không có scope / nhị phân).
 */
export interface TaskPersona {
    id: string;
    label: string;
    userId: number;
    roleLabel: string;
    /** Phòng ban người này QUẢN LÝ (department_managers) - chỉ có nghĩa khi scope xem = department. */
    managedDepartmentIds: number[];
    permissions: string[];
    scopes: Partial<Record<string, DemoScope>>;
    note: string;
}

const EMPLOYEE_PERMS = ['periodic_tasks.view', 'periodic_tasks.create', 'periodic_tasks.edit', 'periodic_tasks.audit_view', 'customers.view'];
const EMPLOYEE_SCOPES: TaskPersona['scopes'] = {
    'periodic_tasks.view': 'own',
    'periodic_tasks.create': 'own',
    'periodic_tasks.edit': 'own',
    'periodic_tasks.audit_view': 'own',
};

export const TASK_PERSONAS: TaskPersona[] = [
    {
        id: 'admin',
        label: 'Admin',
        userId: 1,
        roleLabel: 'Admin',
        managedDepartmentIds: [],
        permissions: [
            ...EMPLOYEE_PERMS,
            'periodic_tasks.delete',
            'periodic_tasks.approve',
            'periodic_tasks.edit_locked',
            'periodic_tasks.link_customer',
            'periodic_tasks.trash_manage',
        ],
        scopes: {
            'periodic_tasks.view': 'all',
            'periodic_tasks.create': 'all',
            'periodic_tasks.edit': 'all',
            'periodic_tasks.audit_view': 'all',
            'periodic_tasks.delete': 'all',
            'periodic_tasks.approve': 'all',
        },
        note: 'Admin thấy mọi Công việc, có đủ nút - kể cả Sửa khi đang khoá, Xoá và tab Thùng rác.',
    },
    {
        id: 'assistant',
        label: 'Assistant',
        userId: 2,
        roleLabel: 'Assistant',
        managedDepartmentIds: [],
        permissions: [...EMPLOYEE_PERMS, 'periodic_tasks.approve', 'periodic_tasks.link_customer'],
        scopes: {
            'periodic_tasks.view': 'all',
            'periodic_tasks.create': 'all',
            'periodic_tasks.edit': 'all',
            'periodic_tasks.audit_view': 'all',
            'periodic_tasks.approve': 'all',
        },
        note: 'Assistant thấy mọi Công việc và được Khoá/Mở khoá, nhưng KHÔNG được Xoá, không sửa được việc đang khoá và không có Thùng rác (mặc định).',
    },
    {
        id: 'manager',
        label: 'Manager',
        userId: 3,
        roleLabel: 'Manager (quản lý Kinh doanh 1)',
        managedDepartmentIds: [1],
        permissions: [...EMPLOYEE_PERMS, 'periodic_tasks.approve'],
        scopes: {
            'periodic_tasks.view': 'department',
            'periodic_tasks.create': 'department',
            'periodic_tasks.edit': 'department',
            'periodic_tasks.audit_view': 'department',
            'periodic_tasks.approve': 'department',
        },
        note: 'Manager CHỈ thấy Công việc thuộc phòng ban mình quản lý. Khác bảng Khách hàng: KHÔNG cộng thêm việc riêng của mình nếu việc đó thuộc phòng ban khác.',
    },
    {
        id: 'employee-primary',
        label: 'Employee (Phụ trách chính)',
        userId: 4,
        roleLabel: 'Employee - Sales An',
        managedDepartmentIds: [],
        permissions: EMPLOYEE_PERMS,
        scopes: EMPLOYEE_SCOPES,
        note: 'Employee thấy việc mình tạo, mình Phụ trách chính, hoặc mình là Phụ trách phụ. Không có Khoá/Mở khoá và không có nút Xoá (mặc định).',
    },
    {
        id: 'employee-secondary',
        label: 'Employee (Phụ trách phụ)',
        userId: 5,
        roleLabel: 'Employee - Sales Bình',
        managedDepartmentIds: [],
        permissions: EMPLOYEE_PERMS,
        scopes: EMPLOYEE_SCOPES,
        note: 'Sales Bình được thêm làm Phụ trách phụ ở một số việc nên vẫn thấy và sửa được các việc đó, ngoài việc của chính mình.',
    },
    {
        id: 'employee-delete-own',
        label: 'Employee (ví dụ được cấp Xoá)',
        userId: 5,
        roleLabel: 'Employee - Sales Bình (Admin đã cấp "Xoá" phạm vi Chỉ của mình)',
        managedDepartmentIds: [],
        permissions: [...EMPLOYEE_PERMS, 'periodic_tasks.delete'],
        scopes: { ...EMPLOYEE_SCOPES, 'periodic_tasks.delete': 'own' },
        note: 'Ví dụ cấu hình: khi Admin cấp "Xoá" phạm vi "Chỉ của mình", nút Xoá CHỈ hiện ở việc mình tạo hoặc mình Phụ trách chính - việc chỉ làm Phụ trách phụ thì không có nút Xoá.',
    },
    {
        id: 'employee-unassigned',
        label: 'Employee (chưa được giao)',
        userId: 7,
        roleLabel: 'Employee - Content Chi',
        managedDepartmentIds: [],
        permissions: EMPLOYEE_PERMS,
        scopes: EMPLOYEE_SCOPES,
        note: 'Chi chưa tạo việc nào và chưa được giao việc nào nên danh sách trống (chỉ có nút "Tạo Công việc mới").',
    },
    {
        id: 'no-permission',
        label: 'Thiếu quyền Xem',
        userId: 9,
        roleLabel: 'Role không có "Xem Công việc"',
        managedDepartmentIds: [],
        permissions: [],
        scopes: {},
        note: 'Không có periodic_tasks.view thì trang tự chuyển hướng về trang chủ - người này không vào được trang Công việc định kỳ.',
    },
];

export function findTaskPersona(id: string): TaskPersona | undefined {
    return TASK_PERSONAS.find((p) => p.id === id);
}
