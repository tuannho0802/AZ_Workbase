'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Table,
    Button,
    Tag,
    Space,
    Modal,
    Form,
    Input,
    Select,
    DatePicker,
    App,
    Typography,
    Tooltip,
    Row,
    Col,
    ColorPicker,
    Alert,
    Avatar,
    Segmented,
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    SearchOutlined,
    SettingOutlined,
    LockOutlined,
    TableOutlined,
    UnorderedListOutlined,
    AppstoreOutlined,
    CalendarOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAuthStore } from '@/lib/stores/auth.store';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { useDepartments } from '@/lib/hooks/useDepartments';
import { useUsersList } from '@/lib/hooks/useUsers';
import { usePeriodicTaskStatuses } from '@/lib/hooks/usePeriodicTaskStatuses';
import { useCustomers } from '@/lib/hooks/useCustomers';
import { useAddTaskCustomers, useRemoveTaskCustomer } from '@/lib/hooks/usePeriodicTaskCustomers';
import { useAddTaskSecondaryAssignee, useRemoveTaskSecondaryAssignee } from '@/lib/hooks/usePeriodicTaskSecondaryAssignees';
import {
    usePeriodicTasks,
    usePeriodicTask,
    useCreatePeriodicTask,
    useUpdatePeriodicTask,
    useDeletePeriodicTask,
    useLockPeriodicTask,
    useUnlockPeriodicTask,
} from '@/lib/hooks/usePeriodicTasks';
import {
    PeriodicTask,
    PeriodType,
    PERIOD_TYPE_LABELS,
    CreatePeriodicTaskPayload,
} from '@/lib/api/periodic-tasks.api';
import { resolveEntityColor, DEFAULT_ENTITY_COLOR } from '@/lib/utils/entityColor';
import { Customer } from '@/lib/types/customer.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { useRoleColorMap, useRoleColors } from '@/lib/hooks/useRoleColorMap';
import { TaskLinksModal } from '@/components/periodic-tasks/TaskLinksModal';
import { TaskChecklistModal } from '@/components/periodic-tasks/TaskChecklistModal';
import { TaskAuditLogsModal } from '@/components/periodic-tasks/TaskAuditLogsModal';
import { TaskActionsBar } from '@/components/periodic-tasks/TaskActionsBar';
import { PeriodicTasksAgendaView } from '@/components/periodic-tasks/PeriodicTasksAgendaView';
import { PeriodicTasksKanbanView } from '@/components/periodic-tasks/PeriodicTasksKanbanView';
import { PeriodicTasksCalendarView } from '@/components/periodic-tasks/PeriodicTasksCalendarView';
import { TaskTitlePill, TaskChainBadge } from '@/components/periodic-tasks/TaskTitlePill';
import { buildTaskLinkChains, sortTasksByChain, getChainRunFlags } from '@/lib/utils/taskLinkChains';
import { useTaskLinksAmong } from '@/lib/hooks/usePeriodicTaskLinks';
import { customerPhoneDisplay, customerPlainLabel, renderCustomerOption } from '@/components/common/customer-option-render';
import { SimpleList } from '@/components/common/SimpleList';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

/**
 * Trang chính "Công việc định kỳ" (Phase 1 + 2 + 5 + 6 -
 * PLAN_PERIODIC_TASKS_MODULE.md mục 6). Phase 2 (liên kết cha-con DAG +
 * % hoàn thành), Phase 3 (gắn Customer), Phase 4 (Phụ trách phụ) được UI qua
 * nút "Liên kết" mở `TaskLinksModal` - xem file đó. Phase 5 (Khoá/Mở khoá -
 * `is_locked`, PLAN mục 2.9) dựng NGAY tại trang này (không phải trong
 * `TaskLinksModal`) vì đây là hành động "chốt/gate" cấp Task, tương tự Sửa/
 * Xoá - không phải dữ liệu con như liên kết/Customer/Phụ trách phụ. Phase 6
 * (checklist con kiểu Trello) qua nút "Checklist" mở `TaskChecklistModal`
 * riêng (không nhét vào `TaskLinksModal` - đủ lớn để tách thành nhóm chức
 * năng độc lập của riêng nó) - xem file đó. Phase 7 (CUỐI - audit log riêng)
 * qua nút "Lịch sử" mở `TaskAuditLogsModal` riêng (chỉ xem, không có hành
 * động sửa nào nên không cần gate `periodic_tasks.edit`) - xem file đó.
 * Phase 8 (PLAN mục Phase 8, "Cải tiến view switcher") thêm `Segmented` đổi
 * giữa 4 giao diện xem: 'table' (gốc, giữ nguyên 100%, có phân trang) /
 * 'agenda' (mặc định - `PeriodicTasksAgendaView`, gộp theo Ngày, mặc định mở
 * đúng hôm nay/gần nhất - giải quyết vấn đề khó kiểm tra ngày giờ ở bảng
 * gốc) / 'kanban' (`PeriodicTasksKanbanView`, kéo-thả đổi statusId qua
 * `@dnd-kit`) / 'calendar' (`PeriodicTasksCalendarView`, dùng `Calendar` có
 * sẵn của antd). Nhóm nút Thao tác tách ra `TaskActionsBar` dùng chung cho
 * cả 4 view (tránh lệch RBAC giữa các nơi) - xem JSDoc từng file trong
 * `components/periodic-tasks/`. View 4 (Timeline/Gantt rút gọn) CỐ TÌNH lùi
 * lại theo đúng research (ROI thấp với quy mô Task hiện tại, cần thư viện
 * vẽ riêng) - xem entry Phase 8 ở `WORKFLOW_LOG.md`.
 *
 * 2 permission tách bạch (PLAN mục 2.9):
 *  - `periodic_tasks.approve`: bật/tắt được `is_locked` (2 chiều tự do,
 *    KHÔNG phải workflow 1 chiều) - nút Khoá/Mở khoá CHỈ hiện khi có quyền
 *    này (`canApprove`).
 *  - `periodic_tasks.edit_locked`: khi Task ĐANG khoá, có được bấm "Sửa"
 *    hay không - THIẾU quyền này thì nút "Sửa" vẫn HIỆN (để user biết Task
 *    tồn tại và mình có `periodic_tasks.edit`) nhưng bị `disabled` kèm
 *    Tooltip giải thích, tránh gọi PATCH rồi nhận 403 mới biết.
 *
 * RBAC: mọi filter/scope (own/department/all) đã được BE tự áp qua
 * `PeriodicTaskAccessHelper` (xem `periodic-tasks.service.ts`) - FE chỉ việc
 * gọi `/periodic-tasks` bình thường, KHÔNG tự lọc lại theo user.
 */
