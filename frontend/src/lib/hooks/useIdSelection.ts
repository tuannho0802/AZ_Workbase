'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Chọn nhiều dòng theo `id` để thao tác hàng loạt, DÙNG ĐƯỢC XUYÊN NHIỀU TUẦN
 * (mỗi tuần là 1 <Table> riêng trong WeeklyLazySection nên `selectedRowKeys`
 * gốc của antd không đủ). Cập nhật theo DELTA (toggle / setMany) thay vì để antd
 * trả về danh sách khoá đầy đủ - antd chỉ biết dòng của bảng đang hiển thị nên
 * sẽ làm rơi lựa chọn ở các tuần khác.
 */
export function useIdSelection() {
  const [ids, setIds] = useState<Set<number>>(() => new Set());

  const toggle = useCallback((id: number, selected: boolean) => {
    setIds((prev) => {
      if (prev.has(id) === selected) return prev;
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setMany = useCallback((list: number[], selected: boolean) => {
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of list) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next.size === prev.size && list.every((id) => prev.has(id) === selected) ? prev : next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const keys = useMemo(() => Array.from(ids), [ids]);

  return { ids, keys, count: ids.size, toggle, setMany, clear };
}
