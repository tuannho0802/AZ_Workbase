'use client';

import { ReactNode } from 'react';
import { Spin, Empty } from 'antd';

/**
 * SimpleList
 * -----------------------------------------------------------------
 * Thay thế cho `antd`'s `List` - component này đã bị antd đánh dấu
 * DEPRECATED HOÀN TOÀN từ bản đang dùng (antd v6), không có API thay thế
 * 1-1 nào được khuyến nghị (khác với các deprecation khác luôn có gợi ý
 * "please use X instead"). Console sẽ log:
 *   "Warning: [antd: List] The `List` component is deprecated. And will
 *    be removed in next major version."
 *
 * Component này tái tạo lại đúng phần antd `List` + `List.Item` +
 * `List.Item.Meta` đang được dùng trong project (avatar/title/description
 * bên trái, actions bên phải, có loading/empty state, size nhỏ có viền
 * ngăn cách giữa các dòng) - dùng div/flex thuần, không phụ thuộc API
 * deprecated.
 */

export interface SimpleListItemMeta {
  avatar?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}

interface SimpleListProps<T> {
  loading?: boolean;
  dataSource: T[];
  rowKey: (item: T) => string | number;
  renderMeta: (item: T) => SimpleListItemMeta;
  renderActions?: (item: T) => ReactNode[];
  emptyText?: string;
  size?: 'small' | 'default';
  /** Thêm viền bao quanh toàn bộ list + bo góc (tương đương List `bordered`) */
  bordered?: boolean;
}

export function SimpleList<T>({
  loading,
  dataSource,
  rowKey,
  renderMeta,
  renderActions,
  emptyText = 'Không có dữ liệu',
  size = 'default',
  bordered = false,
}: SimpleListProps<T>) {
  const itemPadding = size === 'small' ? '8px 0' : '12px 0';
  const itemPaddingInline = bordered ? '12px 16px' : '0';

  return (
    <Spin spinning={!!loading}>
      {dataSource.length === 0 ? (
        <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div
          style={
            bordered
              ? { border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }
              : undefined
          }
        >
          {dataSource.map((item, index) => {
            const meta = renderMeta(item);
            const actions = renderActions?.(item) ?? [];
            const isLast = index === dataSource.length - 1;
            return (
              <div
                key={rowKey(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: bordered ? itemPaddingInline : itemPadding,
                  borderBottom: isLast ? 'none' : '1px solid #f0f0f0',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {meta.avatar}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>{meta.title}</div>
                    {meta.description && (
                      <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>
                        {meta.description}
                      </div>
                    )}
                  </div>
                </div>
                {actions.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {actions}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Spin>
  );
}
