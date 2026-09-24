'use client';

import { useMemo, useState } from 'react';
import { Collapse, Badge, Tag, Typography, Table, Pagination, Empty, Alert } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { getWeekStart } from '@/lib/utils/week';

const { Text } = Typography;

/** Lấy key ổn định cho 1 record (dùng ở nhánh mobile - không có Table lo giúp). */
function resolveRowKey<T>(record: T, rowKey: TableProps<T>['rowKey'], index: number): React.Key {
  if (typeof rowKey === 'function') return rowKey(record);
  if (rowKey !== undefined) {
    const v = (record as Record<PropertyKey, unknown>)[rowKey as PropertyKey];
    if (typeof v === 'string' || typeof v === 'number') return v;
  }
  return index;
}

export interface WeeklyCollapsePaginationProps {
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
  pageSizeOptions?: string[];
  showSizeChanger?: boolean;
  showTotal?: (total: number) => string;
}

export interface WeeklyCollapseSectionProps<T> {
  /** Dữ liệu của TRANG HIỆN TẠI (đã phân trang từ server) - component này chỉ
   * gom nhóm hiển thị theo tuần, KHÔNG tự fetch/gộp nhiều trang. */
  records: T[];
  /** Lấy field ngày dùng để xác định tuần (vd `r => r.createdAt`). */
  getDate: (record: T) => string | null | undefined;
  rowKey: TableProps<T>['rowKey'];
  columns: TableProps<T>['columns'];
  isMobile?: boolean;
  loading?: boolean;
  emptyText: string;
  renderMobileCard?: (record: T) => React.ReactNode;
  expandable?: TableProps<T>['expandable'];
  rowSelection?: TableProps<T>['rowSelection'];
  scroll?: TableProps<T>['scroll'];
  size?: TableProps<T>['size'];
  /** Phân trang THẬT (server-side) - render bên dưới Collapse, KHÔNG mất đi
   * khi gom nhóm theo tuần (yêu cầu người dùng: "vẫn có phân trang nhé").
   *
   * ⚠️ WEEK-MODE (phân trang theo TUẦN thay vì theo bản ghi - xem BE
   * `week-window.util.ts`): component này không quan tâm đơn vị của
   * `pagination.total`/`pageSize` là bản ghi hay tuần - nó chỉ render 1
   * `<Pagination>` chuẩn. Khi dùng week-mode, TRUYỀN `total = totalWeeks` và
   * `pageSize = weeksPerPage` (không phải số bản ghi) để `<Pagination>` tự
   * tính đúng số trang = ceil(totalWeeks / weeksPerPage), khớp `totalPages`
   * BE trả về. `onChange(page, weeksPerPage)` ở phía gọi component set lại
   * state `weeksPerPage` (không phải "số bản ghi/trang" như chế độ cũ). */
  pagination: WeeklyCollapsePaginationProps;
  /** Week-mode: true khi BE đã cắt bớt bản ghi của trang vì vượt
   * `WEEK_MODE_MAX_ROWS` (dữ liệu 1 vài tuần trong trang quá nhiều). Hiện
   * cảnh báo để người dùng biết cần thu hẹp bộ lọc/giảm `weeksPerPage`. */
  truncated?: boolean;
}

/**
 * Gom 1 trang dữ liệu (log/lịch sử...) đã fetch từ server thành các
 * `Collapse` item theo TUẦN (Thứ 2 - Chủ nhật, xem `getWeekStart()`), mỗi
 * item chứa 1 Table con `pagination={false}` (hoặc list card ở mobile) chỉ
 * gồm bản ghi thuộc tuần đó. Phân trang THẬT vẫn giữ nguyên, render bằng 1
 * `<Pagination>` riêng bên dưới Collapse - state page/pageSize vẫn do trang
 * cha sở hữu và truyền vào qua prop `pagination`, component này không tự ý
 * fetch thêm dữ liệu.
 *
 * Mặc định MỞ HẾT mọi tuần có trong trang hiện tại mỗi khi dữ liệu trang đổi
 * (khác `WeekGroupedRequests` - chỉ mở tuần hiện tại/tuần gần nhất - vì ở
 * đây phạm vi hiển thị đã bị giới hạn bởi phân trang server nên số tuần/trang
 * thường rất ít, mở hết để không phải bấm thêm 1 bước mới thấy dữ liệu).
 */
export function WeeklyCollapseSection<T>({
  records,
  getDate,
  rowKey,
  columns,
  isMobile,
  loading,
  emptyText,
  renderMobileCard,
  expandable,
  rowSelection,
  scroll,
  size = 'middle',
  pagination,
  truncated,
}: WeeklyCollapseSectionProps<T>) {
  const groups = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const r of records) {
      const raw = getDate(r);
      if (!raw) continue;
      const key = getWeekStart(dayjs(raw)).format('YYYY-MM-DD');
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    // Giữ nguyên thứ tự đã sort từ server (mới nhất trước) BÊN TRONG từng
    // tuần - không sort lại. Tuần mới nhất lên đầu danh sách panel.
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
  }, [records, getDate]);

  const currentWeekKey = getWeekStart(dayjs()).format('YYYY-MM-DD');

  // ⚠️ Mở lại HẾT các tuần mỗi khi dữ liệu trang đổi (đổi trang/filter) - dùng
  // pattern "adjust state during render" (so sánh chữ ký `groups` trong lúc
  // render, KHÔNG dùng useEffect gọi setState) theo đúng khuyến nghị của React
  // (tránh cascading render bị eslint `react-hooks/set-state-in-effect` cảnh
  // báo) - xem https://react.dev/learn/you-might-not-need-an-effect.
  const groupsSignature = groups.map(([key]) => key).join(',');
  const [activeKeys, setActiveKeys] = useState<string[]>(() => groups.map(([key]) => key));
  const [lastSignature, setLastSignature] = useState(groupsSignature);
  if (groupsSignature !== lastSignature) {
    setLastSignature(groupsSignature);
    setActiveKeys(groups.map(([key]) => key));
  }

  const paginationNode = (
    <div style={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end', marginTop: 16 }}>
      <Pagination
        current={pagination.current}
        pageSize={pagination.pageSize}
        total={pagination.total}
        showSizeChanger={pagination.showSizeChanger ?? !isMobile}
        pageSizeOptions={pagination.pageSizeOptions}
        showTotal={pagination.showTotal}
        simple={isMobile}
        size={isMobile ? 'small' : undefined}
        onChange={pagination.onChange}
      />
    </div>
  );

  if (!loading && groups.length === 0) {
    return (
      <>
        <Empty description={emptyText} style={{ padding: '24px 0' }} />
        {pagination.total > 0 && paginationNode}
      </>
    );
  }

  return (
    <>
      {truncated && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title="Dữ liệu của trang này quá nhiều nên đã bị cắt bớt. Hãy thu hẹp bộ lọc hoặc giảm số tuần/trang để xem đầy đủ."
        />
      )}
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
              <>
                {weekRecords.map((r, i) => (
                  <div key={resolveRowKey(r, rowKey, i)}>
                    {renderMobileCard?.(r)}
                  </div>
                ))}
              </>
            ) : (
              <Table<T>
                columns={columns}
                dataSource={weekRecords}
                rowKey={rowKey}
                loading={loading}
                pagination={false}
                size={size}
                scroll={scroll}
                rowSelection={rowSelection}
                expandable={expandable}
              />
            ),
          };
        })}
      />
      {paginationNode}
    </>
  );
}