'use client';

import { useMemo, useState } from 'react';
import { Modal, Typography, Divider, Progress, Select, Button, App, Popconfirm, Tag, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useMyPermissions } from '@/lib/hooks/useMyPermissions';
import { usePeriodicTasks } from '@/lib/hooks/usePeriodicTasks';
import {
    useTaskChildren,
    useTaskParents,
    useTaskRollup,
    useAddTaskLink,
    useRemoveTaskLink,
} from '@/lib/hooks/usePeriodicTaskLinks';
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
 */
export function TaskLinksModal({ open, onClose, task }: Props) {
    const { message } = App.useApp();
    const { can } = useMyPermissions();
    const canEditLinks = can('periodic_tasks.edit');

    const taskId = task?.id ?? null;
    const { data: parents = [], isLoading: parentsLoading } = useTaskParents(taskId);
    const { data: children = [], isLoading: childrenLoading } = useTaskChildren(taskId);
    const { data: rollup, isLoading: rollupLoading } = useTaskRollup(taskId);

    const addMutation = useAddTaskLink();
    const removeMutation = useRemoveTaskLink();

    const [selectedParentId, setSelectedParentId] = useState<number | undefined>(undefined);
    const [selectedChildId, setSelectedChildId] = useState<number | undefined>(undefined);

    const { data: candidatesData, isLoading: candidatesLoading } = usePeriodicTasks({ page: 1, limit: 100 });
    const allTasks = useMemo(() => candidatesData?.data ?? [], [candidatesData]);

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
                </>
            )}
        </Modal>
    );
}