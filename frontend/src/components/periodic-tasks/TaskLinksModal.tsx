'use client';

import { useMemo, useState } from 'react';
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
import { useCustomers } from '@/lib/hooks/useCustomers';
import { PeriodicTask, PERIOD_TYPE_LABELS, PERIOD_RANK } from '@/lib/api/periodic-tasks.api';
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
 */
export function TaskLinksModal({ open, onClose, task }: Props) {
    const { message } = App.useApp();
    const { can } = useMyPermissions();
    const canEditLinks = can('periodic_tasks.edit');
    const canLinkCustomer = can('periodic_tasks.link_customer');

    const taskId = task?.id ?? null;
    const { data: parents = [], isLoading: parentsLoading } = useTaskParents(taskId);
    const { data: children = [], isLoading: childrenLoading } = useTaskChildren(taskId);
    const { data: rollup, isLoading: rollupLoading } = useTaskRollup(taskId);

    // Phase 3: `task` prop (từ danh sách) KHÔNG có `linkedCustomers` - phải
    // fetch riêng qua `GET /:id`, xem JSDoc đầu file.
    const { data: taskDetail, isLoading: taskDetailLoading } = usePeriodicTask(taskId);
    const linkedCustomers = taskDetail?.linkedCustomers;

    const addMutation = useAddTaskLink();
    const removeMutation = useRemoveTaskLink();
    const addCustomersMutation = useAddTaskCustomers();
    const removeCustomerMutation = useRemoveTaskCustomer();

    const [selectedParentId, setSelectedParentId] = useState<number | undefined>(undefined);
    const [selectedChildId, setSelectedChildId] = useState<number | undefined>(undefined);
    const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined);
    const [customerSearch, setCustomerSearch] = useState('');

    const { data: candidatesData, isLoading: candidatesLoading } = usePeriodicTasks({ page: 1, limit: 100 });
    const allTasks = useMemo(() => candidatesData?.data ?? [], [candidatesData]);

    // Search server-side (mirror `useCustomers.ts`) - chỉ chạy khi modal cho
    // phép gắn Customer, tránh gọi API thừa cho user không có quyền.
    const { data: customerCandidatesData, isLoading: customerCandidatesLoading } = useCustomers({
        page: 1,
        limit: 20,
        search: customerSearch || undefined,
    });
    const linkedCustomerIds = useMemo(
        () => new Set((linkedCustomers ?? []).map((c) => c.id)),
        [linkedCustomers],
    );
    const customerCandidates = useMemo(
        () => (customerCandidatesData?.data ?? []).filter((c) => !linkedCustomerIds.has(c.id)),
        [customerCandidatesData, linkedCustomerIds],
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
        setSelectedCustomerId(undefined);
        setCustomerSearch('');
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

    const handleAddCustomer = () => {
        if (!task || !selectedCustomerId) return;
        addCustomersMutation.mutate(
            { taskId: task.id, customerIds: [selectedCustomerId] },
            {
                onSuccess: () => {
                    message.success('Đã gắn Khách hàng vào Công việc');
                    setSelectedCustomerId(undefined);
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
                                showSearch
                                optionFilterProp="label"
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
                                showSearch
                                optionFilterProp="label"
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
                            Bạn chỉ có quyền xem liên kết - cần quyền &quot;Sửa Công việc định kỳ&quot; để gán/gỡ.
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
                                                {c.phone}
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
                                        style={{ flex: 1 }}
                                        showSearch
                                        filterOption={false}
                                        placeholder="Tìm Khách hàng theo tên/SĐT để gắn"
                                        loading={customerCandidatesLoading}
                                        value={selectedCustomerId}
                                        onChange={setSelectedCustomerId}
                                        onSearch={setCustomerSearch}
                                        options={customerCandidates.map((c) => ({
                                            value: c.id,
                                            label: `${c.name} - ${c.phone}`,
                                        }))}
                                        notFoundContent={
                                            customerCandidatesLoading ? 'Đang tìm...' : 'Không tìm thấy Khách hàng phù hợp'
                                        }
                                    />
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        disabled={!selectedCustomerId}
                                        loading={addCustomersMutation.isPending}
                                        onClick={handleAddCustomer}
                                    >
                                        Gán
                                    </Button>
                                </div>
                            )}
                        </>
                    )}

                    {linkedCustomers !== undefined && !canLinkCustomer && (
                        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                            Bạn chỉ có quyền xem Khách hàng liên quan - cần thêm quyền &quot;Gắn Khách hàng vào Công
                            việc định kỳ&quot; để gán/gỡ.
                        </Text>
                    )}
                </>
            )}
        </Modal>
    );
}