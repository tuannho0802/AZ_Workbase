'use client';

import { Empty, Spin, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';
import type { FanpageHistoryEvent } from '@/lib/api/fanpages.api';
import { useFanpageHistory } from '@/lib/hooks/useFanpages';

const { Text } = Typography;

interface NamedUser {
    id: number;
    name: string;
}
interface HealthSide {
    healthStatusName?: string | null;
    healthNote?: string | null;
}

const names = (v: unknown): string => {
    const list = Array.isArray(v) ? (v as NamedUser[]) : [];
    return list.length ? list.map((u) => u.name).join(', ') : 'Chưa có';
};
const healthText = (v: unknown): string => {
    const h = v as HealthSide | null;
    if (!h) return '—';
    return h.healthStatusName ? `${h.healthStatusName}${h.healthNote ? ` (${h.healthNote})` : ''}` : '—';
};

/** Câu mô tả 1 sự kiện lịch sử (hàm thuần, export để test). */
export function describeHistoryEvent(e: Pick<FanpageHistoryEvent, 'type' | 'before' | 'after'>): string {
    switch (e.type) {
        case 'created': {
            const a = e.after as { owners?: NamedUser[]; health?: HealthSide | null } | null;
            return `Tạo Page · Người phụ trách: ${names(a?.owners)}${a?.health?.healthStatusName ? ` · Tình trạng: ${a.health.healthStatusName}` : ''}`;
        }
        case 'owners':
            return `Đổi người phụ trách: ${names(e.before)} → ${names(e.after)}`;
        case 'health':
            return `Đổi tình trạng: ${healthText(e.before)} → ${healthText(e.after)}`;
        case 'tracking':
            return (e.after as { isActive?: boolean } | null)?.isActive ? 'Bật theo dõi' : 'Tắt theo dõi (tạm ngừng)';
        case 'archive':
            return (e.after as { archived?: boolean } | null)?.archived ? 'Lưu trữ Page' : 'Bỏ lưu trữ Page';
        default:
            return 'Thay đổi';
    }
}

/** Timeline đổi người phụ trách / tình trạng / theo dõi / lưu trữ (E2). */
export function FanpageHistoryTab({ fanpageId }: { fanpageId: number }) {
    const { events, isLoading } = useFanpageHistory(fanpageId);
    if (isLoading) return <Spin />;
    if (events.length === 0) return <Empty description="Chưa có thay đổi nào được ghi lại" />;
    return (
        <Timeline
            items={events.map((e) => ({
                key: e.id,
                children: (
                    <div>
                        <div>{describeHistoryEvent(e)}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(e.at).format('HH:mm DD/MM/YYYY')} · {e.actor?.name ?? 'Hệ thống'}
                        </Text>
                    </div>
                ),
            }))}
        />
    );
}