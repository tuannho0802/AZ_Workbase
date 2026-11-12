'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, DatePicker, Empty, Input, InputNumber, Radio, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { METRIC_KEYS, type BulkRowError, type BulkSnapshotRow, type FanpageGridRow, type MetricKey } from '@/lib/api/fanpages.api';
import { useBulkSaveSnapshots, useFanpageGrid } from '@/lib/hooks/useFanpages';
import { METRIC_LABELS, applyPaste, fmtNum, isSuspiciousDrop, parsePasted } from '@/lib/utils/fanpageMetrics';
import { toastApiError } from '@/lib/utils/error-message.util';
import { PlatformTag } from './PlatformTag';

const { Text } = Typography;
const FMT = 'YYYY-MM-DD';

/** Bản nháp 1 dòng. `base` = `updatedAt` của dòng LÚC BẮT ĐẦU SỬA (null = lúc đó chưa có dòng) -> gửi làm `expectedUpdatedAt` (X24). */
interface Draft {
    values: Partial<Record<MetricKey, number | null>>;
    note?: string;
    base: string | null;
    confirmDrop?: boolean;
}

interface Props {
    enabled: boolean;
    /** Báo cho trang cha biết có thay đổi chưa lưu (hỏi xác nhận khi rời tab). */
    onDirtyChange: (dirty: boolean) => void;
}

