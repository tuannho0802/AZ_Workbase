'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Collapse, Badge, Tag, Typography, Table, Empty } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { getWeekStart } from '@/lib/utils/week';

const { Text } = Typography;

export interface WeekGroupedRequestsProps<T extends { id: number; createdAt: string }> {
  records: T[];
  isMobile: boolean;
  loading?: boolean;
  columns: TableProps<T>['columns'];
  tableWidth: number;
  renderMobileCard: (record: T) => React.ReactNode;
  emptyText: string;
}

/**
 * Gộp danh sách đơn nghỉ phép (Chờ duyệt HOẶC Lịch sử) theo TUẦN của ngày
 * TẠO đơn (`createdAt` - không phải `updatedAt`, khớp fix sort bug ở
 * `findHistory()`/`findPending()`). Mặc định mở panel tuần HIỆN TẠI, ẩn các
 * tuần trước - mirror đúng pattern Collapse "mở hôm nay, gập ngày khác" ở
 * `PeriodicTasksAgendaView.tsx` (chỉ set default 1 LẦN DUY NHẤT khi có dữ
 * liệu, không tự đóng lại panel user vừa mở tay sau mỗi lần refetch).
 */
export function WeekGroupedRequests<T extends { id: number; createdAt: string }>({
  records,
  isMobile,
  loading,
  columns,
  tableWidth,
  renderMobileCard,
  emptyText,
}: WeekGroupedRequestsProps<T>) {
  const groups = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const r of records) {
      const key = getWeekStart(dayjs(r.createdAt)).format('YYYY-MM-DD');
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    // Trong từng tuần: đơn có ngày TẠO mới nhất lên đầu (đơn vừa được Sửa
    // KHÔNG được nhảy lên đầu - đúng yêu cầu sort chung của cả trang).
    for (const arr of map.values()) {
      arr.sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());
    }
    // Tuần gần nhất (mới nhất) lên đầu danh sách panel.
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
  }, [records]);

  const currentWeekKey = getWeekStart(dayjs()).format('YYYY-MM-DD');

  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const hasSetDefaultRef = useRef(false);

  useEffect(() => {
    if (hasSetDefaultRef.current || groups.length === 0) return;
    const keys = groups.map(([key]) => key);
    // Mặc định mở tuần hiện tại; nếu tuần hiện tại chưa có đơn nào (vd trang
    // Lịch sử vừa vào chưa có đơn xử lý tuần này), mở tuần gần nhất (đầu
    // danh sách vì đã sort mới nhất trước) để không mở lên trống trơn.
    setActiveKeys(keys.includes(currentWeekKey) ? [currentWeekKey] : [keys[0]]);
    hasSetDefaultRef.current = true;
  }, [groups, currentWeekKey]);

  if (!loading && groups.length === 0) {
    return <Empty description={emptyText} style={{ padding: '24px 0' }} />;
  }

  return (
    <Collapse
      activeKey={activeKeys}
      onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys : [keys])}
      items={groups.map(([weekKey, weekRecords]) => {
        const weekStart = dayjs(weekKey);
        const weekEnd = weekStart.add(6, 'day');
        const isCurrent = weekKey === currentWeekKey;
        return {
          key: weekKey,
          label: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text strong>
                Tuần {weekStart.format('DD/MM')} - {weekEnd.format('DD/MM/YYYY')}
              </Text>
              {isCurrent && <Tag color="blue">Tuần này</Tag>}
              <Badge count={weekRecords.length} color="#1890ff" showZero />
            </span>
          ),
          children: isMobile ? (
            <>{weekRecords.map((r) => (
              <div key={r.id}>{renderMobileCard(r)}</div>
            ))}</>
          ) : (
            <Table<T>
              columns={columns}
              dataSource={weekRecords}
              rowKey="id"
              loading={loading}
              pagination={false}
              size="small"
              tableLayout="fixed"
              scroll={{ x: tableWidth }}
            />
          ),
        };
      })}
    />
  );
}
