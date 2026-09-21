import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { CustomersImportService } from './customers.import.service';
import { AuditService } from '../audit/audit.service';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { MediaSource } from '../../database/entities/media-source.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';

/** Dựng file .xlsx thật trong bộ nhớ (multer memoryStorage cho ra đúng dạng này). */
function buildXlsxFile(rows: Record<string, string>[], name = 'khach.xlsx'): Express.Multer.File {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return {
    originalname: name,
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersImportService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();
    service = module.get(CustomersImportService);
  });

  it('import thành công -> ghi 1 dòng IMPORT_CUSTOMERS (entity=customer, id=0) với tổng kết + danh sách SĐT đã nhập', async () => {
    const file = buildXlsxFile([
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
    const file = buildXlsxFile([{ 'Họ và tên': 'A', 'Số điện thoại': '0901234567' }]);

    await service.importExcel(file, 7);

    expect(mockQueryRunner.commitTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      mockAuditService.logActionAsync.mock.invocationCallOrder[0],
    );
  });

  it('insert lỗi (rollback) -> KHÔNG ghi log', async () => {
    mockManager.insert.mockRejectedValue(new Error('DB lỗi'));
    const file = buildXlsxFile([{ 'Họ và tên': 'A', 'Số điện thoại': '0901234567' }]);

    await expect(service.importExcel(file, 7)).rejects.toThrow(BadRequestException);

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
  });

  it('không có dòng hợp lệ nào (0 dòng được chèn) -> KHÔNG ghi log', async () => {
    const file = buildXlsxFile([{ 'Họ và tên': 'Sai SĐT', 'Số điện thoại': '123' }]);

    const result = await service.importExcel(file, 7);

    expect(result.successCount).toBe(0);
    expect(mockManager.insert).not.toHaveBeenCalled();
    expect(mockAuditService.logActionAsync).not.toHaveBeenCalled();
  });
});
