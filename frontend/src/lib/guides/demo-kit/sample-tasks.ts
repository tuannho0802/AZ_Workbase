import type { PeriodicTask, PeriodType } from '@/lib/api/periodic-tasks.api';

/**
 * Dữ liệu MẪU cho các mẫu minh hoạ module Công việc định kỳ trong Hướng dẫn. Dữ liệu cứng, KHÔNG gọi API.
 * "Hôm nay" của mẫu là NGÀY CỐ ĐỊNH (`DEMO_TODAY`, Thứ Hai) - để các luật phụ thuộc ngày (quá hạn, ân hạn 7 ngày) cho
 * kết quả không đổi theo ngày người đọc mở bài; truyền vào đúng các hàm thật ở `lib/utils/periodicTaskOverdue.ts`.
 * 5 Trạng thái ở đây khớp 5 trạng thái hệ thống thật (mã + tên + màu ban đầu); tên/màu thật do Admin cấu hình ở "Quản lý Trạng thái" nên có thể khác.
 */
export const DEMO_TODAY = '2026-10-05';

export const DEMO_TASK_STATUSES = [
    { id: 1, code: 'not_started', name: 'To-Do', color: '#faad14', isDoneState: false },
    { id: 2, code: 'in_progress', name: 'Đang làm', color: '#1890ff', isDoneState: false },
    { id: 3, code: 'in_review', name: 'Xem xét', color: '#722ed1', isDoneState: false },
    { id: 4, code: 'completed', name: 'Hoàn thành', color: '#52c41a', isDoneState: true },
    { id: 5, code: 'not_completed', name: 'Không hoàn thành', color: '#f5222d', isDoneState: false },
] as const;

export const DEMO_TASK_DEPARTMENTS: Record<number, { id: number; name: string; color: string }> = {
    1: { id: 1, name: 'Kinh doanh 1', color: '#1890ff' },
    2: { id: 2, name: 'Kinh doanh 2', color: '#13c2c2' },
    3: { id: 3, name: 'Marketing', color: '#eb2f96' },
};

/** Người mẫu (id khớp `DEMO_PEOPLE` ở `personas.ts` để 2 bộ mẫu dùng chung nhân sự). */
const PEOPLE: Record<number, { id: number; name: string }> = {
    1: { id: 1, name: 'Admin' },
    2: { id: 2, name: 'Trợ lý Hà' },
    3: { id: 3, name: 'Quản lý Nam' },
    4: { id: 4, name: 'Sales An' },
    5: { id: 5, name: 'Sales Bình' },
    6: { id: 6, name: 'Marketing Mai' },
    8: { id: 8, name: 'Sales Dũng' },
};

interface TaskSeed {
    id: number;
    title: string;
    periodType: PeriodType;
    start: string;
    end: string;
    statusCode: (typeof DEMO_TASK_STATUSES)[number]['code'];
    primary: number;
    secondary?: number[];
    departmentId: number | null;
    createdBy: number;
    color?: string;
    description?: string;
    note?: string;
    checklist?: { done: number; total: number };
    customerCount?: number;
    lock?: { byId: number | null; note: string };
    overdueMarkedAt?: string;
}