export default function PeriodicTasksPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const user = useAuthStore((s) => s.user);
    const { can, isLoading: permissionsLoading } = useMyPermissions();

    useEffect(() => {
        if (!permissionsLoading && user && !can('periodic_tasks.view')) {
            router.replace('/customers');
        }
    }, [user, router]);

    const canCreate = can('periodic_tasks.create');
    const canEdit = can('periodic_tasks.edit');
    // Xoá KHÔNG có scope - chỉ Admin mới có permission này (seed
    // `1782100000000-SeedPeriodicTasksPermissions.ts`: delete chỉ role
    // admin, scope 'all'), khác hẳn view/create/edit có 3 mức own/department/all.
    const canDelete = can('periodic_tasks.delete');
    const canManageStatuses = can('periodic_task_statuses.view');
    // Phase 5 (PLAN mục 2.9) - 2 permission tách bạch, xem JSDoc đầu file.
    const canApprove = can('periodic_tasks.approve');
    const canEditLocked = can('periodic_tasks.edit_locked');

    // ---- Filter (server-side, mirror CustomerFilters) ----
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const search = useDebounce(searchInput, 300);
    const [periodType, setPeriodType] = useState<PeriodType | undefined>(undefined);
    const [statusId, setStatusId] = useState<number | undefined>(undefined);
    const [primaryAssigneeId, setPrimaryAssigneeId] = useState<number | undefined>(undefined);
    const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

    const filters = useMemo(
        () => ({
            page,
            limit,
            search: search || undefined,
            periodType,
            statusId,
            primaryAssigneeId,
            departmentId,
            dateFrom: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined,
            dateTo: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined,
        }),
        [page, limit, search, periodType, statusId, primaryAssigneeId, departmentId, dateRange],
    );

    // ---- Phase 8 (PLAN mục Phase 8) - View switcher ----
    // 'table' giữ NGUYÊN giao diện gốc (Phase 1-7, có phân trang server-side)
    // - 3 view còn lại (Agenda/Kanban/Calendar) không phân trang (mirror
    // Kanban/Calendar thông thường - xem 1 view của TẤT CẢ Task khớp filter,
    // không cắt trang), nên dùng 1 query RIÊNG với `limit` lớn hơn hẳn thay
    // vì tái dùng `filters` (vốn có `page`/`limit` nhỏ cho Table). Chỉ BẬT
    // đúng 1 trong 2 query tại 1 thời điểm (`enabled`) - tránh gọi cả 2 API
    // song song khi người dùng chỉ đang xem 1 view.
    const [view, setView] = useState<'table' | 'agenda' | 'kanban' | 'calendar'>('agenda');

    const { data, isLoading, isFetching } = usePeriodicTasks(filters, view === 'table');
    const tasks = data?.data ?? [];

    const nonTableFilters = useMemo(
        () => ({
            page: 1,
            // 100 - BUG THẬT đã gặp (2026-09-15, xem WORKFLOW_LOG): giá trị
            // gốc là 500 nhưng `PeriodicTaskFiltersDto.limit` ở Backend giới
            // hạn cứng `@Max(100)` (đúng convention chung toàn dự án, xem
            // `CustomerFiltersDto` cùng mức 100) - luôn bị 400 "limit must
            // not be greater than 100" cho MỌI role (kể cả Admin), khiến 3/4
            // view (Agenda/Kanban/Calendar) không tải được data, chỉ view
            // Bảng (dùng `limit` nhỏ từ Table) còn chạy được. 100 vẫn đủ lớn
            // cho quy mô Task hiện tại (vài chục Task) - không đổi giới hạn
            // Backend để giữ đúng convention chung, chỉ sửa FE cho khớp.
            limit: 100,
            search: search || undefined,
            periodType,
            statusId,
            primaryAssigneeId,
            departmentId,
            dateFrom: dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined,
            dateTo: dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined,
        }),
        [search, periodType, statusId, primaryAssigneeId, departmentId, dateRange],
    );
    const { data: viewData, isLoading: viewLoading, isFetching: viewFetching } = usePeriodicTasks(
        nonTableFilters,
        view !== 'table',
    );
    const viewTasks = viewData?.data ?? [];

    // Phase 8 (yêu cầu chủ dự án 2026-09-15): UI "nối/xếp hàng" các Task đã
    // liên kết (Phase 2 - `periodic_task_links`). Chỉ tra cạnh liên kết
    // trong đúng danh sách Task đang hiển thị Ở VIEW HIỆN TẠI (`tasks` cho
    // Bảng, `viewTasks` cho 3 view còn lại) - 1 API DUY NHẤT/lần đổi view
    // hoặc đổi filter (không gọi lặp theo từng Task, xem JSDoc
    // `useTaskLinksAmong`). Task nằm ngoài danh sách đang tải (khác trang/
    // khác filter) sẽ KHÔNG được nối trực quan - chấp nhận được vì đây là
    // tính năng trang trí, không phải nguồn dữ liệu chính thức (BE trả đúng
    // Phase 2 `getChildren`/`getParents`/`rollup` mới là nguồn thật).
    const currentViewTasks = view === 'table' ? tasks : viewTasks;
    const currentViewTaskIds = useMemo(() => currentViewTasks.map((t) => t.id), [currentViewTasks]);
    const { data: linksData } = useTaskLinksAmong(currentViewTaskIds, currentViewTaskIds.length > 0);
    const chains = useMemo(() => buildTaskLinkChains(linksData?.edges ?? []), [linksData]);
    const currentViewTasksById = useMemo(() => new Map(currentViewTasks.map((t) => [t.id, t])), [currentViewTasks]);
    const resolveChainTask = (taskId: number) => currentViewTasksById.get(taskId);
    const tableTasksSorted = useMemo(() => sortTasksByChain(tasks, chains), [tasks, chains]);
    // Phase 8 (yêu cầu chủ dự án 2026-09-15): đường nối chuỗi ở Bảng phải
    // giống Agenda (đường kẻ dọc liên tục + chấm tròn), KHÔNG còn viền trái
    // màu như trước - xem JSDoc `getChainRunFlags()`.
    const chainRunFlags = useMemo(
        () => getChainRunFlags(tableTasksSorted, chains, linksData?.edges ?? []),
        [tableTasksSorted, chains, linksData],
    );

    const { statuses } = usePeriodicTaskStatuses();
    const { departments } = useDepartments();
    const { users } = useUsersList();

    // Phase 5: `lockedById` KHÔNG kèm object quan hệ từ BE (xem JSDoc
    // `PeriodicTask.lockedById` ở periodic-tasks.api.ts) - tự tra tên qua
    // `users` đã có sẵn ở đây.
    const userNameById = useMemo(() => {
        const map = new Map<number, string>();
        for (const u of users as Array<{ id: number; name: string }>) map.set(u.id, u.name);
        return map;
    }, [users]);

    // Avatar + Tag Vai trò/Phòng ban cho dropdown "Người phụ trách chính" -
    // mirror ĐÚNG `renderUserOption` ở CustomerFilters.tsx/chia-data/page.tsx
    // (cùng nguồn useUsersList() đã JOIN department/position, chỉ thiếu Tag
    // màu nên trước đây hiện tên trơn, không đồng bộ với các dropdown khác).
    const { getRoleColor } = useRoleColorMap();
    const { roleColors: allRoles } = useRoleColors();
    const roleNameMap = new Map(allRoles.map((r) => [r.code, r.name]));
    const getRoleName = (code?: string) => (code ? roleNameMap.get(code) || code : '');
    const tagStyle: { fontSize: number; lineHeight: string; padding: string; margin: number } = { fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 };
    const renderUserOption = (option: { data: { user: any } }) => {
        const u = option.data.user;
        return (
            <Space size={4} align="center">
                <Avatar size={20} style={{ backgroundColor: getRoleColor(u.role), fontSize: 11, flexShrink: 0 }}>
                    {u.name?.[0]?.toUpperCase()}
                </Avatar>
                <span style={{ fontSize: 13 }}>{u.name}</span>
                {u.role && (
                    <Tag style={tagStyle} color={getRoleColor(u.role)}>{getRoleName(u.role)}</Tag>
                )}
                {u.department?.name && (
                    <Tag style={tagStyle} color={resolveEntityColor(u.department.color)}>{u.department.name}</Tag>
                )}
                {u.position?.name && (
                    <Tag style={tagStyle} color={resolveEntityColor(u.position.color)}>{u.position.name}</Tag>
                )}
            </Space>
        );
    };

    const createMutation = useCreatePeriodicTask();
    const updateMutation = useUpdatePeriodicTask();
    const deleteMutation = useDeletePeriodicTask();

    // Reset về trang 1 khi đổi filter (trừ chính page) để tránh trang trống.
    useEffect(() => {
        setPage(1);
    }, [search, periodType, statusId, primaryAssigneeId, departmentId, dateRange]);

    // ---- Modal Thêm/Sửa ----
    const [modalOpen, setModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<PeriodicTask | null>(null);
    const [form] = Form.useForm();

    // Gắn Khách hàng NGAY TRONG Modal Tạo/Sửa (yêu cầu chủ dự án 2026-09-15) -
    // dùng CHUNG 1 khối state cho cả 2 chế độ, khác nhau ở cách LƯU:
    //  - Tạo mới: Task chưa có id -> gọi `POST /:id/customers` SAU KHI tạo
    //    Task thành công (không thể gộp vào `CreatePeriodicTaskDto`, BE
    //    không nhận `customerIds` ở endpoint đó).
    //  - Sửa: Task đã có sẵn `linkedCustomers` (fetch riêng qua
    //    `usePeriodicTask` vì `task` từ danh sách KHÔNG có field này) - so
    //    sánh (diff) danh sách gốc với danh sách người dùng vừa chỉnh để
    //    biết cần THÊM (`addCustomers`) hay GỠ (`removeCustomer`, không có
    //    endpoint gỡ hàng loạt nên gọi riêng từng cái).
    const canLinkCustomer = can('periodic_tasks.link_customer');
    const [customerIds, setCustomerIds] = useState<number[]>([]);
    // Chỉ có ý nghĩa ở chế độ Sửa - danh sách Customer ĐÃ gắn lúc mở modal,
    // dùng để diff lúc lưu. Rỗng ở chế độ Tạo mới (không có gì để diff).
    const [originalCustomerIds, setOriginalCustomerIds] = useState<number[]>([]);
    const [customerSearchInput, setCustomerSearchInput] = useState('');
    const debouncedCustomerSearch = useDebounce(customerSearchInput, 300);
    // BUG THẬT đã gặp (2026-09-15, xem WORKFLOW_LOG): thiếu `enabled` khiến
    // hook này gọi `GET /customers` ngay lúc mount trang, kể cả khi user
    // KHÔNG có `periodic_tasks.link_customer` (vd role chỉ bật mỗi Công việc
    // định kỳ) - Backend trả 403 đúng RBAC nhưng FE toast lỗi lặp lại liên
    // tục vì không có gì chặn request. Chỉ bật query khi user thực sự có
    // quyền gắn Khách hàng.
    const { data: customerSearchData, isLoading: customerSearchLoading } = useCustomers(
        {
            page: 1,
            limit: 20,
            search: debouncedCustomerSearch || undefined,
        },
        canLinkCustomer,
    );
    // Chi tiết Task đang Sửa (CHỈ fetch khi đang Sửa - `usePeriodicTask` tự
    // tắt query khi id là `null`) - nguồn duy nhất có `linkedCustomers`.
    const { data: editingTaskDetail, isLoading: editingTaskDetailLoading } = usePeriodicTask(
        editingTask?.id ?? null,
    );
    const editingLinkedCustomers = editingTaskDetail?.linkedCustomers;

    // Danh sách Customer "đã biết tên" để hiện label đúng trong Select, GỘP
    // từ 2 nguồn: kết quả search hiện tại + Customer đã gắn sẵn lúc Sửa (nếu
    // không gộp, mở modal Sửa lên sẽ hiện toàn ID trần vì Customer đã gắn
    // thường KHÔNG nằm trong 20 kết quả search mặc định/rỗng).
    const [knownCustomers, setKnownCustomers] = useState<Record<number, Customer>>({});
    useEffect(() => {
        const toMerge = [...(customerSearchData?.data ?? []), ...(editingLinkedCustomers ?? [])];
        if (toMerge.length === 0) return;
        setKnownCustomers((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const c of toMerge) {
                if (next[c.id] !== c) {
                    next[c.id] = c;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, [customerSearchData, editingLinkedCustomers]);

    // Nạp `customerIds`/`originalCustomerIds` từ dữ liệu THẬT ngay khi Task
    // đang Sửa tải xong (async - không thể set đồng bộ lúc bấm nút Sửa).
    useEffect(() => {
        if (editingTask && editingLinkedCustomers) {
            const ids = editingLinkedCustomers.map((c) => c.id);
            setCustomerIds(ids);
            setOriginalCustomerIds(ids);
        }
    }, [editingTask, editingLinkedCustomers]);

    const customerSelectOptions = Object.values(knownCustomers).map((c) => ({
        value: c.id,
        label: customerPlainLabel(c),
        customer: c,
    }));
    const addTaskCustomersMutation = useAddTaskCustomers();
    const removeTaskCustomerMutation = useRemoveTaskCustomer();
    // Select "Tìm để gắn" chỉ giữ lựa chọn TẠM (chưa vào danh sách chính
    // thức `customerIds`) - bấm "Gán" mới gộp vào, mirror ĐÚNG UX 2 bước
    // (chọn -> Gán) của `TaskLinksModal.tsx` (yêu cầu chủ dự án 2026-09-15:
    // Select multiple 1 khối cũ khó dùng, đổi sang list + ô tìm riêng).
    const [pendingCustomerIdsToAdd, setPendingCustomerIdsToAdd] = useState<number[]>([]);

    // ---- Phụ trách phụ NGAY TRONG Modal Tạo/Sửa (yêu cầu chủ dự án
    // 2026-09-15) - trước đây (Phase 4) CỐ TÌNH không đưa vào modal này, chỉ
    // quản lý được sau khi Task đã tồn tại qua nút "Liên kết" (xem JSDoc cũ
    // ở `TaskLinksModal.tsx`) - nay thêm vào đây, dùng lại ĐÚNG cơ chế
    // diff-on-save như Customer ở trên (Task chưa tồn tại lúc Tạo mới thì
    // không thể gọi `POST .../secondary-assignees` ngay, phải đợi có `id`).
    const [secondaryAssigneeIds, setSecondaryAssigneeIds] = useState<number[]>([]);
    const [originalSecondaryAssigneeIds, setOriginalSecondaryAssigneeIds] = useState<number[]>([]);
    const [pendingSecondaryUserIds, setPendingSecondaryUserIds] = useState<number[]>([]);
    const editingSecondaryAssignees = editingTaskDetail?.secondaryAssignees;
    const addSecondaryMutation = useAddTaskSecondaryAssignee();
    const removeSecondaryMutation = useRemoveTaskSecondaryAssignee();
    // Loại người đang được chọn làm "Người phụ trách chính" khỏi ứng viên
    // Phụ trách phụ - 1 người không thể vừa chính vừa phụ (BE cũng chặn,
    // đây chỉ là lọc trước cho gọn, mirror `secondaryCandidates` ở
    // `TaskLinksModal.tsx`). Dùng `Form.useWatch` vì đây là field CÓ đăng ký
    // trong `form` (`name="primaryAssigneeId"`), khác `customerIds`/
    // `secondaryAssigneeIds` là state ngoài form.
    const watchedPrimaryAssigneeId = Form.useWatch('primaryAssigneeId', form);

    useEffect(() => {
        if (editingTask && editingSecondaryAssignees) {
            const ids = editingSecondaryAssignees.map((u) => u.id);
            setSecondaryAssigneeIds(ids);
            setOriginalSecondaryAssigneeIds(ids);
        }
    }, [editingTask, editingSecondaryAssignees]);

    const openCreateModal = () => {
        setEditingTask(null);
        form.resetFields();
        form.setFieldsValue({ periodType: 'daily', color: '#1890ff' });
        setCustomerIds([]);
        setOriginalCustomerIds([]);
        setCustomerSearchInput('');
        setPendingCustomerIdsToAdd([]);
        setSecondaryAssigneeIds([]);
        setOriginalSecondaryAssigneeIds([]);
        setPendingSecondaryUserIds([]);
        setModalOpen(true);
    };

    const openEditModal = (task: PeriodicTask) => {
        setEditingTask(task);
        form.setFieldsValue({
            title: task.title,
            description: task.description ?? undefined,
            periodType: task.periodType,
            periodRange: [dayjs(task.periodStartDate), dayjs(task.periodEndDate)],
            statusId: task.statusId,
            primaryAssigneeId: task.primaryAssigneeId,
            departmentId: task.departmentId ?? undefined,
            note: task.note ?? undefined,
            color: task.color ?? '#1890ff',
        });
        // Rỗng tạm thời - `useEffect` phía trên tự nạp lại đúng giá trị NGAY
        // KHI `usePeriodicTask(task.id)` tải xong `linkedCustomers`/
        // `secondaryAssignees` thật.
        setCustomerIds([]);
        setOriginalCustomerIds([]);
        setCustomerSearchInput('');
        setPendingCustomerIdsToAdd([]);
        setSecondaryAssigneeIds([]);
        setOriginalSecondaryAssigneeIds([]);
        setPendingSecondaryUserIds([]);
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const { periodRange, ...rest } = values;
            const payload: CreatePeriodicTaskPayload = {
                ...rest,
                periodStartDate: periodRange[0].format('YYYY-MM-DD'),
                periodEndDate: periodRange[1].format('YYYY-MM-DD'),
            };

            if (editingTask) {
                const editingTaskId = editingTask.id;
                updateMutation.mutate(
                    { id: editingTaskId, data: payload },
                    {
                        onSuccess: () => {
                            message.success('Đã cập nhật Công việc định kỳ');
                            // Diff Customer đã chọn với danh sách gốc lúc mở modal
                            // (chỉ thực hiện khi CÓ quyền `link_customer` - nếu
                            // không có quyền, field bị ẩn nên 2 mảng luôn giống
                            // nhau [], không có gì để gọi).
                            if (canLinkCustomer) {
                                const toAdd = customerIds.filter((id) => !originalCustomerIds.includes(id));
                                const toRemove = originalCustomerIds.filter((id) => !customerIds.includes(id));
                                if (toAdd.length > 0) {
                                    addTaskCustomersMutation.mutate(
                                        { taskId: editingTaskId, customerIds: toAdd },
                                        {
                                            onError: (err) => message.error(getApiErrorMessage(err, 'Gắn thêm Khách hàng thất bại')),
                                        },
                                    );
                                }
                                toRemove.forEach((customerId) => {
                                    removeTaskCustomerMutation.mutate(
                                        { taskId: editingTaskId, customerId },
                                        {
                                            onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ 1 Khách hàng thất bại')),
                                        },
                                    );
                                });
                            }
                            // Diff Phụ trách phụ tương tự Customer ở trên (chỉ
                            // khác: mỗi lần gọi API chỉ nhận 1 userId, KHÔNG có
                            // batch - mirror `handleAddSecondary`/
                            // `handleRemoveSecondary` ở `TaskLinksModal.tsx`).
                            // Luôn thực hiện khi `canEdit` (không có permission
                            // ẩn riêng như `link_customer` - xem JSDoc đầu
                            // `TaskLinksModal.tsx`).
                            if (canEdit) {
                                const secondaryToAdd = secondaryAssigneeIds.filter(
                                    (id) => !originalSecondaryAssigneeIds.includes(id),
                                );
                                const secondaryToRemove = originalSecondaryAssigneeIds.filter(
                                    (id) => !secondaryAssigneeIds.includes(id),
                                );
                                secondaryToAdd.forEach((userId) => {
                                    addSecondaryMutation.mutate(
                                        { taskId: editingTaskId, userId },
                                        {
                                            onError: (err) => message.error(getApiErrorMessage(err, 'Thêm 1 Phụ trách phụ thất bại')),
                                        },
                                    );
                                });
                                secondaryToRemove.forEach((userId) => {
                                    removeSecondaryMutation.mutate(
                                        { taskId: editingTaskId, userId },
                                        {
                                            onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ 1 Phụ trách phụ thất bại')),
                                        },
                                    );
                                });
                            }
                            setModalOpen(false);
                        },
                        onError: (err: any) => {
                            message.error(err?.response?.data?.message || 'Cập nhật thất bại');
                        },
                    },
                );
            } else {
                createMutation.mutate(payload, {
                    onSuccess: (newTask) => {
                        message.success('Đã tạo Công việc định kỳ mới');
                        // Gắn Khách hàng đã chọn (nếu có) NGAY SAU KHI tạo -
                        // BE không nhận `customerIds` trong `POST /periodic-tasks`,
                        // phải gọi tiếp `POST /:id/customers` với id vừa tạo.
                        if (canLinkCustomer && customerIds.length > 0) {
                            addTaskCustomersMutation.mutate(
                                { taskId: newTask.id, customerIds },
                                {
                                    onError: (err) =>
                                        message.error(
                                            getApiErrorMessage(
                                                err,
                                                'Tạo Công việc thành công nhưng gắn Khách hàng thất bại - vào "Liên kết" để gắn lại',
                                            ),
                                        ),
                                },
                            );
                        }
                        // Gán Phụ trách phụ đã chọn (nếu có) NGAY SAU KHI tạo -
                        // cùng lý do với Customer ở trên (BE không nhận field
                        // này trong `POST /periodic-tasks`), gọi tuần tự từng
                        // người (endpoint chỉ nhận 1 userId/lần).
                        if (canEdit && secondaryAssigneeIds.length > 0) {
                            secondaryAssigneeIds.forEach((userId) => {
                                addSecondaryMutation.mutate(
                                    { taskId: newTask.id, userId },
                                    {
                                        onError: (err) =>
                                            message.error(
                                                getApiErrorMessage(
                                                    err,
                                                    'Tạo Công việc thành công nhưng gắn Phụ trách phụ thất bại - vào "Liên kết" để gắn lại',
                                                ),
                                            ),
                                    },
                                );
                            });
                        }
                        setModalOpen(false);
                    },
                    onError: (err: any) => {
                        message.error(err?.response?.data?.message || 'Tạo thất bại');
                    },
                });
            }
        } catch {
            // lỗi validate form - antd tự hiển thị
        }
    };

    // ---- Modal Liên kết & Tiến độ (Phase 2) ----
    const [linkingTask, setLinkingTask] = useState<PeriodicTask | null>(null);
    // Phase 6 (PLAN mục 6) - checklist con kiểu Trello, mở qua `TaskChecklistModal`
    // riêng (không nhét vào `TaskLinksModal`), xem JSDoc file đó.
    const [checklistingTask, setChecklistingTask] = useState<PeriodicTask | null>(null);
    // Phase 7 (CUỐI, PLAN mục 6) - xem lịch sử audit riêng qua `TaskAuditLogsModal`,
    // mirror 2 state trên (không phải hành động sửa, chỉ xem).
    const [auditingTask, setAuditingTask] = useState<PeriodicTask | null>(null);

    // ---- Modal Xoá (đơn giản - CHỈ Admin, không scope/fallback) ----
    const [deletingTask, setDeletingTask] = useState<PeriodicTask | null>(null);

    const handleConfirmDelete = () => {
        if (!deletingTask) return;
        deleteMutation.mutate(deletingTask.id, {
            onSuccess: () => {
                message.success(`Đã xoá "${deletingTask.title}"`);
                setDeletingTask(null);
            },
            onError: (err: any) => {
                message.error(err?.response?.data?.message || 'Xoá thất bại');
                setDeletingTask(null);
            },
        });
    };

    // ---- Modal Khoá / Mở khoá (Phase 5, PLAN mục 2.9) ----
    // Khoá cần Modal riêng vì có `lockNote` (optional, TextArea) - Mở khoá
    // KHÔNG cần input gì nên dùng Popconfirm inline ngay trong cột Thao tác,
    // không cần state riêng (mirror cách gỡ liên kết/Phụ trách phụ ở
    // `TaskLinksModal.tsx` dùng Popconfirm cho hành động không cần nhập gì).
    const lockMutation = useLockPeriodicTask();
    const unlockMutation = useUnlockPeriodicTask();
    const [lockingTask, setLockingTask] = useState<PeriodicTask | null>(null);
    const [lockNoteInput, setLockNoteInput] = useState('');

    const handleConfirmLock = () => {
        if (!lockingTask) return;
        lockMutation.mutate(
            { id: lockingTask.id, lockNote: lockNoteInput.trim() || undefined },
            {
                onSuccess: () => {
                    message.success(`Đã khoá "${lockingTask.title}"`);
                    setLockingTask(null);
                    setLockNoteInput('');
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Khoá thất bại')),
            },
        );
    };

    const handleUnlock = (task: PeriodicTask) => {
        unlockMutation.mutate(task.id, {
            onSuccess: () => message.success(`Đã mở khoá "${task.title}"`),
            onError: (err) => message.error(getApiErrorMessage(err, 'Mở khoá thất bại')),
        });
    };

    const columns = [
        {
            title: 'Công việc',
            dataIndex: 'title',
            key: 'title',
            width: 260,
            // Phase 8 (yêu cầu chủ dự án 2026-09-15, đã qua 2 vòng phản hồi
            // - xem JSDoc `TaskChainGroupedList` để biết đầy đủ lý do): CÂY
            // PHÂN CẤP staircase THẬT, cùng công thức toạ độ với Agenda
            // (`ownTrunkX/parentTrunkX = depth * STEP + TRUNK_OFFSET`) - chỉ
            // khác ở STEP nhỏ hơn (cột "Công việc" chỉ rộng 260px, cần STEP
            // hẹp hơn Agenda để không đẩy chữ tràn ra ngoài khi chuỗi có
            // nhiều cấp). Bảng có `<tr>` RIÊNG cho từng Task (không có 1
            // khối DOM chung để trục tự co giãn theo `flow-root` như Agenda),
            // nên vẫn giữ cách "bleed" bằng số px cố định (giả định padding
            // mặc định AntD Table, xem ghi chú `CONTENT_H` - đã từng lưu ý
            // cần chủ dự án xác nhận trực quan nếu đổi `size`/theme Table).
            render: (title: string, record: PeriodicTask) => {
                const chain = chains.get(record.id);
                const runFlag = chainRunFlags.get(record.id);
                const CONTENT_H = 24;
                const BEND_Y = CONTENT_H / 2; // điểm bẻ góc, giữa chiều cao nội dung 1 dòng
                const STEP = 24; // khoảng cách giữa 2 trục liền kề = chiều dài nhánh ngang
                const TRUNK_OFFSET = 9;
                const TRUNK_TO_TEXT = 15;
                const depth = runFlag?.depth ?? 0;
                const ownTrunkX = depth * STEP + TRUNK_OFFSET;
                const parentTrunkX = (depth - 1) * STEP + TRUNK_OFFSET;
                const trunkXAt = (d: number) => d * STEP + TRUNK_OFFSET;
                return (
                    <div style={{ position: 'relative', paddingLeft: runFlag ? ownTrunkX + TRUNK_TO_TEXT : 0 }}>
                        {runFlag && (
                            <>
                                {/* Gạch dọc XUYÊN SUỐT cả chiều cao dòng, tại trục của các
                                    TỔ TIÊN (không phải cha trực tiếp) CHƯA xong nhánh - giữ
                                    đường nối của tổ tiên liền mạch khi có nhánh anh em khác
                                    (con khác của cùng 1 cha) chen ở giữa. 2026-09-15 fix: đây
                                    là phần CÒN THIẾU khiến 2 Task cùng cấp (cùng 1 cha) bị vẽ
                                    lồng vào nhau thay vì cùng 1 trục cha. */}
                                {runFlag.passThroughDepths.map((d) => (
                                    <div
                                        key={`pass-${d}`}
                                        aria-hidden
                                        style={{
                                            position: 'absolute',
                                            left: trunkXAt(d),
                                            top: 0,
                                            height: CONTENT_H,
                                            width: 2,
                                            backgroundColor: runFlag.color,
                                            borderRadius: 1,
                                        }}
                                    />
                                ))}
                                {/* Đoạn dọc đi vào TỪ trục Task CHA (cấp nông hơn 1 bậc) -
                                    chỉ dòng KHÔNG phải gốc mới có (gốc không có cha). Bleed
                                    lên trên mép `<td>` (top âm) để nối liền với đoạn "đi tiếp
                                    xuống" của dòng phía trên (cha, hoặc gạch xuyên suốt của
                                    tổ tiên nếu dòng ngay trên là 1 nhánh anh em khác). */}
                                {!runFlag.isRoot && (
                                    <div
                                        aria-hidden
                                        style={{
                                            position: 'absolute',
                                            left: parentTrunkX,
                                            top: -20,
                                            height: 20 + BEND_Y,
                                            width: 2,
                                            backgroundColor: runFlag.color,
                                            borderRadius: 1,
                                        }}
                                    />
                                )}
                                {/* Nhánh ngang bẻ góc 90° - nối từ trục CHA sang sát điểm
                                    bắt đầu nội dung dòng này (dài đúng `STEP`, LUÔN đủ dài dù
                                    đang ở cấp nào). Gốc không có nhánh (không có cha). */}
                                {!runFlag.isRoot && (
                                    <div
                                        aria-hidden
                                        style={{
                                            position: 'absolute',
                                            left: parentTrunkX,
                                            top: BEND_Y - 1,
                                            width: ownTrunkX + TRUNK_TO_TEXT - 4 - parentTrunkX,
                                            height: 2,
                                            backgroundColor: runFlag.color,
                                            borderRadius: 1,
                                        }}
                                    />
                                )}
                                {/* Đoạn dọc TẠI TRỤC CHA, kéo dài từ điểm bẻ góc xuống hết
                                    dòng - CHỈ khi dòng này CHƯA phải con cuối của cha (còn
                                    Task anh em khác - vd 2 Task "Ngày" cùng cha "Tuần" - sẽ
                                    xuất hiện ở (các) dòng ngay bên dưới, đọc bằng
                                    `passThroughDepths` của chính chúng). Đây chính là phần
                                    khiến 2 con CÙNG cấp nối vào ĐÚNG 1 trục cha thay vì trục
                                    của nhau. */}
                                {!runFlag.isRoot && !runFlag.isLastChild && (
                                    <div
                                        aria-hidden
                                        style={{
                                            position: 'absolute',
                                            left: parentTrunkX,
                                            top: BEND_Y,
                                            height: CONTENT_H - BEND_Y,
                                            width: 2,
                                            backgroundColor: runFlag.color,
                                            borderRadius: 1,
                                        }}
                                    />
                                )}
                                {/* Đoạn dọc đi tiếp xuống dòng CON kế tiếp, tại trục của
                                    CHÍNH dòng này - chỉ khi dòng này CÓ con đang hiển thị
                                    ngay sau. */}
                                {runFlag.hasVisibleChildren && (
                                    <div
                                        aria-hidden
                                        style={{
                                            position: 'absolute',
                                            left: ownTrunkX,
                                            top: BEND_Y,
                                            height: 20 + BEND_Y,
                                            width: 2,
                                            backgroundColor: runFlag.color,
                                            borderRadius: 1,
                                        }}
                                    />
                                )}
                                {/* Chấm đánh dấu node - vẽ cho MỌI dòng trong chuỗi kể cả
                                    gốc, tại đúng trục của cấp đó. */}
                                <span
                                    aria-hidden
                                    style={{
                                        position: 'absolute',
                                        left: ownTrunkX - 4,
                                        top: BEND_Y - 5,
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        backgroundColor: runFlag.color,
                                        border: '2px solid var(--ant-color-bg-container, #fff)',
                                        boxSizing: 'content-box',
                                    }}
                                />
                            </>
                        )}
                        <div style={{ minHeight: CONTENT_H, display: 'flex', alignItems: 'center' }}>
                            <Space align="start" wrap size={4}>
                                <TaskTitlePill title={title} color={record.color} />
                                {chain && <TaskChainBadge chain={chain} currentTaskId={record.id} resolveTask={resolveChainTask} />}
                            </Space>
                        </div>
                        {record.note && (
                            <div>
                                <Tooltip title={record.note}>
                                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                                        {record.note}
                                    </Text>
                                </Tooltip>
                            </div>
                        )}
                    </div>
                );
            },
        },
        {
            title: 'Kỳ hạn',
            key: 'period',
            width: 190,
            render: (_: any, record: PeriodicTask) => (
                <Space orientation="vertical" size={0}>
                    <Tag>{PERIOD_TYPE_LABELS[record.periodType]}</Tag>
                    <Text style={{ fontSize: 12 }}>
                        {dayjs(record.periodStartDate).format('DD/MM/YYYY')}
                        {record.periodStartDate !== record.periodEndDate &&
                            ` → ${dayjs(record.periodEndDate).format('DD/MM/YYYY')}`}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 170,
            render: (_: any, record: PeriodicTask) => (
                <Space orientation="vertical" size={4}>
                    <Tag color={record.status?.color ?? DEFAULT_ENTITY_COLOR}>{record.status?.name ?? '—'}</Tag>
                    {record.isLocked && (
                        <Tooltip
                            title={
                                <>
                                    <div>
                                        Khoá bởi: {(record.lockedById && userNameById.get(record.lockedById)) ?? '—'}
                                    </div>
                                    {record.lockedAt && <div>Lúc: {dayjs(record.lockedAt).format('HH:mm DD/MM/YYYY')}</div>}
                                    {record.lockNote && <div>Ghi chú: {record.lockNote}</div>}
                                </>
                            }
                        >
                            <Tag color="red" icon={<LockOutlined />}>
                                Đã khoá
                            </Tag>
                        </Tooltip>
                    )}
                </Space>
            ),
        },
        {
            title: 'Phụ trách chính',
            key: 'primaryAssignee',
            width: 160,
            ellipsis: true,
            render: (_: any, record: PeriodicTask) => record.primaryAssignee?.name ?? '—',
        },
        {
            title: 'Phòng ban',
            key: 'department',
            width: 140,
            render: (_: any, record: PeriodicTask) =>
                record.department ? (
                    <Tag color={resolveEntityColor(record.department.color)}>{record.department.name}</Tag>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            // Luôn hiển thị (khác Phase 1) - nút "Liên kết" chỉ cần
            // `periodic_tasks.view` (ai đứng được ở trang này cũng có sẵn,
            // xem guard redirect đầu file), KHÔNG phụ thuộc canEdit/canDelete
            // như Sửa/Xoá bên dưới.
            title: 'Thao tác',
            key: 'action',
            width: 500,
            fixed: 'right' as const,
            // Phase 8 (PLAN mục Phase 8): tách nhóm nút này ra `TaskActionsBar`
            // dùng chung cho cả 4 view (Table/Agenda/Kanban/Calendar) - xem
            // JSDoc file đó. Hành vi/RBAC giữ NGUYÊN 100% so với Phase 1-7.
            render: (_: any, record: PeriodicTask) => (
                <TaskActionsBar
                    task={record}
                    canEdit={canEdit}
                    canEditLocked={canEditLocked}
                    canApprove={canApprove}
                    canDelete={canDelete}
                    onLink={setLinkingTask}
                    onChecklist={setChecklistingTask}
                    onAudit={setAuditingTask}
                    onEdit={openEditModal}
                    onLock={setLockingTask}
                    onUnlock={handleUnlock}
                    onDelete={setDeletingTask}
                    unlockLoading={unlockMutation.isPending && unlockMutation.variables === record.id}
                />
            ),
        },
    ];

    return (
        <div style={{ padding: 24 }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16,
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div>
                    <Title level={4} style={{ margin: 0 }}>
                        Công việc định kỳ
                    </Title>
                    <Text type="secondary">
                        Công việc lặp lại theo Ngày/Tuần/Tháng/Năm, tạo thủ công từng kỳ (không có cơ chế tự sinh
                        lặp lại). Bạn chỉ thấy Task trong phạm vi quyền của mình (xem/sửa theo own/phòng ban/tất cả).
                    </Text>
                </div>
                <Space>
                    {canManageStatuses && (
                        <Button icon={<SettingOutlined />} onClick={() => router.push('/quan-ly-trang-thai-cong-viec')}>
                            Quản lý Trạng thái
                        </Button>
                    )}
                    {canCreate && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                            Tạo Công việc mới
                        </Button>
                    )}
                </Space>
            </div>

            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={12} md={6}>
                    <Input
                        allowClear
                        placeholder="Tìm theo tiêu đề..."
                        prefix={<SearchOutlined />}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </Col>
                <Col xs={12} sm={6} md={4}>
                    <Select
                        allowClear
                        placeholder="Loại kỳ"
                        style={{ width: '100%' }}
                        value={periodType}
                        onChange={(v) => setPeriodType(v)}
                        options={(Object.keys(PERIOD_TYPE_LABELS) as PeriodType[]).map((pt) => ({
                            value: pt,
                            label: PERIOD_TYPE_LABELS[pt],
                        }))}
                    />
                </Col>
                <Col xs={12} sm={6} md={4}>
                    <Select
                        allowClear
                        placeholder="Trạng thái"
                        style={{ width: '100%' }}
                        value={statusId}
                        onChange={(v) => setStatusId(v)}
                        options={statuses.map((s) => ({
                            value: s.id,
                            label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag>,
                        }))}
                    />
                </Col>
                <Col xs={12} sm={6} md={4}>
                    <Select
                        allowClear
                        showSearch={{ optionFilterProp: 'label' }}
                        placeholder="Phụ trách chính"
                        style={{ width: '100%' }}
                        value={primaryAssigneeId}
                        onChange={(v) => setPrimaryAssigneeId(v)}
                        optionLabelProp="label"
                        optionRender={renderUserOption}
                        popupMatchSelectWidth={false}
                        options={users.map((u: any) => ({ value: u.id, label: u.name, user: u }))}
                    />
                </Col>
                <Col xs={12} sm={6} md={4}>
                    <Select
                        allowClear
                        placeholder="Phòng ban"
                        style={{ width: '100%' }}
                        value={departmentId}
                        onChange={(v) => setDepartmentId(v)}
                        options={departments.map((d) => ({
                            value: d.id,
                            label: <Tag color={resolveEntityColor(d.color)} style={{ marginInlineEnd: 0 }}>{d.name}</Tag>,
                        }))}
                    />
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <RangePicker
                        style={{ width: '100%' }}
                        format="DD/MM/YYYY"
                        placeholder={['Từ ngày', 'Đến ngày']}
                        value={dateRange as any}
                        onChange={(vals) => setDateRange(vals as [Dayjs | null, Dayjs | null] | null)}
                    />
                </Col>
            </Row>

            {/* Phase 8 (PLAN mục Phase 8) - View switcher. 'agenda' mặc định
                (giải quyết đúng phản ánh "khó kiểm tra ngày giờ" ở bảng gốc),
                người dùng tự đổi sang 'table' nếu muốn giao diện quen thuộc. */}
            <Segmented
                style={{ marginBottom: 16 }}
                value={view}
                onChange={(v) => setView(v as typeof view)}
                options={[
                    { label: 'Bảng', value: 'table', icon: <TableOutlined /> },
                    { label: 'Xem theo Ngày', value: 'agenda', icon: <UnorderedListOutlined /> },
                    { label: 'Kanban', value: 'kanban', icon: <AppstoreOutlined /> },
                    { label: 'Lịch tháng', value: 'calendar', icon: <CalendarOutlined /> },
                ]}
            />

            {view === 'table' && (
                <Table
                    rowKey="id"
                    loading={isLoading || isFetching}
                    columns={columns}
                    dataSource={tableTasksSorted}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                        current: page,
                        pageSize: limit,
                        total: data?.total ?? 0,
                        showSizeChanger: true,
                        showTotal: (total) => `Tổng cộng ${total} Công việc`,
                        onChange: (p, ps) => {
                            setPage(p);
                            setLimit(ps);
                        },
                    }}
                />
            )}

            {view === 'agenda' && (
                <PeriodicTasksAgendaView
                    tasks={viewTasks}
                    loading={viewLoading || viewFetching}
                    chains={chains}
                    edges={linksData?.edges ?? []}
                    resolveChainTask={resolveChainTask}
                    canEdit={canEdit}
                    canEditLocked={canEditLocked}
                    canApprove={canApprove}
                    canDelete={canDelete}
                    onLink={setLinkingTask}
                    onChecklist={setChecklistingTask}
                    onAudit={setAuditingTask}
                    onEdit={openEditModal}
                    onLock={setLockingTask}
                    onUnlock={handleUnlock}
                    onDelete={setDeletingTask}
                    isUnlocking={(id) => unlockMutation.isPending && unlockMutation.variables === id}
                />
            )}

            {view === 'kanban' && (
                <PeriodicTasksKanbanView
                    tasks={viewTasks}
                    statuses={statuses}
                    loading={viewLoading || viewFetching}
                    chains={chains}
                    resolveChainTask={resolveChainTask}
                    canEdit={canEdit}
                    canEditLocked={canEditLocked}
                    canApprove={canApprove}
                    canDelete={canDelete}
                    onLink={setLinkingTask}
                    onChecklist={setChecklistingTask}
                    onAudit={setAuditingTask}
                    onEdit={openEditModal}
                    onLock={setLockingTask}
                    onUnlock={handleUnlock}
                    onDelete={setDeletingTask}
                    isUnlocking={(id) => unlockMutation.isPending && unlockMutation.variables === id}
                />
            )}

            {view === 'calendar' && (
                <PeriodicTasksCalendarView
                    tasks={viewTasks}
                    onSelectTask={canEdit ? openEditModal : undefined}
                    chains={chains}
                    resolveChainTask={resolveChainTask}
                />
            )}

            {/* Modal Thêm/Sửa */}
            <Modal
                title={editingTask ? `Sửa "${editingTask.title}"` : 'Tạo Công việc định kỳ mới'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={handleSubmit}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                width={640}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="title"
                        label="Tiêu đề"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tiêu đề' },
                            { max: 255, message: 'Tiêu đề tối đa 255 ký tự' },
                        ]}
                    >
                        <Input placeholder="Ví dụ: Gọi lại 5 khách tiềm năng" />
                    </Form.Item>
                    <Form.Item name="description" label="Mô tả" rules={[{ max: 1000, message: 'Mô tả quá dài' }]}>
                        <Input.TextArea rows={2} placeholder="Không bắt buộc" />
                    </Form.Item>
                    <Row gutter={12}>
                        <Col span={10}>
                            <Form.Item
                                name="periodType"
                                label="Loại kỳ"
                                rules={[{ required: true, message: 'Chọn loại kỳ' }]}
                            >
                                <Select
                                    options={(Object.keys(PERIOD_TYPE_LABELS) as PeriodType[]).map((pt) => ({
                                        value: pt,
                                        label: PERIOD_TYPE_LABELS[pt],
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={14}>
                            <Form.Item
                                name="periodRange"
                                label="Khoảng thời gian của kỳ"
                                rules={[{ required: true, message: 'Chọn ngày bắt đầu/kết thúc kỳ' }]}
                                tooltip="Biên tuần/tháng/năm KHÔNG tự suy ra - bạn tự chọn đúng khoảng của kỳ này"
                            >
                                <RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item
                                name="primaryAssigneeId"
                                label="Người phụ trách chính"
                                rules={[{ required: true, message: 'Chọn người phụ trách chính' }]}
                            >
                                <Select
                                    showSearch={{ optionFilterProp: 'label' }}
                                    placeholder="Chọn nhân viên"
                                    optionLabelProp="label"
                                    optionRender={renderUserOption}
                                    popupMatchSelectWidth={false}
                                    options={users.map((u: any) => ({ value: u.id, label: u.name, user: u }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="departmentId"
                                label="Phòng ban"
                                tooltip="Bỏ trống sẽ tự lấy theo phòng ban của người phụ trách chính lúc tạo - sửa tự do sau đó"
                            >
                                <Select
                                    allowClear
                                    placeholder="Tự động theo người phụ trách"
                                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="statusId" label="Trạng thái" tooltip="Bỏ trống dùng mặc định 'Chưa hoàn thành'">
                                <Select
                                    allowClear
                                    placeholder="Chưa hoàn thành (mặc định)"
                                    options={statuses.map((s) => ({
                                        value: s.id,
                                        label: <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.name}</Tag>,
                                    }))}
                                />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item
                                name="color"
                                label="Màu Task"
                                tooltip="Chỉ dùng hiển thị UI (Card/Kanban/Calendar...) - không ảnh hưởng nghiệp vụ"
                                getValueFromEvent={(color) =>
                                    typeof color === 'string' ? color : color?.toHexString?.() ?? color
                                }
                            >
                                <ColorPicker showText format="hex" />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item name="note" label="Ghi chú" rules={[{ max: 1000, message: 'Ghi chú quá dài' }]}>
                        <Input.TextArea rows={2} placeholder="Không bắt buộc" />
                    </Form.Item>

                    {/* Gắn Khách hàng - hiện ở CẢ Tạo mới lẫn Sửa (yêu cầu chủ dự
                        án 2026-09-15), gate bằng `periodic_tasks.link_customer`
                        (PLAN mục 2.4). Ở chế độ Sửa: nếu Task đã có sẵn Customer
                        nhưng người xem KHÔNG có `customers.view` (quyền KHÁC),
                        `editingLinkedCustomers` sẽ là `undefined` dù đã tải xong
                        - ẩn hẳn phần này, hiện dòng cảnh báo thay vì list rỗng
                        gây hiểu nhầm "task chưa gắn khách hàng nào".
                        UI dạng list + ô tìm riêng (KHÔNG còn 1 Select multiple
                        gộp chung) - copy đúng UX 2 bước "chọn -> Gán" của
                        `TaskLinksModal.tsx` theo yêu cầu chủ dự án 2026-09-15,
                        vì Select multiple cũ hiện thẳng cả chip đã chọn lẫn
                        dropdown tìm trong CÙNG 1 ô rất khó dùng khi đã gắn
                        nhiều Khách hàng. */}
                    {canLinkCustomer && (!editingTask || editingTaskDetailLoading || editingLinkedCustomers) && (
                        <Form.Item
                            label="Khách hàng liên quan"
                            tooltip={editingTask ? undefined : 'Không bắt buộc - có thể gắn/gỡ sau qua nút "Liên kết"'}
                        >
                            <SimpleList
                                loading={!!editingTask && editingTaskDetailLoading}
                                size="small"
                                dataSource={customerIds.map((id) => knownCustomers[id]).filter((c): c is Customer => !!c)}
                                rowKey={(c) => c.id}
                                emptyText="Chưa gắn Khách hàng nào"
                                renderMeta={(c) => ({
                                    title: c.name,
                                    description: (
                                        <Space size={4}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {customerPhoneDisplay(c.phone)}
                                            </Text>
                                            {c.salesUser && <Tag color="blue">{c.salesUser.name}</Tag>}
                                        </Space>
                                    ),
                                })}
                                renderActions={(c) => [
                                    <Button
                                        key="remove-customer"
                                        size="small"
                                        danger
                                        type="text"
                                        icon={<DeleteOutlined />}
                                        onClick={() => setCustomerIds((prev) => prev.filter((id) => id !== c.id))}
                                    />,
                                ]}
                            />
                            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                <Select
                                    mode="multiple"
                                    style={{ flex: 1 }}
                                    showSearch={{
                                        filterOption: false, // tắt filter mặc định, dùng onSearch (server-side)
                                        onSearch: setCustomerSearchInput,
                                    }}
                                    optionLabelProp="label"
                                    optionRender={renderCustomerOption}
                                    popupMatchSelectWidth={false}
                                    maxTagCount="responsive"
                                    placeholder="Tìm Khách hàng theo tên/SĐT để gắn (chọn nhiều được)"
                                    loading={customerSearchLoading}
                                    value={pendingCustomerIdsToAdd}
                                    onChange={setPendingCustomerIdsToAdd}
                                    options={customerSelectOptions.filter((o) => !customerIds.includes(o.value))}
                                    notFoundContent={customerSearchLoading ? 'Đang tìm...' : 'Không tìm thấy Khách hàng phù hợp'}
                                />
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    disabled={pendingCustomerIdsToAdd.length === 0}
                                    onClick={() => {
                                        setCustomerIds((prev) => Array.from(new Set([...prev, ...pendingCustomerIdsToAdd])));
                                        setPendingCustomerIdsToAdd([]);
                                        setCustomerSearchInput('');
                                    }}
                                >
                                    Gán
                                </Button>
                            </div>
                        </Form.Item>
                    )}
                    {canLinkCustomer && editingTask && !editingTaskDetailLoading && editingLinkedCustomers === undefined && (
                        <Text type="secondary" style={{ display: 'block', marginTop: -12, marginBottom: 12 }}>
                            Bạn không có quyền xem Khách hàng nên không thể xem/sửa phần này.
                        </Text>
                    )}

                    {/* Phụ trách phụ - MỚI thêm vào modal Tạo/Sửa (yêu cầu chủ
                        dự án 2026-09-15, trước đây Phase 4 chỉ quản lý được
                        qua nút "Liên kết" sau khi Task đã tồn tại). Gate bằng
                        `periodic_tasks.edit` (KHÔNG có permission nhị phân
                        riêng như `link_customer`, mirror `TaskLinksModal.tsx`).
                        UI copy đúng list + ô tìm riêng từ `TaskLinksModal.tsx`. */}
                    {canEdit && (
                        <Form.Item label="Phụ trách phụ" tooltip="Người hỗ trợ thêm ngoài Phụ trách chính - không bắt buộc">
                            <SimpleList
                                loading={!!editingTask && editingTaskDetailLoading}
                                size="small"
                                dataSource={secondaryAssigneeIds
                                    .map((id) => users.find((u: any) => u.id === id))
                                    .filter((u): u is { id: number; name: string; email?: string } => !!u)}
                                rowKey={(u) => u.id}
                                emptyText="Chưa có Phụ trách phụ nào"
                                renderMeta={(u) => ({
                                    title: u.name,
                                    description: u.email ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {u.email}
                                        </Text>
                                    ) : undefined,
                                })}
                                renderActions={(u) => [
                                    <Button
                                        key="remove-secondary"
                                        size="small"
                                        danger
                                        type="text"
                                        icon={<DeleteOutlined />}
                                        onClick={() => setSecondaryAssigneeIds((prev) => prev.filter((id) => id !== u.id))}
                                    />,
                                ]}
                            />
                            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                <Select
                                    mode="multiple"
                                    style={{ flex: 1 }}
                                    showSearch={{ optionFilterProp: 'label' }}
                                    popupMatchSelectWidth={false}
                                    maxTagCount="responsive"
                                    placeholder="Chọn người để thêm làm Phụ trách phụ (chọn nhiều được)"
                                    value={pendingSecondaryUserIds}
                                    onChange={setPendingSecondaryUserIds}
                                    options={users
                                        .filter(
                                            (u: any) =>
                                                u.id !== watchedPrimaryAssigneeId && !secondaryAssigneeIds.includes(u.id),
                                        )
                                        .map((u: any) => ({
                                            value: u.id,
                                            label: u.email ? `${u.name} (${u.email})` : u.name,
                                        }))}
                                    notFoundContent="Không có người dùng nào đủ điều kiện"
                                />
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    disabled={pendingSecondaryUserIds.length === 0}
                                    onClick={() => {
                                        setSecondaryAssigneeIds((prev) =>
                                            Array.from(new Set([...prev, ...pendingSecondaryUserIds])),
                                        );
                                        setPendingSecondaryUserIds([]);
                                    }}
                                >
                                    Gán
                                </Button>
                            </div>
                        </Form.Item>
                    )}
                </Form>
            </Modal>

            {/* Modal Xoá - đơn giản, CHỈ Admin thấy được nút này */}
            <Modal
                title={`Xoá "${deletingTask?.title ?? ''}"?`}
                open={!!deletingTask}
                onCancel={() => setDeletingTask(null)}
                onOk={handleConfirmDelete}
                okButtonProps={{ danger: true }}
                okText="Xoá"
                cancelText="Huỷ"
                confirmLoading={deleteMutation.isPending}
            >
                <Alert
                    type="warning"
                    showIcon
                    title="Hành động này chỉ Admin mới thực hiện được và không thể hoàn tác qua UI."
                    style={{ marginBottom: 12 }}
                />
                <Text>Bạn có chắc muốn xoá Công việc định kỳ này?</Text>
            </Modal>

            {/* Modal Khoá (Phase 5) - lockNote optional, KHÔNG bắt buộc lý do
                (PLAN mục 2.9). Mở khoá không cần Modal riêng, xem Popconfirm
                inline ở cột "Thao tác". */}
            <Modal
                title={`Khoá "${lockingTask?.title ?? ''}"?`}
                open={!!lockingTask}
                onCancel={() => {
                    setLockingTask(null);
                    setLockNoteInput('');
                }}
                onOk={handleConfirmLock}
                okText="Khoá"
                cancelText="Huỷ"
                confirmLoading={lockMutation.isPending}
            >
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                    Sau khi khoá, chỉ người có quyền &quot;Sửa khi đang khoá&quot; mới sửa được Công việc này (kể cả
                    đổi trạng thái/liên kết/Khách hàng/Phụ trách phụ). Có thể mở khoá lại bất kỳ lúc nào.
                </Text>
                <Input.TextArea
                    rows={3}
                    placeholder="Ghi chú lúc khoá (không bắt buộc)"
                    value={lockNoteInput}
                    onChange={(e) => setLockNoteInput(e.target.value)}
                    maxLength={500}
                    showCount
                />
            </Modal>

            {/* Modal Liên kết & Tiến độ (Phase 2) */}
            <TaskLinksModal open={!!linkingTask} onClose={() => setLinkingTask(null)} task={linkingTask} />

            {/* Modal Checklist con kiểu Trello (Phase 6) */}
            <TaskChecklistModal
                open={!!checklistingTask}
                onClose={() => setChecklistingTask(null)}
                task={checklistingTask}
            />

            {/* Modal Lịch sử audit (Phase 7, CUỐI) */}
            <TaskAuditLogsModal open={!!auditingTask} onClose={() => setAuditingTask(null)} task={auditingTask} />
        </div>
    );
}