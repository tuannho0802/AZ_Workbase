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
  /** Số bản ghi hiển thị/trang BÊN TRONG 1 panel tuần (yêu cầu người dùng:
   * "kiểu phân trang cũ 20 item cho mỗi tuần" - vì 1 tuần có thể chứa hàng
   * trăm bản ghi (tối đa tới `WEEK_MODE_MAX_ROWS`), render hết vào 1 Table
   * không phân trang gây lag). Mặc định 20, truyền `false` để tắt hẳn (giữ
   * hành vi cũ - render hết). Đây CHỈ là phân trang client-side trên dữ liệu
   * đã có sẵn trong `records` (không gọi thêm API). */
  weekPageSize?: number | false;
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
 * Mặc định CHỈ MỞ tuần gần nhất (đầu danh sách, đã sort mới nhất trước) -
 * các tuần còn lại đóng, và AntD `Collapse` (không bật `forceRender`) chỉ
 * mount `Table`/danh sách con của 1 panel khi panel đó ĐƯỢC MỞ LẦN ĐẦU
 * (lazy render có sẵn của AntD) - tránh render hàng nghìn dòng của MỌI tuần
 * cùng lúc lúc mới vào trang, gây lag (yêu cầu người dùng: "chỉ load khi
 * data cần dùng đến"). Kèm `destroyOnHidden` để khi đóng lại 1 panel, DOM
 * của Table bên trong được GIẢI PHÓNG (không giữ mãi trong bộ nhớ) - mở lại
 * sau đó sẽ mount lại từ đầu, giữ trang nhẹ dù người dùng bấm mở nhiều tuần
 * trong 1 phiên dài.
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
  weekPageSize = 20,
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

  // ⚠️ Chỉ tự mở tuần ĐẦU TIÊN (gần nhất) mỗi khi dữ liệu trang đổi (đổi
  // trang/filter) - dùng pattern "adjust state during render" (so sánh chữ ký
  // `groups` trong lúc render, KHÔNG dùng useEffect gọi setState) theo đúng
  // khuyến nghị của React (tránh cascading render bị eslint
  // `react-hooks/set-state-in-effect` cảnh báo) - xem
  // https://react.dev/learn/you-might-not-need-an-effect.
  const groupsSignature = groups.map(([key]) => key).join(',');
  const [activeKeys, setActiveKeys] = useState<string[]>(() => (groups[0] ? [groups[0][0]] : []));
  // Phân trang con (20 item/tuần mặc định) - key = weekKey, value = trang
  // hiện tại (1-based) TRONG tuần đó. Tách riêng state cho từng tuần vì mỗi
  // panel cuộn độc lập với nhau.
  const [weekPages, setWeekPages] = useState<Record<string, number>>({});
  const [lastSignature, setLastSignature] = useState(groupsSignature);
  if (groupsSignature !== lastSignature) {
    setLastSignature(groupsSignature);
    setActiveKeys(groups[0] ? [groups[0][0]] : []);
    setWeekPages({});
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
        // Panel đóng -> unmount hẳn Table/list con khỏi DOM (không chỉ ẩn
        // bằng CSS) - kết hợp với lazy-render mặc định của AntD Collapse
        // (không bật `forceRender`) => 1 panel CHỈ tốn chi phí render khi
        // người dùng thực sự mở nó, và trả lại chi phí đó khi đóng lại.
        destroyOnHidden
        items={groups.map(([weekKey, weekRecords]) => {
          const weekStart = dayjs(weekKey);
          const weekEnd = weekStart.add(6, 'day');
          const isCurrent = weekKey === currentWeekKey;

          // Cắt trang con trong tuần (client-side, dữ liệu đã có sẵn trong
          // `weekRecords`). `weekPageSize === false` -> giữ hành vi cũ (render hết).
          const wp = weekPages[weekKey] ?? 1;
          const pagedRecords = weekPageSize
            ? weekRecords.slice((wp - 1) * weekPageSize, wp * weekPageSize)
            : weekRecords;
          const needsWeekPagination = !!weekPageSize && weekRecords.length > weekPageSize;
          const weekPaginationNode = needsWeekPagination ? (
            <div style={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end', marginTop: 12 }}>
              <Pagination
                current={wp}
                pageSize={weekPageSize as number}
                total={weekRecords.length}
                size="small"
                simple={isMobile}
                onChange={(p) => setWeekPages((prev) => ({ ...prev, [weekKey]: p }))}
              />
            </div>
          ) : null;

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
                {pagedRecords.map((r, i) => (
                  <div key={resolveRowKey(r, rowKey, i)}>
                    {renderMobileCard?.(r)}
                  </div>
                ))}
                {weekPaginationNode}
              </>
            ) : (
                <>
                  <Table<T>
                    columns={columns}
                    dataSource={pagedRecords}
                    rowKey={rowKey}
                    loading={loading}
                    pagination={false}
                    size={size}
                    scroll={scroll}
                    rowSelection={rowSelection}
                    expandable={expandable}
                  />
                  {weekPaginationNode}
                </>
            ),
          };
        })}
      />
      {paginationNode}
    </>
  );
}