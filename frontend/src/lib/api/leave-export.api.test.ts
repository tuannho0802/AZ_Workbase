import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('./axios-instance', () => ({ default: { post } }));
const download = vi.hoisted(() => vi.fn());
vi.mock('./attendance-export.api', async () => {
  const actual = await vi.importActual<typeof import('./attendance-export.api')>('./attendance-export.api');
  return { ...actual, triggerBrowserDownload: download };
});

import { leaveExportApi } from './leave-export.api';

describe('leaveExportApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preview POST đúng endpoint + body', async () => {
    post.mockResolvedValue({ data: { form: 'A' } });
    const body = { period: 'month' as const, form: 'A' as const };
    expect(await leaveExportApi.preview(body)).toEqual({ form: 'A' });
    expect(post).toHaveBeenCalledWith('/leave-requests/export/preview', body);
  });

  it('exportExcel tải blob, lấy tên file từ Content-Disposition', async () => {
    const blob = new Blob(['x']);
    post.mockResolvedValue({
      data: blob,
      headers: { 'content-disposition': "attachment; filename*=UTF-8''NghiPhep_B.xlsx" },
    });
    const name = await leaveExportApi.exportExcel({ period: 'month', form: 'B' });
    expect(post).toHaveBeenCalledWith('/leave-requests/export', { period: 'month', form: 'B' }, { responseType: 'blob' });
    expect(download).toHaveBeenCalledWith(blob, 'NghiPhep_B.xlsx');
    expect(name).toBe('NghiPhep_B.xlsx');
  });

  it('lỗi blob JSON được parse lại thành message BE rồi ném tiếp', async () => {
    const err: any = {
      response: { data: new Blob([JSON.stringify({ message: 'Không có phạm vi' })], { type: 'application/json' }) },
    };
    post.mockRejectedValue(err);
    await expect(leaveExportApi.exportExcel({ period: 'month', form: 'A' })).rejects.toBe(err);
    expect(err.response.data.message).toBe('Không có phạm vi');
    expect(download).not.toHaveBeenCalled();
  });
});
