import { describe, expect, it } from 'vitest';
import {
  buildLeaveExportRequest,
  filenameFromContentDisposition,
  formatExportCell,
  ymdToDmy,
} from './leaveExport';

describe('leaveExport utils', () => {
  it('ymdToDmy đổi ngày thuần, giữ nguyên chuỗi khác', () => {
    expect(ymdToDmy('2026-09-01')).toBe('01/09/2026');
    expect(ymdToDmy('abc')).toBe('abc');
  });

  it('formatExportCell: null ở cột số -> "—" (không ép 0), ngày -> DD/MM/YYYY, 0 vẫn là "0"', () => {
    expect(formatExportCell(null, { key: 'rate', header: '%', type: 'number' })).toBe('—');
    expect(formatExportCell(0, { key: 'n', header: 'n', type: 'number' })).toBe('0');
    expect(formatExportCell('2026-09-10', { key: 'd', header: 'd', type: 'date' })).toBe('10/09/2026');
    expect(formatExportCell(null, { key: 't', header: 't', type: 'text' })).toBe('');
  });

  it('buildLeaveExportRequest gộp kỳ + bộ lọc + form, bỏ field rỗng', () => {
    const body = buildLeaveExportRequest(
      'B',
      { period: 'month', anchor: '2026-09-15' },
      { departmentId: 2, leaveType: undefined, requesterId: undefined },
    );
    expect(body).toEqual({ period: 'month', anchor: '2026-09-15', departmentId: 2, form: 'B' });
  });

  it('filenameFromContentDisposition đọc filename* có dấu, fallback khi thiếu/hỏng', () => {
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''NghiPhep_A_2026-09-01.xlsx", 'x.xlsx'),
    ).toBe('NghiPhep_A_2026-09-01.xlsx');
    expect(filenameFromContentDisposition(undefined, 'x.xlsx')).toBe('x.xlsx');
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''%E0%A4%A", 'x.xlsx')).toBe('x.xlsx');
  });
});
