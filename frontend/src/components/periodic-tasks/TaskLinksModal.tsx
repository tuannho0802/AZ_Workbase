'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { clampRange } from '@/lib/utils/periodicTaskRange';
import { Modal, Typography, Divider, Progress, Select, Button, App, Popconfirm, Tag, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { usePeriodicTasks, usePeriodicTask } from '@/lib/hooks/usePeriodicTasks';
import {
    useTaskChildren,
    useTaskParents,
    useTaskRollup,
    useAddTaskLink,
    useRemoveTaskLink,
} from '@/lib/hooks/usePeriodicTaskLinks';
import { useAddTaskCustomers, useRemoveTaskCustomer } from '@/lib/hooks/usePeriodicTaskCustomers';
import { useAddTaskSecondaryAssignee, useRemoveTaskSecondaryAssignee } from '@/lib/hooks/usePeriodicTaskSecondaryAssignees';
import { useCustomers } from '@/lib/hooks/useCustomers';
import { useCustomerStatuses } from '@/lib/hooks/useCustomerStatuses';
import { useUsersList } from '@/lib/hooks/useUsers';
import { customerPhoneDisplay, customerPlainLabel, renderCustomerOption } from '@/components/common/customer-option-render';
import { CustomerQuickFilterButton, CustomerQuickFilters, EMPTY_CUSTOMER_QUICK_FILTERS } from '@/components/common/customer-quick-filter';
import { PeriodicTask, PERIOD_TYPE_LABELS, PERIOD_RANK } from '@/lib/api/periodic-tasks.api';
import { Customer } from '@/lib/types/customer.types';
import { getApiErrorMessage } from '@/lib/utils/error-message.util';
import { SimpleList } from '@/components/common/SimpleList';

const { Text } = Typography;

interface Props {
    open: boolean;
    onClose: () => void;
    task: PeriodicTask | null;
}

/**
 * TaskLinksModal - UI Phase 2 (PLAN_PERIODIC_TASKS_MODULE.md mục 6, Phase 2):
 * liên kết phân cấp DAG (multi-parent, skip-level) + % hoàn thành (rollup).
 *
 * Khớp đúng 5 endpoint BE của `PeriodicTasksController` (xem
 * `periodic-task-links.api.ts`):
 * - "Công việc cha": Task kỳ hạn LỚN hơn mà `task` (đang mở modal) là con -
 *   gán/gỡ gọi `POST/DELETE /periodic-tasks/:id/links` với `:id = task.id`.
 * - "Công việc con": Task kỳ hạn NHỎ hơn đang thuộc vào `task` - về BẢN CHẤT
 *   gọi CÙNG 1 API nhưng đảo vai trò: `:id` = Task con được chọn,
 *   `parentTaskId` = `task.id` hiện tại (xem `handleAddChild`/
 *   `handleRemoveChild`).
 * - Rank (cha phải "lớn kỳ hạn hơn" con) + chống chu trình (cycle) ĐỀU được
 *   BE validate lại 100% (`PeriodicTaskLinksService`) - FE chỉ lọc TRƯỚC
 *   danh sách gợi ý cho gọn (`parentCandidates`/`childCandidates`), KHÔNG
 *   phải lớp bảo vệ duy nhất.
 * - Sửa liên kết (gán/gỡ) cần `periodic_tasks.edit` - CHỈ xem
 *   (children/parents/rollup) cần `periodic_tasks.view`, vốn đã có sẵn vì
 *   người dùng đang đứng trong trang danh sách (trang tự redirect nếu thiếu
 *   quyền này - xem `page.tsx`).
 *
 * ⚠️ Danh sách gợi ý cha/con (`usePeriodicTasks({ limit: 100 })`) lấy 1
 * trang lớn Task trong phạm vi quyền xem của user (RBAC đã áp ở BE) rồi lọc
 * lại CLIENT-SIDE theo rank - chấp nhận giới hạn 100 Task cho MVP Phase 2
 * (BE hard-cap `limit` tối đa 100 qua `@Max(100)` ở `PeriodicTaskFiltersDto`
 * - truyền lớn hơn sẽ bị 400 "limit must not be greater than 100", ĐÃ gặp
 * bug thật lúc code lần đầu do quên đối chiếu DTO này), đủ dùng cho quy mô
 * hiện tại. Nếu sau này số lượng Task tăng nhiều, cân nhắc thêm search
 * server-side (mirror `CustomerFilters`) thay vì tải hết.
 *
 * Phần "Khách hàng liên quan" (Phase 3, PLAN mục 2.4) đọc `linkedCustomers`
 * từ `usePeriodicTask(taskId)` (fetch riêng, KHÔNG dùng `task` prop truyền
 * vào - `task` đến từ danh sách `GET /periodic-tasks`, endpoint đó KHÔNG
 * đính `linkedCustomers`, chỉ `GET /:id` mới có). `linkedCustomers ===
 * undefined` (key không tồn tại) nghĩa là người xem thiếu `customers.view`
 * - ẩn hẳn phần này, KHÔNG coi là "chưa gắn khách hàng nào" (mảng rỗng).
 * Gán/gỡ cần thêm `periodic_tasks.link_customer` (khác `periodic_tasks.edit`
 * dùng cho liên kết cha/con ở trên) - 2 quyền độc lập, ẩn riêng từng nút.
 *
 * Phần "Phụ trách phụ" (Phase 4, PLAN mục 2.5) đọc `secondaryAssignees` từ
 * CÙNG `taskDetail` (mirror `linkedCustomers` về cách fetch), nhưng KHÁC ở
 * chỗ KHÔNG ẩn theo quyền nào khác - chỉ cần `periodic_tasks.edit` (đã có
 * biến `canEditLinks` ở trên) để gán/gỡ, không có permission nhị phân riêng
 * như `link_customer`. Endpoint BE chỉ nhận 1 `userId`/lần
 * (`POST .../secondary-assignees` body `{ userId }`) - chọn nhiều trên UI
 * rồi gọi tuần tự từng người, KHÔNG phải batch như Customer.
 */
export function TaskLinksModal({ open, onClose, task }: Props) {
    const { message } = App.useApp();
    const { can } = useMyPermissions();
    const hasEditPermission = can('periodic_tasks.edit');
    const hasLinkCustomerPermission = can('periodic_tasks.link_customer');
    // Phase 5 (PLAN mục 2.9) - BE áp `assertEditableWhenLocked()` ở CẢ 3 chỗ
    // sửa dữ liệu trong modal này (links cha/con, Customer, Phụ trách phụ),
    // không riêng PATCH nội dung Task ở `page.tsx`. Thiếu gate FE ở đây thì
    // user vẫn bấm được nút Gán/Gỡ rồi mới ăn 403 - sai nguyên tắc "BE 403 ->
    // FE phải tự ẩn UI trước" (Repository_Context___Rules mục 4).
    const canEditLocked = can('periodic_tasks.edit_locked');

    const taskId = task?.id ?? null;
    const { data: parents = [], isLoading: parentsLoading } = useTaskParents(taskId);
    const { data: children = [], isLoading: childrenLoading } = useTaskChildren(taskId);
    const { data: rollup, isLoading: rollupLoading } = useTaskRollup(taskId);

    // Phase 3: `task` prop (từ danh sách) KHÔNG có `linkedCustomers` - phải
    // fetch riêng qua `GET /:id`, xem JSDoc đầu file.
    const { data: taskDetail, isLoading: taskDetailLoading } = usePeriodicTask(taskId);
    // Ưu tiên `taskDetail.isLocked` (fetch riêng, tự refetch khi
    // Khoá/Mở khoá ở `page.tsx` vì cùng invalidate `LIST_KEY`) hơn
    // `task.isLocked` (prop từ danh sách, có thể cũ hơn 1 nhịp).
    const isLocked = taskDetail?.isLocked ?? task?.isLocked ?? false;
    const lockBlocksEdit = isLocked && !canEditLocked;
    const canEditLinks = hasEditPermission && !lockBlocksEdit;
    const canLinkCustomer = hasLinkCustomerPermission && !lockBlocksEdit;
    const linkedCustomers = taskDetail?.linkedCustomers;
    // Phase 4: cùng nguồn `taskDetail`, nhưng KHÔNG có case `undefined` do
    // thiếu quyền (xem JSDoc đầu file) - mặc định mảng rỗng lúc đang tải.
    const secondaryAssignees = taskDetail?.secondaryAssignees ?? [];

    const addMutation = useAddTaskLink();
    const removeMutation = useRemoveTaskLink();
    const addCustomersMutation = useAddTaskCustomers();
    const removeCustomerMutation = useRemoveTaskCustomer();
    const addSecondaryMutation = useAddTaskSecondaryAssignee();
    const removeSecondaryMutation = useRemoveTaskSecondaryAssignee();

    const [selectedParentId, setSelectedParentId] = useState<number | undefined>(undefined);
    const [selectedChildId, setSelectedChildId] = useState<number | undefined>(undefined);
    const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    // Bộ lọc nhanh (Nguồn/Trạng thái/Sales phụ trách) - mirror ĐÚNG
    // `cong-viec-dinh-ky/page.tsx` (xem JSDoc đầy đủ ở `customer-quick-filter.tsx`).
    const [customerQuickFilters, setCustomerQuickFilters] = useState<CustomerQuickFilters>(EMPTY_CUSTOMER_QUICK_FILTERS);
    const [selectedSecondaryUserIds, setSelectedSecondaryUserIds] = useState<number[]>([]);

    const { users: allUsers } = useUsersList();

    // Ứng viên cha/con = Task có Kỳ hạn CHỒNG LẤN Kỳ hạn của Task đang xem (Task cha
    // Tuần/Tháng/Năm bao trùm Task con; Task con nằm trong Kỳ hạn của cha). BE KHÔNG
    // bao giờ tải toàn bộ - phải truyền khoảng ngày (tối đa 93 ngày, cắt bớt với Task
    // Năm) và chỉ tải khi modal đang mở.
    const candidateParams = useMemo(() => {
        const base = { page: 1, limit: 100 };
        if (!task) return base;
        const { range } = clampRange(dayjs(task.periodStartDate), dayjs(task.periodEndDate));
        return { ...base, dateFrom: range[0].format('YYYY-MM-DD'), dateTo: range[1].format('YYYY-MM-DD') };
    }, [task]);
    const { data: candidatesData, isLoading: candidatesLoading } = usePeriodicTasks(candidateParams, open && !!task);
    const allTasks = useMemo(() => candidatesData?.data ?? [], [candidatesData]);

    // Search server-side (mirror `useCustomers.ts`) - CHỈ chạy khi modal cho
    // phép gắn Customer, tránh gọi API thừa cho user không có quyền.
    // BUG THẬT đã gặp (2026-09-15, xem WORKFLOW_LOG): comment này ghi đúng ý
    // định từ trước nhưng code chưa từng truyền `enabled` (hook `useCustomers`
    // lúc đó cũng chưa hỗ trợ tham số này) - `TaskLinksModal` lại LUÔN mount
    // sẵn ở `page.tsx` (chỉ ẩn/hiện qua prop `open` của `<Modal>`, không phải
    // conditional render), nên hook này gọi `GET /customers` ngay khi trang
    // Công việc định kỳ vừa tải xong, kể cả khi chưa từng bấm "Liên kết" và
    // kể cả khi user không có `periodic_tasks.link_customer` -> 403 lặp lại.
    const { data: customerCandidatesData, isLoading: customerCandidatesLoading } = useCustomers(
        {
            page: 1,
            limit: 20,
            search: customerSearch || undefined,
            source: customerQuickFilters.source,
            status: customerQuickFilters.status,
            salesUserId: customerQuickFilters.salesUserId,
            dateFrom: customerQuickFilters.dateFrom,
            dateTo: customerQuickFilters.dateTo,
        },
        canLinkCustomer,
    );
    const linkedCustomerIds = useMemo(
        () => new Set((linkedCustomers ?? []).map((c) => c.id)),
        [linkedCustomers],
    );
    const customerCandidates = useMemo(
        () => (customerCandidatesData?.data ?? []).filter((c) => !linkedCustomerIds.has(c.id)),
        [customerCandidatesData, linkedCustomerIds],
    );
    // Tag Trạng thái Khách hàng trong dropdown "Tìm để gắn" - mirror ĐÚNG
    // `cong-viec-dinh-ky/page.tsx` (xem JSDoc `renderCustomerOption` ở
    // `customer-option-render.tsx`).
    const { statuses: customerStatusesForOption } = useCustomerStatuses();
    const customerStatusByCode = useMemo(
        () => new Map(customerStatusesForOption.map((s) => [s.code, s])),
        [customerStatusesForOption],
    );
    const renderCustomerOptionWithStatus = (option: { data: { customer: Customer } }) =>
        renderCustomerOption(option, customerStatusByCode);

    // Phase 4: ứng viên "Phụ trách phụ" - loại người đang là Phụ trách CHÍNH
    // (`primaryAssigneeId`, 1 người không thể vừa chính vừa phụ - BE cũng
    // chặn lại ở `addSecondaryAssignee`, FE lọc trước cho gọn) và người ĐÃ
    // là Phụ trách phụ rồi.
    const secondaryAssigneeIds = useMemo(
        () => new Set(secondaryAssignees.map((u) => u.id)),
        [secondaryAssignees],
    );
    const secondaryCandidates = useMemo(
        () =>
            allUsers.filter(
                (u: { id: number }) => u.id !== task?.primaryAssigneeId && !secondaryAssigneeIds.has(u.id),
            ),
        [allUsers, task, secondaryAssigneeIds],
    );

    const parentIds = useMemo(() => new Set(parents.map((p) => p.id)), [parents]);
    const childIds = useMemo(() => new Set(children.map((c) => c.id)), [children]);

    const parentCandidates = useMemo(() => {
        if (!task) return [];
        return allTasks.filter(
            (t) => t.id !== task.id && !parentIds.has(t.id) && PERIOD_RANK[t.periodType] > PERIOD_RANK[task.periodType],
        );
    }, [allTasks, task, parentIds]);

    const childCandidates = useMemo(() => {
        if (!task) return [];
        return allTasks.filter(
            (t) => t.id !== task.id && !childIds.has(t.id) && PERIOD_RANK[t.periodType] < PERIOD_RANK[task.periodType],
        );
    }, [allTasks, task, childIds]);

    const resetAndClose = () => {
        setSelectedParentId(undefined);
        setSelectedChildId(undefined);
        setSelectedCustomerIds([]);
        setCustomerSearch('');
        setCustomerQuickFilters(EMPTY_CUSTOMER_QUICK_FILTERS);
        setSelectedSecondaryUserIds([]);
        onClose();
    };

    const handleAddParent = () => {
        if (!task || !selectedParentId) return;
        addMutation.mutate(
            { childId: task.id, parentTaskId: selectedParentId },
            {
                onSuccess: () => {
                    message.success('Đã gán Công việc cha');
                    setSelectedParentId(undefined);
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Gán Công việc cha thất bại')),
            },
        );
    };

    const handleAddChild = () => {
        if (!task || !selectedChildId) return;
        addMutation.mutate(
            { childId: selectedChildId, parentTaskId: task.id },
            {
                onSuccess: () => {
                    message.success('Đã gán Công việc con');
                    setSelectedChildId(undefined);
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Gán Công việc con thất bại')),
            },
        );
    };

    const handleRemoveParent = (parentId: number, title: string) => {
        if (!task) return;
        removeMutation.mutate(
            { childId: task.id, parentTaskId: parentId },
            {
                onSuccess: () => message.success(`Đã gỡ liên kết với "${title}"`),
                onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ liên kết thất bại')),
            },
        );
    };

    const handleRemoveChild = (childId: number, title: string) => {
        if (!task) return;
        removeMutation.mutate(
            { childId, parentTaskId: task.id },
            {
                onSuccess: () => message.success(`Đã gỡ liên kết với "${title}"`),
                onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ liên kết thất bại')),
            },
        );
    };

    const handleAddCustomers = () => {
        if (!task || selectedCustomerIds.length === 0) return;
        addCustomersMutation.mutate(
            { taskId: task.id, customerIds: selectedCustomerIds },
            {
                onSuccess: () => {
                    message.success(`Đã gắn ${selectedCustomerIds.length} Khách hàng vào Công việc`);
                    setSelectedCustomerIds([]);
                    setCustomerSearch('');
                },
                onError: (err) => message.error(getApiErrorMessage(err, 'Gắn Khách hàng thất bại')),
            },
        );
    };

    const handleRemoveCustomer = (customerId: number, name: string) => {
        if (!task) return;
        removeCustomerMutation.mutate(
            { taskId: task.id, customerId },
            {
                onSuccess: () => message.success(`Đã gỡ "${name}" khỏi Công việc`),
                onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ Khách hàng thất bại')),
            },
        );
    };

    // Phase 4: BE chỉ nhận 1 userId/lần (xem JSDoc đầu file) - gọi tuần tự
    // (mutateAsync + for-loop, KHÔNG Promise.all) để giữ đúng thứ tự và
    // tránh 2 request cùng lúc ghi trùng invalidate.
    const handleAddSecondary = async () => {
        if (!task || selectedSecondaryUserIds.length === 0) return;
        try {
            for (const userId of selectedSecondaryUserIds) {
                await addSecondaryMutation.mutateAsync({ taskId: task.id, userId });
            }
            message.success(`Đã thêm ${selectedSecondaryUserIds.length} Phụ trách phụ`);
            setSelectedSecondaryUserIds([]);
        } catch (err) {
            message.error(getApiErrorMessage(err, 'Thêm Phụ trách phụ thất bại'));
        }
    };

    const handleRemoveSecondary = (userId: number, name: string) => {
        if (!task) return;
        removeSecondaryMutation.mutate(
            { taskId: task.id, userId },
            {
                onSuccess: () => message.success(`Đã gỡ "${name}" khỏi Phụ trách phụ`),
                onError: (err) => message.error(getApiErrorMessage(err, 'Gỡ Phụ trách phụ thất bại')),
            },
        );
    };

    const toOption = (t: PeriodicTask) => ({
        value: t.id,
        label: `${t.title} (${PERIOD_TYPE_LABELS[t.periodType]})`,
    });

    return (
        <Modal
            title={`Liên kết & Tiến độ${task ? ` - "${task.title}"` : ''}`}
            open={open}
            onCancel={resetAndClose}
            footer={<Button onClick={resetAndClose}>Đóng</Button>}
            width={640}
            destroyOnHidden
        >
            {task && (
                <>
                    {isLocked && (
                        <Tag color="red" style={{ marginBottom: 12 }}>
                            Công việc đang bị khoá{lockBlocksEdit ? ' - chỉ xem, không gán/gỡ được' : ''}
                        </Tag>
                    )}
                    <div style={{ marginBottom: 8 }}>
                        <Text strong>Tiến độ (tính theo Công việc con TRỰC TIẾP):</Text>
                    </div>
                    {rollupLoading ? (
                        <Text type="secondary">Đang tính...</Text>
                    ) : rollup && rollup.percent !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Progress percent={rollup.percent} style={{ flex: 1 }} />
                            <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                                {rollup.doneChildren}/{rollup.totalChildren} việc con
                            </Text>
                        </div>
                    ) : (
                        <Text type="secondary">Chưa có Công việc con nào tính vào % (hoặc đều bị loại khỏi rollup).</Text>
                    )}

                    <Divider style={{ margin: '16px 0 12px' }} />

                    <div style={{ marginBottom: 8 }}>
                        <Text strong>Công việc cha ({parents.length}):</Text>
                        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            Kỳ hạn LỚN hơn &quot;{PERIOD_TYPE_LABELS[task.periodType]}&quot; - có thể thuộc nhiều Task
                            cha cùng lúc, skip-level được phép.
                        </Text>
                    </div>
                    <SimpleList
                        loading={parentsLoading}
                        size="small"
                        dataSource={parents}
                        rowKey={(p) => p.id}
                        emptyText="Chưa liên kết với Công việc cha nào"
                        renderMeta={(p) => ({
                            title: p.title,
                            description: (
                                <Space size={4}>
                                    <Tag>{PERIOD_TYPE_LABELS[p.periodType]}</Tag>
                                    {p.status && <Tag color={p.status.color}>{p.status.name}</Tag>}
                                </Space>
                            ),
                        })}
                        renderActions={(p) =>
                            canEditLinks
                                ? [
                                    <Popconfirm
                                        key="remove-parent"
                                        title={`Gỡ liên kết cha "${p.title}"?`}
                                        onConfirm={() => handleRemoveParent(p.id, p.title)}
                                        okText="Gỡ"
                                        cancelText="Huỷ"
                                    >
                                        <Button
                                            size="small"
                                            danger
                                            type="text"
                                            icon={<DeleteOutlined />}
                                            loading={removeMutation.isPending && removeMutation.variables?.parentTaskId === p.id}
                                        />
                                    </Popconfirm>,
                                ]
                                : []
                        }
                    />
                    {canEditLinks && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <Select
                                style={{ flex: 1 }}
                                showSearch={{ optionFilterProp: 'label' }}
                                placeholder="Chọn Công việc cha để gán"
                                loading={candidatesLoading}
                                value={selectedParentId}
                                onChange={setSelectedParentId}
                                options={parentCandidates.map(toOption)}
                                notFoundContent={candidatesLoading ? 'Đang tải...' : 'Không có Task nào đủ điều kiện làm cha'}
                            />
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                disabled={!selectedParentId}
                                loading={addMutation.isPending}
                                onClick={handleAddParent}
                            >
                                Gán
                            </Button>
                        </div>
                    )}

                    <Divider style={{ margin: '20px 0 12px' }} />

                    <div style={{ marginBottom: 8 }}>
                        <Text strong>Công việc con ({children.length}):</Text>
                        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            Kỳ hạn NHỎ hơn &quot;{PERIOD_TYPE_LABELS[task.periodType]}&quot;, tính vào % hoàn thành ở
                            trên.
                        </Text>
                    </div>
                    <SimpleList
                        loading={childrenLoading}
                        size="small"
                        dataSource={children}
                        rowKey={(c) => c.id}
                        emptyText="Chưa có Công việc con nào"
                        renderMeta={(c) => ({
                            title: c.title,
                            description: (
                                <Space size={4}>
                                    <Tag>{PERIOD_TYPE_LABELS[c.periodType]}</Tag>
                                    {c.status && <Tag color={c.status.color}>{c.status.name}</Tag>}
                                </Space>
                            ),
                        })}
                        renderActions={(c) =>
                            canEditLinks
                                ? [
                                    <Popconfirm
                                        key="remove-child"
                                        title={`Gỡ liên kết con "${c.title}"?`}
                                        onConfirm={() => handleRemoveChild(c.id, c.title)}
                                        okText="Gỡ"
                                        cancelText="Huỷ"
                                    >
                                        <Button
                                            size="small"
                                            danger
                                            type="text"
                                            icon={<DeleteOutlined />}
                                            loading={removeMutation.isPending && removeMutation.variables?.childId === c.id}
                                        />
                                    </Popconfirm>,
                                ]
                                : []
                        }
                    />
                    {canEditLinks && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <Select
                                style={{ flex: 1 }}
                                showSearch={{ optionFilterProp: 'label' }}
                                placeholder="Chọn Công việc con để gán"
                                loading={candidatesLoading}
                                value={selectedChildId}
                                onChange={setSelectedChildId}
                                options={childCandidates.map(toOption)}
                                notFoundContent={candidatesLoading ? 'Đang tải...' : 'Không có Task nào đủ điều kiện làm con'}
                            />
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                disabled={!selectedChildId}
                                loading={addMutation.isPending}
                                onClick={handleAddChild}
                            >
                                Gán
                            </Button>
                        </div>
                    )}

                    {!canEditLinks && (
                        <Text type="secondary" style={{ display: 'block', marginTop: 16 }}>
                            {lockBlocksEdit && hasEditPermission
                                ? 'Công việc đang bị khoá - cần quyền "Sửa khi đang khoá" để gán/gỡ liên kết.'
                                : 'Bạn chỉ có quyền xem liên kết - cần quyền "Sửa Công việc định kỳ" để gán/gỡ.'}
                        </Text>
                    )}

                    <Divider style={{ margin: '20px 0 12px' }} />

                    <div style={{ marginBottom: 8 }}>
                        <Text strong>Khách hàng liên quan{linkedCustomers ? ` (${linkedCustomers.length})` : ''}:</Text>
                    </div>

                    {linkedCustomers === undefined ? (
                        <Text type="secondary">
                            {taskDetailLoading
                                ? 'Đang tải...'
                                : 'Bạn không có quyền xem Khách hàng nên không thấy được phần này.'}
                        </Text>
                    ) : (
                        <>
                            <SimpleList
                                loading={taskDetailLoading}
                                size="small"
                                dataSource={linkedCustomers}
                                rowKey={(c) => c.id}
                                emptyText="Chưa gắn Khách hàng nào vào Công việc này"
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
                                renderActions={(c) =>
                                    canLinkCustomer
                                        ? [
                                            <Popconfirm
                                                key="remove-customer"
                                                title={`Gỡ "${c.name}" khỏi Công việc?`}
                                                onConfirm={() => handleRemoveCustomer(c.id, c.name)}
                                                okText="Gỡ"
                                                cancelText="Huỷ"
                                            >
                                                <Button
                                                    size="small"
                                                    danger
                                                    type="text"
                                                    icon={<DeleteOutlined />}
                                                    loading={
                                                        removeCustomerMutation.isPending &&
                                                        removeCustomerMutation.variables?.customerId === c.id
                                                    }
                                                />
                                            </Popconfirm>,
                                        ]
                                        : []
                                }
                            />
                            {canLinkCustomer && (
                                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                    <Select
                                            mode="multiple"
                                        style={{ flex: 1 }}
                                            showSearch={{
                                                filterOption: false, // tắt filter mặc định, dùng onSearch (server-side)
                                                onSearch: setCustomerSearch,
                                            }}
                                            optionLabelProp="label"
                                            optionRender={renderCustomerOptionWithStatus}
                                            popupMatchSelectWidth={false}
                                            maxTagCount="responsive"
                                            placeholder="Tìm Khách hàng theo tên/SĐT để gắn (chọn nhiều được)"
                                        loading={customerCandidatesLoading}
                                            value={selectedCustomerIds}
                                            onChange={setSelectedCustomerIds}
                                        options={customerCandidates.map((c) => ({
                                            value: c.id,
                                            label: customerPlainLabel(c),
                                            customer: c,
                                        }))}
                                        notFoundContent={
                                            customerCandidatesLoading ? 'Đang tìm...' : 'Không tìm thấy Khách hàng phù hợp'
                                        }
                                    />
                                        <CustomerQuickFilterButton value={customerQuickFilters} onChange={setCustomerQuickFilters} />
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                            disabled={selectedCustomerIds.length === 0}
                                        loading={addCustomersMutation.isPending}
                                            onClick={handleAddCustomers}
                                    >
                                        Gán
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    {linkedCustomers !== undefined && !canLinkCustomer && (
                        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                            {lockBlocksEdit && hasLinkCustomerPermission
                                ? 'Công việc đang bị khoá - cần quyền "Sửa khi đang khoá" để gán/gỡ Khách hàng.'
                                : 'Bạn chỉ có quyền xem Khách hàng liên quan - cần thêm quyền "Gắn Khách hàng vào Công việc định kỳ" để gán/gỡ.'}
                        </Text>
                    )}

                    <Divider style={{ margin: '20px 0 12px' }} />

                    <div style={{ marginBottom: 8 }}>
                        <Text strong>Phụ trách phụ ({secondaryAssignees.length}):</Text>
                        <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            Người hỗ trợ thêm ngoài Phụ trách chính &quot;{task.primaryAssignee?.name ?? '—'}&quot;.
                        </Text>
                    </div>
                    <SimpleList
                        loading={taskDetailLoading}
                        size="small"
                        dataSource={secondaryAssignees}
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
                        renderActions={(u) =>
                            canEditLinks
                                ? [
                                    <Popconfirm
                                        key="remove-secondary"
                                        title={`Gỡ "${u.name}" khỏi Phụ trách phụ?`}
                                        onConfirm={() => handleRemoveSecondary(u.id, u.name)}
                                        okText="Gỡ"
                                        cancelText="Huỷ"
                                    >
                                        <Button
                                            size="small"
                                            danger
                                            type="text"
                                            icon={<DeleteOutlined />}
                                            loading={
                                                removeSecondaryMutation.isPending &&
                                                removeSecondaryMutation.variables?.userId === u.id
                                            }
                                        />
                                    </Popconfirm>,
                                ]
                                : []
                        }
                    />
                    {canEditLinks && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <Select
                                mode="multiple"
                                style={{ flex: 1 }}
                                showSearch={{ optionFilterProp: 'label' }}
                                popupMatchSelectWidth={false}
                                maxTagCount="responsive"
                                placeholder="Chọn người để thêm làm Phụ trách phụ (chọn nhiều được)"
                                value={selectedSecondaryUserIds}
                                onChange={setSelectedSecondaryUserIds}
                                options={secondaryCandidates.map((u: { id: number; name: string; email?: string }) => ({
                                    value: u.id,
                                    label: u.email ? `${u.name} (${u.email})` : u.name,
                                }))}
                                notFoundContent="Không có người dùng nào đủ điều kiện"
                            />
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                disabled={selectedSecondaryUserIds.length === 0}
                                loading={addSecondaryMutation.isPending}
                                onClick={handleAddSecondary}
                            >
                                Gán
                            </Button>
                        </div>
                    )}

                    {!canEditLinks && (
                        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                            {lockBlocksEdit && hasEditPermission
                                ? 'Công việc đang bị khoá - cần quyền "Sửa khi đang khoá" để gán/gỡ Phụ trách phụ.'
                                : 'Bạn chỉ có quyền xem - cần quyền "Sửa Công việc định kỳ" để gán/gỡ Phụ trách phụ.'}
                        </Text>
                    )}
                </>
            )}
        </Modal>
    );
}