const fmtInput = (v: string | number | undefined): string => (v == null || v === '' ? '' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
const parseInput = (v: string | undefined): number => Number((v ?? '').replace(/\./g, ''));

export function FanpageMetricsGridTab({ enabled, onDirtyChange }: Props) {
    const { message, modal } = App.useApp();
    const [date, setDate] = useState<string>(() => dayjs().format(FMT));
    const [mode, setMode] = useState<'missing' | 'all'>('missing');
    const [drafts, setDrafts] = useState<Record<number, Draft>>({});
    const [errors, setErrors] = useState<Record<number, BulkRowError>>({});
    const { grid, isLoading, isFetching } = useFanpageGrid(date, enabled);
    const saveMut = useBulkSaveSnapshots();
    const containerRef = useRef<HTMLDivElement>(null);

    const dirtyCount = Object.keys(drafts).length;
    useEffect(() => {
        onDirtyChange(dirtyCount > 0);
    }, [dirtyCount, onDirtyChange]);
    // Đóng tab/tải lại trình duyệt khi còn thay đổi chưa lưu.
    useEffect(() => {
        if (dirtyCount === 0) return;
        const h = (e: BeforeUnloadEvent) => {
            e.preventDefault();
        };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [dirtyCount]);
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    const allRows = useMemo(() => grid?.rows ?? [], [grid]);
    // "Chưa nhập hôm nay" giữ lại dòng đang sửa/đang báo lỗi để không biến mất dưới tay người dùng.
    const rows = useMemo(
        () => (mode === 'all' ? allRows : allRows.filter((r) => r.current == null || drafts[r.fanpageId] || errors[r.fanpageId])),
        [allRows, mode, drafts, errors],
    );
    const rowIds = useMemo(() => rows.map((r) => r.fanpageId), [rows]);
    const rowById = useMemo(() => new Map(allRows.map((r) => [r.fanpageId, r])), [allRows]);

    const valueOf = (r: FanpageGridRow, k: MetricKey): number | null => {
        const d = drafts[r.fanpageId]?.values;
        if (d && k in d) return d[k] ?? null;
        return r.current?.[k] ?? null;
    };

    /** Ghi giá trị 1 ô vào bản nháp; trả về bản nháp trống thì xoá hẳn (không đếm là "thay đổi"). */
    const applyValues = (prev: Record<number, Draft>, r: FanpageGridRow, patch: Partial<Record<MetricKey, number | null>>): Record<number, Draft> => {
        const old = prev[r.fanpageId];
        const base = old?.base !== undefined ? old.base : (r.current?.updatedAt ?? null);
        const values = { ...(old?.values ?? {}) };
        for (const [key, v] of Object.entries(patch) as Array<[MetricKey, number | null]>) {
            const orig = r.current?.[key] ?? null;
            if (v === orig) delete values[key]; // trả về đúng giá trị gốc = không còn thay đổi
            else if (v == null) values[key] = orig != null ? null : undefined; // xoá ô vốn đã có số -> null; ô vốn trống -> bỏ qua
            else values[key] = v;
            if (values[key] === undefined) delete values[key];
        }
        const next = { ...prev };
        if (Object.keys(values).length === 0 && old?.note === undefined) delete next[r.fanpageId];
        else next[r.fanpageId] = { ...old, values, base };
        return next;
    };

    const setCell = (r: FanpageGridRow, k: MetricKey, v: number | null) => {
        setDrafts((p) => applyValues(p, r, { [k]: v }));
        setErrors((p) => {
            if (!p[r.fanpageId]) return p;
            const n = { ...p };
            delete n[r.fanpageId];
            return n;
        });
    };

    const setNote = (r: FanpageGridRow, note: string) => {
        setDrafts((p) => {
            const old = p[r.fanpageId];
            const base = old?.base !== undefined ? old.base : (r.current?.updatedAt ?? null);
            const same = note === (r.current?.note ?? '');
            const values = old?.values ?? {};
            if (same && Object.keys(values).length === 0) {
                const n = { ...p };
                delete n[r.fanpageId];
                return n;
            }
            return { ...p, [r.fanpageId]: { ...old, values, base, note: same ? undefined : note } };
        });
    };

    const handlePaste = (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
        const text = e.clipboardData.getData('text');
        if (!/[\t\n]/.test(text.trim() === text ? text : text.trim())) return; // dán 1 ô: để InputNumber tự xử lý
        e.preventDefault();
        const res = applyPaste(parsePasted(text), rowIds, rowIndex, colIndex);
        setDrafts((p) => {
            let next = p;
            for (const [id, patch] of res.values) {
                const r = rowById.get(id);
                if (r) next = applyValues(next, r, patch);
            }
            return next;
        });
        const cells = [...res.values.values()].reduce((s, v) => s + Object.keys(v).length, 0);
        const extra = [res.invalidCells ? `${res.invalidCells} ô không phải số bị bỏ qua` : '', res.truncatedRows ? `${res.truncatedRows} dòng thừa bị cắt` : ''].filter(Boolean).join(' · ');
        message.info(`Đã dán ${cells} ô${extra ? ` (${extra})` : ''}. Kiểm tra rồi bấm Lưu.`);
    };

    const focusCell = (rowIndex: number, colIndex: number) => {
        containerRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rowIndex}-${colIndex}"] input`)?.focus();
    };

    const toPayload = (id: number, override?: Partial<Draft>): BulkSnapshotRow => {
        const d = { ...drafts[id], ...override } as Draft;
        const row: BulkSnapshotRow = { fanpageId: id, expectedUpdatedAt: d.base };
        for (const k of METRIC_KEYS) if (k in d.values) row[k] = d.values[k] ?? null;
        if (d.note !== undefined) row.note = d.note.trim() === '' ? null : d.note;
        if (d.confirmDrop) row.confirmDrop = true;
        return row;
    };

    const save = async (ids: number[], overrides: Record<number, Partial<Draft>> = {}) => {
        if (ids.length === 0) return;
        try {
            const res = await saveMut.mutateAsync({ date, rows: ids.map((id) => toPayload(id, overrides[id])) });
            const savedIds = new Set(res.saved.map((s) => s.fanpageId));
            setDrafts((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !savedIds.has(Number(id)))));
            setErrors((p) => {
                const n = { ...p };
                savedIds.forEach((id) => delete n[id]);
                res.errors.forEach((e) => (n[e.fanpageId] = e));
                return n;
            });
            if (res.errors.length === 0) message.success(`Đã lưu ${res.saved.length} Page`);
            else message.warning(`Đã lưu ${res.saved.length} Page · ${res.errors.length} dòng cần xử lý (tô viền đỏ)`);
        } catch (err) {
            toastApiError(message, err, 'Không thể lưu số liệu');
        }
    };

    const changeDate = (next: string) => {
        if (next === date) return;
        if (dirtyCount === 0) return setDate(next);
        modal.confirm({
            title: 'Đổi ngày sẽ bỏ các thay đổi chưa lưu',
            content: `${dirtyCount} dòng đang sửa dở sẽ bị xoá.`,
            okText: 'Đổi ngày',
            cancelText: 'Ở lại',
            onOk: () => {
                setDrafts({});
                setErrors({});
                setDate(next);
            },
        });
    };

    const discardRow = (id: number) => {
        setDrafts((p) => {
            const n = { ...p };
            delete n[id];
            return n;
        });
        setErrors((p) => {
            const n = { ...p };
            delete n[id];
            return n;
        });
    };

    const renderError = (r: FanpageGridRow) => {
        const e = errors[r.fanpageId];
        if (!e) return null;
        return (
            <Space size={8} wrap style={{ marginTop: 4 }}>
                <Text type="danger" style={{ fontSize: 12 }}>{e.message}</Text>
                {e.code === 'SUSPICIOUS_DROP' && (
                    <Button size="small" danger onClick={() => save([r.fanpageId], { [r.fanpageId]: { confirmDrop: true } })}>
                        Vẫn lưu
                    </Button>
                )}
                {e.code === 'STALE' && (
                    <Button size="small" danger onClick={() => save([r.fanpageId], { [r.fanpageId]: { base: e.currentUpdatedAt ?? null } })}>
                        Ghi đè
                    </Button>
                )}
                {(e.code === 'STALE' || e.code === 'INVALID') && (
                    <Button size="small" onClick={() => discardRow(r.fanpageId)}>
                        Bỏ thay đổi
                    </Button>
                )}
            </Space>
        );
    };

    const metricCol = (k: MetricKey, colIndex: number): ColumnsType<FanpageGridRow>[number] => ({
        title: METRIC_LABELS[k],
        key: k,
        width: 150,
        render: (_: unknown, r, rowIndex) => {
            const v = valueOf(r, k);
            const prev = r.previous?.[k] ?? null;
            const edited = drafts[r.fanpageId] && k in drafts[r.fanpageId].values;
            const warnDrop = k === 'followers' && edited && isSuspiciousDrop(prev, v);
            return (
                <div data-cell={`${rowIndex}-${colIndex}`} onPaste={(e) => handlePaste(e, rowIndex, colIndex)}>
                    <InputNumber
                        style={{ width: '100%', background: edited ? 'rgba(22,119,255,0.08)' : undefined }}
                        status={errors[r.fanpageId] ? 'error' : warnDrop ? 'warning' : undefined}
                        controls={false}
                        min={0}
                        precision={0}
                        value={v}
                        formatter={fmtInput}
                        parser={parseInput}
                        onChange={(val) => setCell(r, k, val == null ? null : Number(val))}
                        onPressEnter={() => focusCell(rowIndex + 1, colIndex)}
                        aria-label={`${METRIC_LABELS[k]} của ${r.name}`}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        ({prev == null ? '—' : fmtNum(prev)})
                    </Text>
                    {warnDrop && <Text type="warning" style={{ fontSize: 12, display: 'block' }}>Giảm &gt; 50% — kiểm tra lại</Text>}
                </div>
            );
        },
    });

    const columns: ColumnsType<FanpageGridRow> = [
        {
            title: 'Page',
            key: 'page',
            width: 230,
            fixed: 'left',
            render: (_: unknown, r) => (
                <div>
                    <Space size={4} wrap>
                        <PlatformTag platform={{ ...r.platform, isActive: true }} />
                        <Text strong>{r.name}</Text>
                    </Space>
                    {renderError(r)}
                </div>
            ),
        },
        ...METRIC_KEYS.map((k, i) => metricCol(k, i)),
        {
            title: 'Ghi chú',
            key: 'note',
            width: 200,
            render: (_: unknown, r) => (
                <Input
                    value={drafts[r.fanpageId]?.note ?? r.current?.note ?? ''}
                    maxLength={255}
                    onChange={(e) => setNote(r, e.target.value)}
                    aria-label={`Ghi chú số liệu của ${r.name}`}
                />
            ),
        },
    ];

    if (!enabled) return null;
    return (
        <div ref={containerRef}>
            <Space wrap style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                <Space wrap>
                    <Text>Ngày số liệu:</Text>
                    <DatePicker
                        format="DD/MM/YYYY"
                        allowClear={false}
                        value={dayjs(date)}
                        disabledDate={(d) => d.isAfter(dayjs(), 'day')}
                        onChange={(d) => d && changeDate(d.format(FMT))}
                    />
                    <Radio.Group
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        options={[
                            { value: 'missing', label: 'Page chưa nhập' },
                            { value: 'all', label: 'Tất cả' },
                        ]}
                    />
                </Space>
                <Space wrap>
                    {dirtyCount > 0 && <Text type="warning">{dirtyCount} thay đổi chưa lưu</Text>}
                    <Button
                        disabled={dirtyCount === 0}
                        onClick={() => {
                            setDrafts({});
                            setErrors({});
                        }}
                    >
                        Bỏ thay đổi
                    </Button>
                    <Button type="primary" disabled={dirtyCount === 0} loading={saveMut.isPending} onClick={() => save(Object.keys(drafts).map(Number))}>
                        Lưu {dirtyCount > 0 ? dirtyCount : ''} thay đổi
                    </Button>
                </Space>
            </Space>
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                title="Số liệu do nhân viên nhập tay. Số trong ngoặc là lần nhập trước. Có thể dán nhiều dòng/cột từ Excel vào ô đầu tiên (Tab/Enter để di chuyển)."
            />
            <Table<FanpageGridRow>
                rowKey="fanpageId"
                size="small"
                loading={isLoading || isFetching}
                columns={columns}
                dataSource={rows}
                scroll={{ x: 'max-content' }}
                pagination={{ pageSize: 50, hideOnSinglePage: true, showTotal: (t) => `${t} Page` }}
                onRow={(r) => ({ style: errors[r.fanpageId] ? { outline: '1px solid #ff4d4f', outlineOffset: -1 } : undefined })}
                locale={{
                    emptyText: (
                        <Empty
                            description={
                                mode === 'missing' && allRows.length > 0
                                    ? 'Tất cả Page đã có số liệu cho ngày này 🎉'
                                    : 'Bạn chưa có Page nào đang theo dõi để nhập số liệu'
                            }
                        />
                    ),
                }}
            />
        </div>
    );
}