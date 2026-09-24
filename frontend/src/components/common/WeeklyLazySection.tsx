'use client';

import { useState } from 'react';
import { Collapse, Badge, Tag, Typography, Table, Pagination, Empty, Spin, Alert } from 'antd';
import type { TableProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getWeekStart } from '@/lib/utils/week';
import type { WeeklyCollapsePaginationProps } from './WeeklyCollapseSection';

const { Text } = Typography;

/** Tóm tắt 1 tuần từ PHA 1 của BE (`weeks` trong response week-mode). */
export interface WeekBucketDto {
  /** 'YYYY-MM-DD' của Thứ 2. */
  weekStart: string;
  count: number;
}

export interface WeekFetchResult<T> {
  data: T[];
  weekTotal?: number;
}

export interface WeeklyLazySectionProps<T> {
  /** Danh sách tuần của trang hiện tại (PHA 1 - không kèm bản ghi). */
  weeks: WeekBucketDto[];
  /** PHA 2: gọi API lấy ĐÚNG bản ghi của 1 tuần (chỉ chạy khi panel được mở). */
  fetchWeek: (weekStart: string, weekPage: number, weekLimit: number) => Promise<WeekFetchResult<T>>;
  /** Đổi giá trị này (filter/trang đổi hoặc sau khi xoá/sync) -> bỏ cache các tuần. */
  resetKey: string | number;
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
  /** Phân trang THEO TUẦN (total = tổng số tuần, pageSize = số tuần/trang). */
  pagination: WeeklyCollapsePaginationProps;
  /** Số bản ghi/trang BÊN TRONG 1 tuần (server-side). Mặc định 20. */
  weekPageSize?: number;
}

interface WeekPanelBodyProps<T> extends Omit<WeeklyLazySectionProps<T>, 'weeks' | 'pagination' | 'emptyText' | 'loading'> {
  weekStart: string;
  count: number;
  weekPageSize: number;
}

function WeekPanelBody<T>({
  weekStart,
  count,
  weekPageSize,
  fetchWeek,
  resetKey,
  rowKey,
  columns,
  isMobile,
  renderMobileCard,
  expandable,
  rowSelection,
  scroll,
  size,
}: WeekPanelBodyProps<T>) {
  const [wp, setWp] = useState(1);
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['weekly-lazy', resetKey, weekStart, wp, weekPageSize],
    queryFn: () => fetchWeek(weekStart, wp, weekPageSize),
    staleTime: 30_000,
  });
  const rows = data?.data ?? [];
  const total = data?.weekTotal ?? count;

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        title="Không tải được dữ liệu của tuần này."
        action={<a onClick={() => refetch()}>Thử lại</a>}
      />
    );
  }

  const pager =
    total > weekPageSize ? (
      <div style={{ display: 'flex', justifyContent: isMobile ? 'center' : 'flex-end', marginTop: 12 }}>
        <Pagination current={wp} pageSize={weekPageSize} total={total} size="small" simple={isMobile} showSizeChanger={false} onChange={setWp} />
      </div>
    ) : null;

  if (isMobile) {
    return (
      <Spin spinning={isFetching}>
        {rows.map((r, i) => {
          const k =
            typeof rowKey === 'function'
              ? rowKey(r)
              : ((r as Record<PropertyKey, unknown>)[rowKey as PropertyKey] as React.Key) ?? i;
          return <div key={k}>{renderMobileCard?.(r)}</div>;
        })}
        {pager}
      </Spin>
    );
  }

  return (
    <>
      <Table<T>
        columns={columns}
        dataSource={rows}
        rowKey={rowKey}
        loading={isFetching}
        pagination={false}
        size={size}
        scroll={scroll}
        rowSelection={rowSelection}
        expandable={expandable}
      />
      {pager}
    </>
  );
}

/**
 * Bản LAZY của `WeeklyCollapseSection`: KHÔNG nhận bản ghi, chỉ nhận danh sách
 * tuần (PHA 1 của BE). Bản ghi của mỗi tuần chỉ được fetch (PHA 2:
 * `weekStart`/`weekPage`/`weekLimit`) khi người dùng mở panel đó.
 */
export function WeeklyLazySection<T>({
  weeks,
  fetchWeek,
  resetKey,
  isMobile,
  loading,
  emptyText,
  pagination,
  weekPageSize = 20,
  ...bodyProps
}: WeeklyLazySectionProps<T>) {
  const signature = `${resetKey}|${weeks.map((w) => w.weekStart).join(',')}`;
  const [activeKeys, setActiveKeys] = useState<string[]>(() => (weeks[0] ? [weeks[0].weekStart] : []));
  const [lastSignature, setLastSignature] = useState(signature);
  // Pattern "adjust state during render" (giống WeeklyCollapseSection): chỉ tự mở tuần mới nhất khi dữ liệu trang đổi.
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setActiveKeys(weeks[0] ? [weeks[0].weekStart] : []);
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

  if (!loading && weeks.length === 0) {
    return (
      <>
        <Empty description={emptyText} style={{ padding: '24px 0' }} />
        {pagination.total > 0 && paginationNode}
      </>
    );
  }

  const currentWeekKey = getWeekStart(dayjs()).format('YYYY-MM-DD');

  return (
    <Spin spinning={!!loading}>
      <Collapse
        activeKey={activeKeys}
        onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys : [keys])}
        destroyOnHidden
        items={weeks.map((w) => {
          const start = dayjs(w.weekStart);
          return {
            key: w.weekStart,
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text strong>
                  Tuần {start.format('DD/MM')} - {start.add(6, 'day').format('DD/MM/YYYY')}
                </Text>
                {w.weekStart === currentWeekKey && <Tag color="blue">Tuần này</Tag>}
                <Badge count={w.count} color="#1890ff" showZero />
              </span>
            ),
            children: (
              <WeekPanelBody<T>
                {...bodyProps}
                isMobile={isMobile}
                fetchWeek={fetchWeek}
                resetKey={resetKey}
                weekStart={w.weekStart}
                count={w.count}
                weekPageSize={weekPageSize}
              />
            ),
          };
        })}
      />
      {paginationNode}
    </Spin>
  );
}
