import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdSelection } from './useIdSelection';

describe('useIdSelection', () => {
  it('toggle thêm/bỏ từng id và giữ lựa chọn của các id khác', () => {
    const { result } = renderHook(() => useIdSelection());
    act(() => result.current.toggle(1, true));
    act(() => result.current.toggle(2, true));
    act(() => result.current.toggle(1, false));
    expect(result.current.keys).toEqual([2]);
    expect(result.current.count).toBe(1);
  });

  it('setMany (chọn/bỏ cả 1 tuần) KHÔNG làm rơi id ở tuần khác', () => {
    const { result } = renderHook(() => useIdSelection());
    act(() => result.current.setMany([1, 2, 3], true)); // tuần A
    act(() => result.current.setMany([10, 11], true)); // tuần B
    act(() => result.current.setMany([1, 2, 3], false)); // bỏ chọn tuần A
    expect(result.current.keys.sort((a, b) => a - b)).toEqual([10, 11]);
  });

  it('clear xoá hết; gọi lại khi đã rỗng không đổi tham chiếu (tránh render thừa)', () => {
    const { result } = renderHook(() => useIdSelection());
    act(() => result.current.setMany([1, 2], true));
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
    const before = result.current.ids;
    act(() => result.current.clear());
    expect(result.current.ids).toBe(before);
  });
});
