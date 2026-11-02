import { ForbiddenException } from '@nestjs/common';
import { LeaveRequestsExportService } from './leave-requests-export.service';

describe('LeaveRequestsExportService', () => {
  const stats: any = {
    period: { type: 'month', from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59', granularity: 'day', spanDays: 30 },
    summary: { requests: 0, approved: 0, rejected: 0, pending: 0, supplementary: 0, approvalRate: null, employees: 0 },
    byEmployee: [], byDepartment: [], byType: [], trend: [], byWeekday: [], frequency: [],
  };
  const statsSvc = { getStats: jest.fn(), getExportRequests: jest.fn() };
  const leaveSvc = { hasApproverScope: jest.fn() };
  const typesSvc = { findAll: jest.fn() };
  const audit = { logActionAsync: jest.fn() };
  let svc: LeaveRequestsExportService;
  const dto: any = { period: 'month', anchor: '2026-09-15', form: 'A' };
  const viewer = { id: 7, role: 'assistant', name: 'Lê Hoàng Tuấn', approveScope: 'department' };

  beforeEach(() => {
    jest.clearAllMocks();
    statsSvc.getStats.mockResolvedValue(stats);
    statsSvc.getExportRequests.mockResolvedValue([]);
    leaveSvc.hasApproverScope.mockReturnValue(true);
    typesSvc.findAll.mockResolvedValue([{ code: 'sick', name: 'Nghỉ ốm' }]);
    svc = new LeaveRequestsExportService(statsSvc as any, leaveSvc as any, typesSvc as any, audit as any);
  });

  it('không có phạm vi (scope own/null, không phải admin) -> 403, KHÔNG query DB', async () => {
    leaveSvc.hasApproverScope.mockReturnValue(false);
    await expect(svc.preview(dto, { ...viewer, approveScope: 'own' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(statsSvc.getStats).not.toHaveBeenCalled();
  });

  it('admin luôn qua cổng dù scope null (lối thoát hiểm cố định)', async () => {
    leaveSvc.hasApproverScope.mockReturnValue(false);
    await expect(svc.preview(dto, { id: 1, role: 'admin', approveScope: null })).resolves.toBeDefined();
  });

  it('truyền đúng viewer + scope của approve vào getStats', async () => {
    await svc.preview(dto, viewer);
    expect(statsSvc.getStats).toHaveBeenCalledWith(dto, 7, 'assistant', 'department');
  });

  it('form A chỉ gọi getStats, KHÔNG kéo danh sách đơn', async () => {
    await svc.preview(dto, viewer);
    expect(statsSvc.getExportRequests).not.toHaveBeenCalled();
  });

  it.each(['B', 'D', 'F'])('form %s kéo danh sách đơn cùng scope', async (form) => {
    await svc.preview({ ...dto, form }, viewer);
    expect(statsSvc.getExportRequests).toHaveBeenCalledWith({ ...dto, form }, 7, 'assistant', 'department');
  });

  it('preview cắt ≤20 dòng nhưng giữ tổng dòng thật', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1, requesterId: i + 1, requesterName: `NV ${i}`, departmentName: 'Sales', leaveType: 'sick',
      status: 'approved', startDate: '2026-09-10', endDate: '2026-09-10', totalDays: 1, isSupplementary: false,
      approverName: 'Sếp', rejectionReason: null, createdAt: new Date('2026-09-01T00:00:00Z'),
    }));
    statsSvc.getStats.mockResolvedValue({ ...stats, summary: { ...stats.summary, requests: 30 } });
    statsSvc.getExportRequests.mockResolvedValue(rows);
    const m = await svc.preview({ ...dto, form: 'B' }, viewer);
    const t = m.sheets[0].tables[0];
    expect(t.rows).toHaveLength(20);
    expect(t.totalRows).toBe(30);
    expect(t.truncated).toBe(true);
  });

  it('export trả file .xlsx hợp lệ (zip "PK"), tên file có form + kỳ + người xuất, ghi audit', async () => {
    const r = await svc.export(dto, viewer, '1.2.3.4', 'jest');
    expect(r.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(r.filename).toBe('NghiPhep_TongHopTheoNhanVien_2026-09-01_2026-09-30_ExportBy-LeHoangTuan.xlsx');
    expect(audit.logActionAsync).toHaveBeenCalledWith(
      7, 'EXPORT_LEAVE_REQUESTS', 'leave_request', 0, null,
      expect.objectContaining({ form: 'A', scope: 'department' }), '1.2.3.4', 'jest',
    );
  });

  it('export bị chặn thì KHÔNG ghi audit', async () => {
    leaveSvc.hasApproverScope.mockReturnValue(false);
    await expect(svc.export(dto, { ...viewer, approveScope: null })).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.logActionAsync).not.toHaveBeenCalled();
  });

  it('file xlsx đọc lại được: đúng tên sheet, header, ngày là Date thật, ô "=cmd" bị chống formula', async () => {
    statsSvc.getStats.mockResolvedValue({ ...stats, summary: { ...stats.summary, requests: 1 } });
    statsSvc.getExportRequests.mockResolvedValue([
      {
        id: 5, requesterId: 1, requesterName: '=HYPERLINK("x")', departmentName: 'Sales', leaveType: 'sick',
        status: 'rejected', startDate: '2026-09-10', endDate: '2026-09-11', totalDays: 2, isSupplementary: false,
        approverName: 'Sếp', rejectionReason: '+bad', createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
    const { buffer } = await svc.export({ ...dto, form: 'B' }, viewer);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Chi tiết đơn');
    expect(ws).toBeDefined();
    const rows: any[] = [];
    ws.eachRow((r: any) => rows.push(r.values));
    const header = rows.find((r) => r.includes('Nhân viên'));
    expect(header).toBeDefined();
    const dataRow = rows.find((r) => r[1] === 5);
    expect(dataRow[2]).toBe("'=HYPERLINK(\"x\")");
    expect(dataRow[3]).toBe('Sales');
    expect(dataRow[4]).toBe('Nghỉ ốm');
    expect(dataRow[5]).toBeInstanceOf(Date);
    expect(dataRow[8]).toBe('Từ chối');
    expect(dataRow[10]).toBe("'+bad");
  });
});
