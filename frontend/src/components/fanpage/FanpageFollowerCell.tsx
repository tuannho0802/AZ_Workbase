'use client';

import { useState } from 'react';
import { App, Button, InputNumber, Space, Tooltip, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Fanpage } from '@/lib/api/fanpages.api';
import { useUpsertFanpageSnapshot } from '@/lib/hooks/useFanpages';
import { fmtNum, formatDelta, isSuspiciousDrop } from '@/lib/utils/fanpageMetrics';
import { toastApiError } from '@/lib/utils/error-message.util';

const { Text } = Typography;

const fmtInput = (v: string | number | undefined): string => (v == null || v === '' ? '' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
const parseInput = (v: string | undefined): number => Number((v ?? '').replace(/\./g, ''));

/** Mã lỗi nghiệp vụ BE trả trong body 409. */
const errorCode = (err: unknown): string | undefined => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

/**
 * Ô Follower ở bảng Page, SỬA TẠI CHỖ (GĐ8 T4): hiện số mới nhất + chênh lệch + ngày nhập; bấm bút để nhập số hôm nay.
 * Ghi bằng ĐÚNG endpoint sẵn có `PUT /fanpages/:id/snapshots/<hôm nay>` `{ followers }` (cùng `saveRow`: giữ cảnh báo giảm >50%,
 * giữ nguyên Lượt xem/kỳ của dòng hôm nay nếu đã có). Quyền = `flags.canManageMetrics` (BE tính theo scope), không hardcode role.
 */
export function FanpageFollowerCell({ fanpage }: { fanpage: Fanpage }) {
    const { message, modal } = App.useApp();
    const upsertMut = useUpsertFanpageSnapshot(fanpage.id);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<number | null>(null);

    const latest = fanpage.latestMetrics ?? null;
    const canEdit = !!fanpage.flags.canManageMetrics && !fanpage.archivedAt && fanpage.cadence?.state !== 'paused';

    const open = () => {
        setDraft(latest?.followers ?? null);
        setEditing(true);
    };

    const save = async (confirmDrop = false) => {
        if (draft == null) {
            setEditing(false);
            return;
        }
        if (draft === latest?.followers && latest.date === dayjs().format('YYYY-MM-DD')) {
            setEditing(false); // không đổi so với số đã nhập hôm nay
            return;
        }
        try {
            await upsertMut.mutateAsync({ date: dayjs().format('YYYY-MM-DD'), data: { followers: draft, ...(confirmDrop ? { confirmDrop: true } : {}) } });
            message.success('Đã cập nhật follower');
            setEditing(false);
        } catch (err) {
            if (errorCode(err) === 'FANPAGE_SNAPSHOT_SUSPICIOUS_DROP') {
                modal.confirm({
                    title: 'Followers giảm hơn 50% so với lần nhập trước',
                    content: 'Có thể bạn gõ nhầm. Vẫn lưu số này?',
                    okText: 'Vẫn lưu',
                    cancelText: 'Sửa lại',
                    onOk: () => save(true),
                });
                return;
            }
            toastApiError(message, err, 'Không thể lưu follower');
        }
    };

    if (editing) {
        const warn = isSuspiciousDrop(latest?.followers, draft);
        return (
            <Space orientation="vertical" size={2}>
                <InputNumber
                    autoFocus
                    size="small"
                    style={{ width: 120 }}
                    controls={false}
                    min={0}
                    precision={0}
                    status={warn ? 'warning' : undefined}
                    value={draft}
                    formatter={fmtInput}
                    parser={parseInput}
                    disabled={upsertMut.isPending}
                    onChange={(v) => setDraft(v == null ? null : Number(v))}
                    onPressEnter={() => save()}
                    onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
                    aria-label={`Follower hôm nay của ${fanpage.name}`}
                />
                <Space size={4}>
                    <Button size="small" type="primary" loading={upsertMut.isPending} onClick={() => save()}>
                        Lưu
                    </Button>
                    <Button size="small" disabled={upsertMut.isPending} onClick={() => setEditing(false)}>
                        Huỷ
                    </Button>
                </Space>
                {warn && <Text type="warning" style={{ fontSize: 12 }}>Giảm &gt; 50% — kiểm tra lại</Text>}
            </Space>
        );
    }

    const delta = latest ? formatDelta(latest.delta, latest.deltaDays) : '';
    return (
        <Space size={4} align="start">
            <Space orientation="vertical" size={0}>
                <Text strong>{latest ? fmtNum(latest.followers) : '—'}</Text>
                {latest && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {delta ? `${delta} · ` : ''}
                        {dayjs(latest.date).format('DD/MM')}
                    </Text>
                )}
            </Space>
            {canEdit && (
                <Tooltip title="Nhập follower hôm nay">
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={open} aria-label={`Sửa follower của ${fanpage.name}`} />
                </Tooltip>
            )}
        </Space>
    );
}
