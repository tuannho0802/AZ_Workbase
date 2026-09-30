import { describe, it, expect } from 'vitest';
import { summarizeBulkResult, pruneSelection } from './bulk-result.util';

describe('summarizeBulkResult', () => {
  it('tất cả thành công', () => {
    const r = summarizeBulkResult({ succeeded: [1, 2], failed: [] }, 'khoá');
    expect(r.level).toBe('success');
    expect(r.text).toBe('Đã khoá 2 mục');
    expect(summarizeBulkResult({ succeeded: [1], failed: [] }, 'gỡ UTM', undefined, 'khách hàng').text).toBe('Đã gỡ UTM 1 khách hàng');
  });
  it('lẫn lộn -> warning, failures có tên', () => {
    const r = summarizeBulkResult({ succeeded: [1], failed: [{ id: 2, reason: 'còn KH' }] }, 'xoá', (id) => (id === 2 ? 'FB_Q4' : undefined));
    expect(r.level).toBe('warning');
    expect(r.failures).toEqual([{ id: 2, name: 'FB_Q4', reason: 'còn KH' }]);
  });
  it('tất cả lỗi -> error; tên thiếu dùng #ID', () => {
    const r = summarizeBulkResult({ succeeded: [], failed: [{ id: 9, reason: 'x' }] }, 'xoá');
    expect(r.level).toBe('error');
    expect(r.failures[0].name).toBe('#9');
  });
});

describe('pruneSelection', () => {
  it('giữ nguyên tham chiếu khi không đổi', () => {
    const sel = [1, 2];
    expect(pruneSelection(sel, [1, 2, 3])).toBe(sel);
  });
  it('bỏ ID không còn hiển thị', () => {
    expect(pruneSelection([1, 2, 3], [2])).toEqual([2]);
  });
});
