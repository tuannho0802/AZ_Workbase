import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { CustomersImportService } from './customers.import.service';
import { AuditService } from '../audit/audit.service';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { MediaSource } from '../../database/entities/media-source.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { Utm } from '../../database/entities/utm.entity';
import { UtmsService } from '../utms/utms.service';

/** Dựng file .xlsx thật trong bộ nhớ (multer memoryStorage cho ra đúng dạng này). */
async function buildXlsxFile(rows: Record<string, string>[], name = 'khach.xlsx'): Promise<Express.Multer.File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(headers.map((h) => r[h] ?? null)));
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    originalname: name,
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.length,
    buffer,
  } as Express.Multer.File;
}

/** Dựng file .csv (UTF-8) trong bộ nhớ. */
function buildCsvFile(text: string, opts: { bom?: boolean; name?: string; mimetype?: string } = {}): Express.Multer.File {
  const buffer = Buffer.from((opts.bom ? '\ufeff' : '') + text, 'utf8');
  return {
    originalname: opts.name ?? 'khach.csv',
    mimetype: opts.mimetype ?? 'text/csv',
    size: buffer.length,
    buffer,
  } as Express.Multer.File;
}

describe('CustomersImportService', () => {
  let service: CustomersImportService;

  const mockUserRepo = { findOneBy: jest.fn() };
  const mockCustomerRepo = { find: jest.fn() };
  const mockMediaSourceRepo = { find: jest.fn() };
  const mockStatusRepo = { find: jest.fn() };
  const mockUtmRepo = { findOne: jest.fn() };
  const mockUtmsService = { resolveForCustomer: jest.fn() };
  const mockManager = { insert: jest.fn() };
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockManager,
  };
  const mockDataSource = {
    getRepository: jest.fn((entity: any) => {
      if (entity === User) return mockUserRepo;
      if (entity === Customer) return mockCustomerRepo;
      if (entity === MediaSource) return mockMediaSourceRepo;
      if (entity === CustomerStatus) return mockStatusRepo;
      if (entity === Utm) return mockUtmRepo;
      throw new Error('unexpected repo');
    }),
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };
  const mockAuditService = { logAction: jest.fn(), logActionAsync: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUserRepo.findOneBy.mockResolvedValue({ id: 7, role: 'employee', departmentId: 2 });
    mockCustomerRepo.find.mockResolvedValue([]);
    mockMediaSourceRepo.find.mockResolvedValue([{ name: 'Facebook' }]);
    mockStatusRepo.find.mockResolvedValue([{ code: 'pending' }, { code: 'closed' }]);
    mockManager.insert.mockResolvedValue(undefined);
    mockUtmRepo.findOne.mockReset();
    mockUtmRepo.findOne.mockResolvedValue(null);
    mockUtmsService.resolveForCustomer.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersImportService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditService, useValue: mockAuditService },
        { provide: UtmsService, useValue: mockUtmsService },
      ],
    }).compile();
    service = module.get(CustomersImportService);
  });

  it('import thành công -> ghi 1 dòng IMPORT_CUSTOMERS (entity=customer, id=0) với tổng kết + danh sách SĐT đã nhập', async () => {
    const file = await buildXlsxFile([
      { 'Họ và tên': 'Nguyễn Văn A', 'Số điện thoại': '0901234567', 'Nguồn': 'Facebook' },
      { 'Họ và tên': 'Trần Thị B', 'Số điện thoại': '0912345678', 'Nguồn': 'Facebook' },
      { 'Họ và tên': 'Sai SĐT', 'Số điện thoại': '123', 'Nguồn': 'Facebook' }, // bị bỏ qua
    ]);

    const result = await service.importExcel(file, 7);

    expect(result.successCount).toBe(2);
    expect(result.skipCount).toBe(1);
    expect(mockAuditService.logActionAsync).toHaveBeenCalledTimes(1);
    expect(mockAuditService.logActionAsync).toHaveBeenCalledWith(
      7, 'IMPORT_CUSTOMERS', 'customer', 0, null,
      {
        fileName: 'khach.xlsx',
        fileSizeBytes: file.size,
        totalRows: 3,
        successCount: 2,
        skipCount: 1,
        errorCount: 1,
        importedPhones: ['0901234567', '0912345678'],
      },
    );
  });

  it('log chỉ được ghi SAU khi transaction commit thành công', async () => {
    const file = await buildXlsxFile([{ 'Họ và tên': 'A', 'Số điện thoại': '0901234567' }]);

    await service.importExcel(file, 7);

    expect(mockQueryRunner.commitTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mockAuditService.logActionAsync.mock.invocationCallOrder[0],
    );
  });

  it('insert lỗi (rollback) -> KHÔNG ghi log', async () => {
    mockManager.insert.mockRejectedValue(new Error('DB lỗi'));
    const file = await buildXlsxFile([{ 'Họ và tên': 'A', 'Số điện thoại': '0901234567' }]);

    await expect(service.importExcel(file, 7)).rejects.toThrow(BadRequestException);

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
  });

  it('không có dòng hợp lệ nào (0 dòng được chèn) -> KHÔNG ghi log', async () => {
    const file = await buildXlsxFile([{ 'Họ và tên': 'Sai SĐT', 'Số điện thoại': '123' }]);

    const result = await service.importExcel(file, 7);

    expect(result.successCount).toBe(0);
    expect(mockManager.insert).not.toHaveBeenCalled();
    expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
  });

  describe('UTM (cột "Chiến dịch")', () => {
    const row = (phone: string, utm?: string) => ({ 'Họ và tên': 'A ' + phone, 'Số điện thoại': phone, ...(utm !== undefined ? { 'Chiến dịch': utm } : {}) });

    it('gom theo tên: 2 dòng cùng UTM (khác hoa/thường) chỉ resolve 1 lần; insert có utmId + snapshot tên chuẩn', async () => {
      mockUtmsService.resolveForCustomer.mockResolvedValue({ utmId: 5, campaign: 'FB_Q4' });
      const result: any = await service.importExcel(await buildXlsxFile([row('0901234567', 'FB_Q4'), row('0912345678', 'fb_q4')]), 7);
      expect(mockUtmsService.resolveForCustomer).toHaveBeenCalledTimes(1);
      expect(mockManager.insert.mock.calls[0][1]).toEqual([
        expect.objectContaining({ utmId: 5, campaign: 'FB_Q4' }),
        expect.objectContaining({ utmId: 5, campaign: 'FB_Q4' }),
      ]);
      expect(result.createdUtms).toEqual(['FB_Q4']); // chưa tồn tại trước import -> liệt kê là UTM mới
    });

    it('UTM đã tồn tại trước import -> KHÔNG nằm trong createdUtms', async () => {
      mockUtmRepo.findOne.mockResolvedValue({ id: 5 });
      mockUtmsService.resolveForCustomer.mockResolvedValue({ utmId: 5, campaign: 'FB_Q4' });
      const result: any = await service.importExcel(await buildXlsxFile([row('0901234567', 'FB_Q4')]), 7);
      expect(result.createdUtms).toEqual([]);
    });

    it('không có quyền tạo UTM mới / UTM bị khoá -> lỗi dòng, dòng không được chèn', async () => {
      mockUtmsService.resolveForCustomer.mockRejectedValue(new BadRequestException('UTM "X" chưa tồn tại và bạn không có quyền tạo UTM mới'));
      const result: any = await service.importExcel(await buildXlsxFile([row('0901234567', 'X'), row('0912345678', 'X'), row('0923456789')]), 7);
      expect(result.successCount).toBe(1); // chỉ dòng không có UTM
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].reason).toMatch(/không có quyền tạo/);
      expect(mockUtmsService.resolveForCustomer).toHaveBeenCalledTimes(1); // lỗi cũng được cache theo tên
    });

    it('ô UTM trống -> utmId null, campaign null, không gọi resolve', async () => {
      await service.importExcel(await buildXlsxFile([row('0901234567')]), 7);
      expect(mockUtmsService.resolveForCustomer).not.toHaveBeenCalled();
      expect(mockManager.insert.mock.calls[0][1][0]).toEqual(expect.objectContaining({ utmId: null, campaign: null }));
    });
  });

  describe('Định dạng file', () => {
    it('.csv dấu phẩy: giữ số 0 đầu của SĐT, import thành công', async () => {
      const file = buildCsvFile('Họ và tên,Số điện thoại,Nguồn\nNguyễn Văn A,0901234567,Facebook\nTrần Thị B,0912345678,Facebook\n');
      const result = await service.importExcel(file, 7);
      expect(result.successCount).toBe(2);
      expect(mockManager.insert.mock.calls[0][1].map((c: any) => c.phone)).toEqual(['0901234567', '0912345678']);
    });

    it('.csv dấu chấm phẩy + BOM UTF-8 (Excel VN "Save as CSV") -> đọc đúng tiếng Việt', async () => {
      const file = buildCsvFile('Họ và tên;Số điện thoại;Ghi chú\nLê Văn Đức;0923456789;"có; dấu chấm phẩy"\n', { bom: true });
      const result = await service.importExcel(file, 7);
      expect(result.successCount).toBe(1);
      expect(mockManager.insert.mock.calls[0][1][0]).toEqual(expect.objectContaining({ name: 'Lê Văn Đức', note: 'có; dấu chấm phẩy' }));
    });

    it('.csv gửi với mimetype application/vnd.ms-excel (Windows) vẫn đọc được', async () => {
      const file = buildCsvFile('Họ và tên,Số điện thoại\nA,0901234567\n', { mimetype: 'application/vnd.ms-excel' });
      expect((await service.importExcel(file, 7)).successCount).toBe(1);
    });

    it('báo đúng SỐ DÒNG THẬT khi có dòng trống xen giữa', async () => {
      const file = buildCsvFile('Họ và tên,Số điện thoại\nA,0901234567\n\n\nB,123\n');
      const result: any = await service.importExcel(file, 7);
      expect(result.errors[0].row).toBe(5); // dòng 5 trong file (1 = tiêu đề)
    });

    it('.xls (Excel cũ) -> từ chối với hướng dẫn lưu lại', async () => {
      const file = { originalname: 'cu.xls', mimetype: 'application/vnd.ms-excel', size: 10, buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]) } as Express.Multer.File;
      await expect(service.importExcel(file, 7)).rejects.toThrow(/\.xlsx hoặc \.csv/);
      await expect(service.importExcel(file, 7)).rejects.toThrow(/\.xls/);
    });

    it('đuôi .xlsx nhưng nội dung không phải zip -> báo sai định dạng', async () => {
      const file = { originalname: 'gia.xlsx', mimetype: 'application/octet-stream', size: 5, buffer: Buffer.from('hello') } as Express.Multer.File;
      await expect(service.importExcel(file, 7)).rejects.toThrow('File không đúng định dạng Excel/CSV');
    });

    it('đuôi lạ (.txt/.pdf) -> chỉ chấp nhận .xlsx hoặc .csv', async () => {
      const file = { originalname: 'a.pdf', mimetype: 'application/pdf', size: 5, buffer: Buffer.from('%PDF-') } as Express.Multer.File;
      await expect(service.importExcel(file, 7)).rejects.toThrow('Chỉ chấp nhận file .xlsx hoặc .csv');
    });

    it('.csv quá 1000 dòng -> từ chối', async () => {
      const lines = ['Họ và tên,Số điện thoại', ...Array.from({ length: 1001 }, (_, i) => `A${i},09${String(10000000 + i)}`)];
      await expect(service.importExcel(buildCsvFile(lines.join('\n')), 7)).rejects.toThrow('Tối đa 1000 dòng mỗi lần nhập');
    });

    it('file > 5MB -> từ chối', async () => {
      const file = { ...buildCsvFile('a,b\n1,2'), size: 5 * 1024 * 1024 + 1 } as Express.Multer.File;
      await expect(service.importExcel(file, 7)).rejects.toThrow('File không được vượt quá 5MB');
    });

    it('thiếu cột bắt buộc -> báo tên cột thiếu', async () => {
      await expect(service.importExcel(buildCsvFile('Họ và tên,Email\nA,a@a.com\n'), 7)).rejects.toThrow(/số điện thoại/);
    });

    it('.xlsx: ô SĐT dạng text giữ số 0; ô email dạng hyperlink + ô ngày thật được đọc đúng', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('S');
      ws.addRow(['Họ và Tên', 'Số điện thoại', 'Email', 'Ngày chốt', 'Trạng thái']);
      const r = ws.addRow(['Nguyễn A', '0901234567', { text: 'a@example.com', hyperlink: 'mailto:a@example.com' }, new Date(Date.UTC(2026, 7, 15)), 'closed']);
      r.getCell(2).numFmt = '@';
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      const file = { originalname: 'mau.xlsx', mimetype: 'application/octet-stream', size: buffer.length, buffer } as Express.Multer.File;

      const result = await service.importExcel(file, 7);

      expect(result.successCount).toBe(1);
      const saved = mockManager.insert.mock.calls[0][1][0];
      expect(saved.phone).toBe('0901234567');
      expect(saved.email).toBe('a@example.com');
      expect(saved.status).toBe('closed');
      expect(saved.closedDate.getFullYear()).toBe(2026);
      expect(saved.closedDate.getMonth()).toBe(7);
      expect(saved.closedDate.getDate()).toBe(15);
    });
  });
});