const SEEDS: TaskSeed[] = [
    {
        id: 1, title: 'Gọi lại 5 khách tiềm năng', periodType: 'daily', start: '2026-10-05', end: '2026-10-05',
        statusCode: 'in_progress', primary: 4, secondary: [5], departmentId: 1, createdBy: 4, color: '#1890ff',
        description: 'Ưu tiên khách đã xem bảng giá tuần trước', checklist: { done: 2, total: 5 }, customerCount: 3,
    },
    {
        id: 2, title: 'Báo cáo doanh số tuần', periodType: 'weekly', start: '2026-10-05', end: '2026-10-11',
        statusCode: 'not_started', primary: 5, departmentId: 1, createdBy: 3, color: '#722ed1',
        note: 'Nộp trước 17h Chủ nhật', checklist: { done: 0, total: 3 },
    },
    {
        id: 3, title: 'Tổng kết doanh số tháng 10', periodType: 'monthly', start: '2026-10-01', end: '2026-10-31',
        statusCode: 'in_progress', primary: 3, secondary: [4, 5, 8], departmentId: 1, createdBy: 3, color: '#13c2c2',
        checklist: { done: 1, total: 4 },
    },
    {
        id: 4, title: 'Kế hoạch KPI năm 2026', periodType: 'yearly', start: '2026-01-01', end: '2026-12-31',
        statusCode: 'in_review', primary: 1, departmentId: 1, createdBy: 1, color: '#fa541c',
        checklist: { done: 6, total: 6 },
    },
    {
        id: 5, title: 'Đăng bài Facebook trong ngày', periodType: 'daily', start: '2026-10-05', end: '2026-10-05',
        statusCode: 'not_started', primary: 6, departmentId: 3, createdBy: 6, color: '#eb2f96',
    },
    {
        id: 6, title: 'Chốt số liệu quảng cáo tuần trước', periodType: 'weekly', start: '2026-09-28', end: '2026-10-04',
        statusCode: 'not_started', primary: 6, departmentId: 3, createdBy: 1, color: '#faad14',
    },
    {
        id: 7, title: 'Đối soát nạp tiền tuần trước', periodType: 'weekly', start: '2026-09-28', end: '2026-10-04',
        statusCode: 'in_progress', primary: 4, departmentId: 1, createdBy: 3, color: '#f5222d',
        overdueMarkedAt: '2026-10-05T01:30:00', customerCount: 2,
    },
    {
        id: 8, title: 'Chăm sóc khách VIP tháng 9', periodType: 'monthly', start: '2026-09-01', end: '2026-09-30',
        statusCode: 'not_started', primary: 8, departmentId: 2, createdBy: 8, color: '#2f54eb',
        lock: { byId: null, note: 'Tự động khoá: quá hạn kỳ hơn 7 ngày (ân hạn) mà chưa hoàn thành' },
    },
    {
        id: 9, title: 'Hoàn tất hồ sơ khách tháng 9', periodType: 'monthly', start: '2026-09-01', end: '2026-09-30',
        statusCode: 'completed', primary: 5, departmentId: 1, createdBy: 3, color: '#52c41a',
        lock: { byId: 1, note: 'Đã chốt số liệu tháng 9' }, checklist: { done: 4, total: 4 },
    },
    {
        id: 10, title: 'Gửi báo cáo cho Kinh doanh 2', periodType: 'daily', start: '2026-10-05', end: '2026-10-05',
        statusCode: 'in_progress', primary: 8, secondary: [6], departmentId: 2, createdBy: 8, color: '#08979c',
    },
];

function build(seed: TaskSeed): PeriodicTask {
    const status = DEMO_TASK_STATUSES.find((s) => s.code === seed.statusCode)!;
    const dept = seed.departmentId != null ? DEMO_TASK_DEPARTMENTS[seed.departmentId] : null;
    return {
        id: seed.id,
        title: seed.title,
        description: seed.description ?? null,
        periodType: seed.periodType,
        periodStartDate: seed.start,
        periodEndDate: seed.end,
        statusId: status.id,
        status: { ...status },
        primaryAssigneeId: seed.primary,
        primaryAssignee: PEOPLE[seed.primary],
        departmentId: seed.departmentId,
        department: dept,
        createdById: seed.createdBy,
        createdBy: PEOPLE[seed.createdBy],
        updatedById: null,
        updatedBy: null,
        completedAt: null,
        note: seed.note ?? null,
        color: seed.color ?? null,
        createdAt: '2026-09-28T08:00:00',
        updatedAt: '2026-09-28T08:00:00',
        isLocked: !!seed.lock,
        lockedById: seed.lock?.byId ?? null,
        lockedAt: seed.lock ? '2026-10-05T07:00:00' : null,
        lockNote: seed.lock?.note ?? null,
        overdueMarkedAt: seed.overdueMarkedAt ?? null,
        overdueMarkedById: null,
        secondaryAssignees: (seed.secondary ?? []).map((id) => PEOPLE[id]),
        customerCount: seed.customerCount ?? 0,
        checklistProgress: seed.checklist,
    };
}

export const DEMO_TASKS: PeriodicTask[] = SEEDS.map(build);

/** Tên người khoá cho Tooltip \"Đã khoá\" (trang thật tra qua danh sách nhân viên). */
export function demoUserName(id: number | null | undefined): string | undefined {
    return id != null ? PEOPLE[id]?.name : undefined;
}