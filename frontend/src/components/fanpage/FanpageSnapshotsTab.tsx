'use client';

import { useState } from 'react';
import { App, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Progress, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { METRIC_KEYS, type FanpageFlags, type FanpageSnapshot, type FanpageTarget, type MetricKey, type SnapshotPayload } from '@/lib/api/fanpages.api';
import {
    useDeleteFanpageSnapshot,
    useFanpageSnapshots,
    useFanpageTargets,
    useSetFanpageTarget,
    useUpsertFanpageSnapshot,
} from '@/lib/hooks/useFanpages';
import { METRIC_LABELS, fmtNum, monthOfDate, targetProgress } from '@/lib/utils/fanpageMetrics';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;
const FMT = 'YYYY-MM-DD';

interface FormValues {
    date: dayjs.Dayjs;
    followers?: number | null;
    reach?: number | null;
    engagement?: number | null;
    views?: number | null;
    note?: string;
}

interface Props {
    fanpageId: number;
    flags: FanpageFlags;
    archived: boolean;
}

const fmtInput = (v: string | number | undefined): string => (v == null || v === '' ? '' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
const parseInput = (v: string | undefined): number => Number((v ?? '').replace(/\./g, ''));

/** Mã lỗi nghiệp vụ BE trả trong body 409 (FANPAGE_SNAPSHOT_STALE / FANPAGE_SNAPSHOT_SUSPICIOUS_DROP). */
const errorCode = (err: unknown): string | undefined => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

/** Tab "Số liệu" của Drawer: chart follower + bảng snapshot + modal 1 dòng (CÙNG service với lưới - X7) + mục tiêu tháng. */
export function FanpageSnapshotsTab({ fanpageId, flags, archived }: Props) {
    const { message, modal } = App.useApp();
    const { snapshots, isLoading } = useFanpageSnapshots(fanpageId);
    const { targets } = useFanpageTargets(fanpageId);
    const upsertMut = useUpsertFanpageSnapshot(fanpageId);
    const deleteMut = useDeleteFanpageSnapshot(fanpageId);
    const targetMut = useSetFanpageTarget(fanpageId);
    const [form] = Form.useForm<FormValues>();
    const [editing, setEditing] = useState<FanpageSnapshot | 'new' | null>(null);
    const canManage = !!flags.canManageMetrics && !archived;

    const month = monthOfDate(dayjs().format(FMT));
    const currentTarget = targets.find((t) => t.month === month) ?? null;
    const [targetDraft, setTargetDraft] = useState<number | null | undefined>(undefined); // undefined = chưa chạm
    const targetValue = targetDraft === undefined ? (currentTarget?.targetFollowerGain ?? null) : targetDraft;

    const openNew = () => {
        form.resetFields();
        form.setFieldsValue({ date: dayjs() });
        setEditing('new');
    };
    const openEdit = (s: FanpageSnapshot) => {
        form.resetFields();
        form.setFieldsValue({ date: dayjs(s.snapshotDate), followers: s.followers, reach: s.reach, engagement: s.engagement, views: s.views, note: s.note ?? undefined });
        setEditing(s);
    };

    const submit = async (values: FormValues, confirmDrop = false) => {
        const date = values.date.format(FMT);
        // Ngày đã có dòng -> sửa (kèm updatedAt đã đọc để chặn ghi đè người khác - X24); chưa có -> expected = null.
        const existing = snapshots.find((s) => s.snapshotDate === date) ?? null;
        const data: SnapshotPayload = { expectedUpdatedAt: existing?.updatedAt ?? null };
        for (const k of METRIC_KEYS) {
            const v = values[k];
            const orig = existing?.[k] ?? null;
            if (v == null) {
                if (orig != null) data[k] = null; // xoá giá trị cũ
            } else if (v !== orig) data[k] = v; // chỉ gửi ô THỰC SỰ đổi (tránh kích hoạt lại cảnh báo giảm >50% khi chỉ sửa ghi chú)
        }
        const note = (values.note ?? '').trim();
        if (note !== (existing?.note ?? '')) data.note = note === '' ? null : note;
        if (confirmDrop) data.confirmDrop = true;
        try {
            await upsertMut.mutateAsync({ date, data });
            message.success('Đã lưu số liệu');
            setEditing(null);
        } catch (err) {
            const code = errorCode(err);
            if (code === 'FANPAGE_SNAPSHOT_SUSPICIOUS_DROP') {
                modal.confirm({
                    title: 'Followers giảm hơn 50% so với lần nhập trước',
                    content: 'Có thể bạn gõ nhầm. Vẫn lưu số này?',
                    okText: 'Vẫn lưu',
                    cancelText: 'Sửa lại',
                    onOk: () => submit(values, true),
                });
                return;
            }
            if (code === 'FANPAGE_SNAPSHOT_STALE') {
                modal.warning({ title: 'Số liệu vừa được người khác sửa', content: 'Danh sách đã được tải lại. Kiểm tra số mới rồi nhập lại nếu cần.' });
                setEditing(null);
                return;
            }
            toastApiError(message, err, 'Không thể lưu số liệu');
        }
    };

    const remove = async (s: FanpageSnapshot) => {
        try {
            await deleteMut.mutateAsync(s.snapshotDate);
            message.success('Đã xoá số liệu');
        } catch (err) {
            toastApiError(message, err, 'Không thể xoá số liệu');
        }
    };

    const saveTarget = async () => {
        try {
            await targetMut.mutateAsync({ month, target: targetValue });
            setTargetDraft(undefined);
            message.success(targetValue == null ? 'Đã bỏ mục tiêu tháng' : 'Đã đặt mục tiêu tháng');
        } catch (err) {
            toastApiError(message, err, 'Không thể đặt mục tiêu');
        }
    };

    const chartData = snapshots
        .filter((s) => s.followers != null)
        .slice()
        .reverse()
        .map((s) => ({ label: dayjs(s.snapshotDate).format('DD/MM'), followers: s.followers }));

    const columns: ColumnsType<FanpageSnapshot> = [
        { title: 'Ngày', dataIndex: 'snapshotDate', width: 105, render: (d: string) => dayjs(d).format('DD/MM/YYYY') },
        ...METRIC_KEYS.map((k: MetricKey) => ({ title: METRIC_LABELS[k], dataIndex: k, align: 'right' as const, render: fmtNum })),
        { title: 'Ghi chú', dataIndex: 'note', ellipsis: true, render: (n: string | null) => n ?? '—' },
        { title: 'Người nhập', key: 'by', width: 130, render: (_: unknown, s) => (s.updatedBy ?? s.createdBy)?.name ?? '—' },
        {
            title: '',
            key: 'actions',
            width: 80,
            render: (_: unknown, s) => (
                <Space size="small">
                    {canManage && <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(s)} aria-label="Sửa số liệu" />}
                    {flags.canDeleteMetrics && (
                        <Popconfirm title="Xoá số liệu ngày này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => remove(s)}>
                            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Xoá số liệu" />
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    const targetColumns: ColumnsType<FanpageTarget> = [
        { title: 'Tháng', dataIndex: 'month', width: 90, render: (m: string) => `${m.slice(5)}/${m.slice(0, 4)}` },
        { title: 'Mục tiêu (+follower)', dataIndex: 'targetFollowerGain', align: 'right', render: fmtNum },
        { title: 'Thực tế', dataIndex: 'actualGain', align: 'right', render: (n: number | null) => (n == null ? <Text type="secondary">Chưa đủ số liệu</Text> : `${n > 0 ? '+' : ''}${fmtNum(n)}`) },
        {
            title: 'Tiến độ',
            key: 'progress',
            width: 140,
            render: (_: unknown, t) => {
                const pct = targetProgress(t.actualGain, t.targetFollowerGain);
                return pct == null ? '—' : <Progress percent={pct} size="small" />;
            },
        },
    ];

    return (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            {chartData.length >= 2 && (
                <div style={{ width: '100%', height: 200 }}>
                    <ResponsiveContainer>
                        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                            <XAxis dataKey="label" />
                            <YAxis width={70} domain={['auto', 'auto']} tickFormatter={(v: number) => v.toLocaleString('vi-VN')} />
                            <ChartTooltip formatter={(v) => (typeof v === 'number' ? v.toLocaleString('vi-VN') : String(v))} />
                            <Line type="monotone" dataKey="followers" name="Followers" stroke="#1677ff" strokeWidth={2} dot={chartData.length < 20} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
            {canManage && (
                <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>
                    Thêm số liệu
                </Button>
            )}
            <Table<FanpageSnapshot>
                rowKey="id"
                size="small"
                loading={isLoading}
                columns={columns}
                dataSource={snapshots}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: <Empty description="Chưa có số liệu nào" /> }}
            />

            <Card size="small" title={`Mục tiêu follower tháng ${month.slice(5)}/${month.slice(0, 4)}`}>
                {canManage && (
                    <Space wrap style={{ marginBottom: targets.length ? 12 : 0 }}>
                        <InputNumber
                            min={0}
                            precision={0}
                            value={targetValue}
                            onChange={(v) => setTargetDraft(v == null ? null : Number(v))}
                            formatter={fmtInput}
                            parser={parseInput}
                            placeholder="Chưa đặt"
                            prefix="+"
                            suffix="follower"
                        />
                        <Button
                            type="primary"
                            disabled={targetDraft === undefined || targetValue === (currentTarget?.targetFollowerGain ?? null)}
                            loading={targetMut.isPending}
                            onClick={saveTarget}
                        >
                            Lưu
                        </Button>
                        <Text type="secondary">Chỉ để báo cáo, không tạo nhắc việc.</Text>
                    </Space>
                )}
                {targets.length > 0 ? (
                    <Table<FanpageTarget> rowKey="month" size="small" columns={targetColumns} dataSource={targets} pagination={false} />
                ) : (
                    !canManage && <Text type="secondary">Chưa đặt mục tiêu nào.</Text>
                )}
            </Card>

            <Modal
                title={editing && editing !== 'new' ? 'Sửa số liệu' : 'Thêm số liệu'}
                open={editing !== null}
                onCancel={() => setEditing(null)}
                onOk={() => form.submit()}
                okText="Lưu"
                cancelText="Huỷ"
                confirmLoading={upsertMut.isPending}
                forceRender // giữ <Form> luôn được mount: openNew/openEdit gọi form.* TRƯỚC khi modal mở
            >
                <Form form={form} layout="vertical" onFinish={(v) => submit(v)}>
                    <Form.Item name="date" label="Ngày số liệu" rules={[{ required: true, message: 'Chọn ngày' }]}>
                        <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear={false} disabled={editing !== 'new'} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                    </Form.Item>
                    {METRIC_KEYS.map((k) => (
                        <Form.Item key={k} name={k} label={METRIC_LABELS[k]}>
                            <InputNumber style={{ width: '100%' }} min={0} precision={0} formatter={fmtInput} parser={parseInput} placeholder="Để trống = không nhập" />
                        </Form.Item>
                    ))}
                    <Form.Item name="note" label="Ghi chú" rules={[{ max: 255, message: 'Tối đa 255 ký tự' }]}>
                        <Input />
                    </Form.Item>
                    <Text type="secondary">Cần nhập ít nhất 1 chỉ số.</Text>
                </Form>
            </Modal>
        </Space>
    );
}
