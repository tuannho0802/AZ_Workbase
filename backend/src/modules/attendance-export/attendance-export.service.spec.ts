import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import { AttendanceExportService } from './attendance-export.service';
import { ZkDeviceService } from '../zk-device/zk-device.service';

describe('AttendanceExportService', () => {
  let service: AttendanceExportService;

  // ⚠️ Chỉ mock 2 method thật sự được gọi (getAttendanceLogs/
  // getAttendanceSummary) - service này CỐ TÌNH không tự truy vấn/tính toán
  // gì, chỉ định dạng lại dữ liệu do ZkDeviceService trả về (xem comment
  // kiến trúc ở đầu attendance-export.service.ts), nên test ở đây tập trung
  // vào ĐÚNG NỘI DUNG FILE XLSX SINH RA, không lặp lại test logic nghiệp vụ
  // (đã có ở zk-device.service.spec.ts).
  const mockZkDeviceService = {
    getAttendanceLogs: jest.fn(),
    getAttendanceSummary: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceExportService,
        { provide: ZkDeviceService, useValue: mockZkDeviceService },
      ],
    }).compile();

    service = module.get<AttendanceExportService>(AttendanceExportService);
  });

  // Đọc lại buffer xlsx vừa sinh ra bằng chính exceljs - cách đáng tin cậy
  // duy nhất để xác nhận file THẬT SỰ đúng nội dung, không chỉ mock suông
  // rồi tin là đúng.
  async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    return wb;
  }

  describe('exportAttendanceLogs', () => {
    it('gọi getAttendanceLogs với page=1, limit=EXPORT_MAX_ROWS, kèm đúng viewerId/viewerRole', async () => {
      mockZkDeviceService.getAttendanceLogs.mockResolvedValue({ data: [] });

      await service.exportAttendanceLogs({ from: '2026-08-01', to: '2026-08-31' } as any, 5, 'manager');

      expect(mockZkDeviceService.getAttendanceLogs).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-08-01', to: '2026-08-31', page: 1, limit: 20000 }),
        5,
        'manager',
      );
    });

    it('sinh file xlsx đúng header và đúng dữ liệu (kể cả log chưa khớp nhân viên)', async () => {
      mockZkDeviceService.getAttendanceLogs.mockResolvedValue({
        data: [
          {
            recordTime: '2026-08-25T09:14:34',
            matchedUser: { id: 1, name: 'Admin' },
            deviceUserId: '44',
            deviceUserName: null,
            source: 'device_pull',
            deviceSerialNumber: 'ABC123',
          },
          {
            recordTime: '2026-08-25T09:20:00',
            matchedUser: null,
            deviceUserId: '99',
            deviceUserName: 'Thuyvy',
            source: 'device_push',
            deviceSerialNumber: 'ABC123',
          },
        ],
      });

      const { buffer, filename } = await service.exportAttendanceLogs(
        { from: '2026-08-01', to: '2026-08-31' } as any,
        1,
        'admin',
      );

      expect(filename).toBe('LogsChamCong 01-08-26 - 31-08-26.xlsx');

      const wb = await loadWorkbook(buffer);
      const sheet = wb.getWorksheet('Logs chấm công');
      expect(sheet).toBeDefined();

      // Header đúng thứ tự cột đã khai báo trong service
      expect(sheet!.getRow(1).getCell(1).value).toBe('Thời gian');
      expect(sheet!.getRow(1).getCell(2).value).toBe('Nhân viên');

      // Dòng 1: log đã khớp -> hiện tên nhân viên hệ thống
      expect(sheet!.getRow(2).getCell(1).value).toBe('25/08/2026 09:14:34');
      expect(sheet!.getRow(2).getCell(2).value).toBe('Admin');
      expect(sheet!.getRow(2).getCell(3).value).toBe('Đã khớp');

      // Dòng 2: log CHƯA khớp -> hiện tên trên máy (từ cache), kèm nhãn UID
      expect(sheet!.getRow(3).getCell(2).value).toBe('Chưa khớp: Thuyvy');
      expect(sheet!.getRow(3).getCell(3).value).toBe('Chưa khớp');
    });

    it('đặt tên file "ToanBo" khi không có filter from/to', async () => {
      mockZkDeviceService.getAttendanceLogs.mockResolvedValue({ data: [] });

      const { filename } = await service.exportAttendanceLogs({} as any, 1, 'admin');

      expect(filename).toBe('LogsChamCong ToanBo.xlsx');
    });

    it('hiện "UID <mã>" khi log chưa khớp VÀ chưa có tên cache', async () => {
      mockZkDeviceService.getAttendanceLogs.mockResolvedValue({
        data: [
          {
            recordTime: '2026-08-25T09:14:34',
            matchedUser: null,
            deviceUserId: '77',
            deviceUserName: null,
            source: 'device_pull',
            deviceSerialNumber: 'ABC123',
          },
        ],
      });

      const { buffer } = await service.exportAttendanceLogs({} as any, 1, 'admin');
      const wb = await loadWorkbook(buffer);
      const sheet = wb.getWorksheet('Logs chấm công');

      expect(sheet!.getRow(2).getCell(2).value).toBe('Chưa khớp: UID 77');
    });
  });

  describe('exportAttendanceSummary', () => {
    it('gọi getAttendanceSummary với page=1, limit=EXPORT_MAX_ROWS, kèm đúng viewerId/viewerRole', async () => {
      mockZkDeviceService.getAttendanceSummary.mockResolvedValue({ data: [] });

      await service.exportAttendanceSummary({ userId: 3 } as any, 5, 'assistant');

      expect(mockZkDeviceService.getAttendanceSummary).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 3, page: 1, limit: 20000 }),
        5,
        'assistant',
      );
    });

    it('sinh file xlsx đúng dữ liệu (đã map lẫn chưa map)', async () => {
      mockZkDeviceService.getAttendanceSummary.mockResolvedValue({
        data: [
          {
            date: '2026-08-25',
            userName: 'Admin',
            isMapped: true,
            checkIn: '2026-08-25T09:14:00',
            checkOut: '2026-08-25T18:00:00',
            workHours: 8.5,
            status: 'late',
            isLate: true,
            isEarlyLeave: false,
          },
          {
            date: '2026-08-25',
            userName: 'Thuyvy',
            isMapped: false,
            checkIn: '2026-08-25T09:00:00',
            checkOut: null,
            workHours: null,
            status: 'missing_checkout',
            isLate: false,
            isEarlyLeave: false,
          },
        ],
      });

      const { buffer, filename } = await service.exportAttendanceSummary(
        { from: '2026-08-01', to: '2026-08-31' } as any,
        1,
        'admin',
      );

      expect(filename).toBe('BangChamCong 01-08-26 - 31-08-26.xlsx');

      const wb = await loadWorkbook(buffer);
      const sheet = wb.getWorksheet('Bảng chấm công');

      // Ngày 25/08/2026 là Thứ Ba
      expect(sheet!.getRow(2).getCell(1).value).toBe('Thứ Ba, 25/08/2026');
      expect(sheet!.getRow(2).getCell(2).value).toBe('Admin');
      expect(sheet!.getRow(2).getCell(3).value).toBe('09:14');
      expect(sheet!.getRow(2).getCell(4).value).toBe('18:00');
      expect(sheet!.getRow(2).getCell(5).value).toBe('8.5h');
      expect(sheet!.getRow(2).getCell(6).value).toBe('Đi muộn');

      // Dòng chưa map: tên có hậu tố "(chưa map)", chưa checkout -> '—'
      expect(sheet!.getRow(3).getCell(2).value).toBe('Thuyvy (chưa map)');
      expect(sheet!.getRow(3).getCell(4).value).toBe('—');
      expect(sheet!.getRow(3).getCell(5).value).toBe('—');
    });
  });

  describe('exportMonthlyAttendance', () => {
    it('tính đúng số ngày trong tháng và dựng đủ cột theo tháng 8/2026 (31 ngày)', async () => {
      const { buffer, filename } = await service.exportMonthlyAttendance({
        month: '2026-08',
        rows: [
          {
            userName: 'Admin',
            departmentName: 'Kinh doanh',
            days: [
              { day: 1, mark: 'X' },
              { day: 2, mark: 'P', reason: 'Đơn nghỉ đã duyệt: Khám bệnh' },
            ],
            actualWorkDays: 25,
            paidLeaveDays: 1,
            unpaidLeaveDays: 0,
            annualLeaveBalance: 8,
            lateEntries: [{ dateStr: '01/08', time: '09:14', minutes: 14 }],
            earlyEntries: [],
          },
        ],
      } as any);

      expect(filename).toBe('TongHopChamCong 01-08-26 - 31-08-26.xlsx');

      const wb = await loadWorkbook(buffer);
      const sheet = wb.getWorksheet('Tổng hợp chấm công');
      expect(sheet).toBeDefined();

      // Header cố định bên trái
      expect(sheet!.getRow(1).getCell(1).value).toBe('STT');
      expect(sheet!.getRow(1).getCell(2).value).toBe('Họ và tên');
      expect(sheet!.getRow(1).getCell(3).value).toBe('Vị trí');

      // Cột "Ngày trong tháng" bắt đầu từ cột 4, 31 ngày -> cột cuối = 34
      expect(sheet!.getRow(1).getCell(4).value).toBe('Ngày trong tháng');
      // Cột 35 = "Ngày công thực tế" (4 cột trái + 31 ngày + 1)
      expect(sheet!.getRow(1).getCell(35).value).toBe('Ngày công thực tế');

      // Dữ liệu dòng 1 (rowIndex = 3, vì header chiếm 2 dòng)
      const dataRow = sheet!.getRow(3);
      expect(dataRow.getCell(1).value).toBe(1); // STT
      expect(dataRow.getCell(2).value).toBe('Admin');
      expect(dataRow.getCell(3).value).toBe('Kinh doanh');
      expect(dataRow.getCell(4).value).toBe('X'); // ngày 1, cột 4 = ngày 1
      expect(dataRow.getCell(5).value).toBe('P'); // ngày 2
      expect(dataRow.getCell(35).value).toBe(25); // Ngày công thực tế
    });

    it('tính đúng cho tháng có 28 ngày (không nhuận) - cột lệch đúng theo daysInMonth', async () => {
      const { buffer } = await service.exportMonthlyAttendance({
        month: '2026-02',
        rows: [],
      } as any);

      const wb = await loadWorkbook(buffer);
      const sheet = wb.getWorksheet('Tổng hợp chấm công');

      // 4 cột trái + 28 ngày -> cột "Ngày công thực tế" = cột 32
      expect(sheet!.getRow(1).getCell(32).value).toBe('Ngày công thực tế');
    });

    it('không gọi ZkDeviceService (nhận thẳng dữ liệu FE đã tính, không tự truy vấn lại)', async () => {
      await service.exportMonthlyAttendance({ month: '2026-08', rows: [] } as any);

      expect(mockZkDeviceService.getAttendanceLogs).not.toHaveBeenCalled();
      expect(mockZkDeviceService.getAttendanceSummary).not.toHaveBeenCalled();
    });

    it('đặt tên file "ToanBo" khi rows rỗng nhưng vẫn có month (from/to luôn suy ra được từ month)', async () => {
      const { filename } = await service.exportMonthlyAttendance({
        month: '2026-01',
        rows: [],
      } as any);

      // month luôn suy ra được monthStart/monthEnd -> KHÔNG rơi vào nhánh "ToanBo"
      expect(filename).toBe('TongHopChamCong 01-01-26 - 31-01-26.xlsx');
    });
  });
});
