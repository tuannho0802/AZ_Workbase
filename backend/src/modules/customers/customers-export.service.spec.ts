import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { CustomersExportService } from './customers-export.service';
import { CustomersService } from './customers.service';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';

describe('CustomersExportService', () => {
  let service: CustomersExportService;

  // ⚠️ CustomersExportService CỐ Ý KHÔNG tự viết lại logic RBAC/filter -
  // nó gọi THẲNG CustomersService.findAll() (xem comment kiến trúc ở đầu
  // customers-export.service.ts). Vì vậy chỉ mock đúng method này, KHÔNG
  // dựng lại toàn bộ CustomersService thật - test ở đây tập trung vào ĐÚNG
  // NỘI DUNG FILE XLSX SINH RA + đúng tham số truyền xuống findAll(), không
  // lặp lại test logic RBAC/filter (đã có ở customers.service.spec.ts).
  const mockCustomersService = {
    findAll: jest.fn(),
  };

  const mockUiVisibilityService = {
    // Mặc định không ẩn gì (Set rỗng) - test riêng override khi cần assert
    // hành vi ẩn cột theo field:sales_assignment/field:marketing_assignment/
    // tab:deposits.
    getHiddenElementKeys: jest.fn().mockResolvedValue(new Set<string>()),
  };

  const mockCustomerStatusRepo = {
    find: jest.fn().mockResolvedValue([
      { code: 'pending', name: 'Chờ xử lý' },
      { code: 'closed', name: 'Đã chốt' },
    ]),
  };

  // notesRepository chỉ dùng qua createQueryBuilder() (Sheet 2) - dựng 1
  // chain giả trả về `getMany()` tuỳ chỉnh được theo từng test, cùng pattern
  // mockCustomerRepo.createQueryBuilder ở customers.service.spec.ts.
  const mockNotesQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const mockNotesRepo = {
    createQueryBuilder: jest.fn(() => mockNotesQueryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUiVisibilityService.getHiddenElementKeys.mockResolvedValue(new Set<string>());
    mockCustomerStatusRepo.find.mockResolvedValue([
      { code: 'pending', name: 'Chờ xử lý' },
      { code: 'closed', name: 'Đã chốt' },
    ]);
    mockNotesQueryBuilder.leftJoinAndSelect.mockReturnThis();
    mockNotesQueryBuilder.where.mockReturnThis();
    mockNotesQueryBuilder.orderBy.mockReturnThis();
    mockNotesQueryBuilder.addOrderBy.mockReturnThis();
    mockNotesQueryBuilder.getMany.mockResolvedValue([]);
    mockNotesRepo.createQueryBuilder.mockReturnValue(mockNotesQueryBuilder);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersExportService,
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: UiVisibilityService, useValue: mockUiVisibilityService },
        { provide: getRepositoryToken(CustomerNote), useValue: mockNotesRepo },
        { provide: getRepositoryToken(CustomerStatus), useValue: mockCustomerStatusRepo },
      ],
    }).compile();

    service = module.get<CustomersExportService>(CustomersExportService);
  });

  // Đọc lại buffer xlsx vừa sinh ra bằng chính exceljs - cách đáng tin cậy
  // duy nhất để xác nhận file THẬT SỰ đúng nội dung, không chỉ mock suông.
  async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    return wb;
  }

  it('gọi CustomersService.findAll với page=1, limit=EXPORT_MAX_ROWS (20000), giữ nguyên filter + đúng userId/role/scope/departmentId/positionId/isRootAdmin', async () => {
    mockCustomersService.findAll.mockResolvedValue({ data: [] });

    await service.exportCustomers(
      { search: 'nguyen', status: 'pending' } as any,
      7,
      'manager',
      'department',
      3,
      2,
      false,
    );

    expect(mockCustomersService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'nguyen', status: 'pending', page: 1, limit: 20000 }),
      7,
      'manager',
      'department',
      3,
      2,
      false,
    );
  });

  it('gọi UiVisibilityService.getHiddenElementKeys với đúng role + departmentId/positionId/isRootAdmin của NGƯỜI GỌI (không phải của khách hàng)', async () => {
    mockCustomersService.findAll.mockResolvedValue({ data: [] });

    await service.exportCustomers({} as any, 1, 'employee', 'own', 5, null, true);

    expect(mockUiVisibilityService.getHiddenElementKeys).toHaveBeenCalledWith(
      'employee',
      'customers',
      5,
      null,
      true,
    );
  });

  it('sinh Sheet "Khách hàng" đúng đủ cột mặc định + đúng dữ liệu khi không ẩn field nào', async () => {
    mockCustomersService.findAll.mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Nguyen Van A',
          phone: '0901234567',
          source: 'Facebook',
          campaign: 'UTM_Q4',
          inputDate: '2026-08-01',
          status: 'pending',
          salesUser: { id: 10, name: 'Sales A' },
          activeAssignees: [
            { id: 10, name: 'Sales A' },
            { id: 11, name: 'Sales B' },
          ],
          marketingUser: { id: 20, name: 'Marketing A' },
          joinedGroups: [{ id: 1, name: 'Nhóm VIP' }],
          recentNotes: [{ createdAt: '2026-08-02T09:00:00', createdByName: 'Admin', note: 'Đã gọi' }],
          totalDeposit30Days: 1500.5,
          createdBy: { name: 'Admin' },
          createdAt: '2026-08-01T08:00:00',
          updatedBy: null,
          updatedAt: null,
        },
      ],
    });

    const { buffer, filename } = await service.exportCustomers(
      { dateFrom: '2026-08-01', dateTo: '2026-08-31' } as any,
      1,
      'admin',
      'all',
    );

    expect(filename).toBe('KhachHang 01-08-2026 - 31-08-2026.xlsx');

    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet('Khách hàng');
    expect(sheet).toBeDefined();

    // Header đủ 16 cột khi không ẩn field nào (STT, Ngày nhập, Họ và tên,
    // SĐT, Nguồn, UTM, Sales phụ trách chính, Sales được chia, Marketing,
    // Trạng thái, Đã joined nhóm, Nạp tiền, Ghi chú gần nhất, Người tạo,
    // Ngày tạo, Người sửa cuối, Ngày sửa cuối).
    const headerRow = sheet!.getRow(1);
    const headers = (headerRow.values as any[]).filter(Boolean);
    expect(headers).toEqual([
      'STT',
      'Ngày nhập',
      'Họ và tên',
      'SĐT',
      'Nguồn',
      'UTM',
      'Sales phụ trách chính',
      'Sales được chia',
      'Marketing',
      'Trạng thái',
      'Đã joined nhóm',
      'Nạp tiền (01/08/2026 - 31/08/2026)',
      'Ghi chú gần nhất',
      'Người tạo',
      'Ngày tạo',
      'Người sửa cuối',
      'Ngày sửa cuối',
    ]);

    const row = sheet!.getRow(2);
    // Cột theo đúng thứ tự header ở trên: 1=STT, 2=Ngày nhập, 3=Họ và tên,
    // 4=SĐT, 5=Nguồn, 6=UTM, 7=Sales chính, 8=Sales được chia, 9=Marketing,
    // 10=Trạng thái, 11=Đã joined nhóm, 12=Nạp tiền, 13=Ghi chú gần nhất,
    // 14=Người tạo. Dùng INDEX SỐ (không dùng getCell(key)) vì sau khi ghi
    // buffer rồi load lại bằng exceljs, việc tra cell theo `key` không còn
    // đáng tin cậy (worksheet.columns không round-trip nguyên vẹn qua xlsx).
    expect(row.getCell(3).value).toBe('Nguyen Van A');
    expect(row.getCell(4).value).toBe('0901234567');
    // Trạng thái map đúng qua bảng customer_statuses (code -> name thật)
    expect(row.getCell(10).value).toBe('Chờ xử lý');
    expect(row.getCell(7).value).toBe('Sales A');
    // Sales được chia = activeAssignees TRỪ đi primarySales (không lặp lại chính họ)
    expect(row.getCell(8).value).toBe('Sales B');
    expect(row.getCell(9).value).toBe('Marketing A');
    expect(row.getCell(11).value).toBe('Nhóm VIP');
    expect(row.getCell(12).value).toBe(1500.5);
    expect(row.getCell(14).value).toBe('Admin');
  });

  it('BỎ HẲN cột Sales/Marketing/Nạp tiền khỏi Sheet khi UiVisibility báo field bị ẩn (đồng bộ với FE bỏ hẳn cột, không chỉ để trống ô)', async () => {
    mockUiVisibilityService.getHiddenElementKeys.mockResolvedValue(
      new Set(['field:sales_assignment', 'field:marketing_assignment', 'tab:deposits']),
    );
    mockCustomersService.findAll.mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Khach B',
          status: 'pending',
          createdAt: '2026-08-01T08:00:00',
        },
      ],
    });

    const { buffer } = await service.exportCustomers({} as any, 1, 'employee', 'own');

    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet('Khách hàng');
    const headers = (sheet!.getRow(1).values as any[]).filter(Boolean);

    expect(headers).not.toContain('Sales phụ trách chính');
    expect(headers).not.toContain('Sales được chia');
    expect(headers).not.toContain('Marketing');
    expect(headers.some((h) => String(h).startsWith('Nạp tiền'))).toBe(false);
  });

  it('hiện "Chưa gán" khi khách hàng chưa có Sales/Marketing phụ trách', async () => {
    mockCustomersService.findAll.mockResolvedValue({
      data: [{ id: 1, name: 'Khach C', status: 'pending', createdAt: '2026-08-01T08:00:00' }],
    });

    const { buffer } = await service.exportCustomers({} as any, 1, 'admin', 'all');
    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet('Khách hàng');
    const row = sheet!.getRow(2);

    expect(row.getCell(7).value).toBe('Chưa gán'); // primarySales
    expect(row.getCell(9).value).toBe('Chưa gán'); // marketing
  });

  it('fallback đúng code (không map được tên) khi status của khách hàng không còn tồn tại trong bảng customer_statuses', async () => {
    mockCustomersService.findAll.mockResolvedValue({
      data: [{ id: 1, name: 'Khach D', status: 'legacy_deleted_status', createdAt: '2026-08-01T08:00:00' }],
    });

    const { buffer } = await service.exportCustomers({} as any, 1, 'admin', 'all');
    const wb = await loadWorkbook(buffer);
    const sheet = wb.getWorksheet('Khách hàng');

    expect(sheet!.getRow(2).getCell(10).value).toBe('legacy_deleted_status'); // status column
  });

  it('Sheet "Ghi chú khách hàng" xuất TOÀN BỘ notes (không chỉ recentNotes) - CHỈ giới hạn đúng customerIds đã lọt qua RBAC/filter của findAll()', async () => {
    mockCustomersService.findAll.mockResolvedValue({
      data: [
        { id: 1, name: 'Khach A', phone: '0901111111', status: 'pending', createdAt: '2026-08-01T08:00:00' },
        { id: 2, name: 'Khach B', phone: '0902222222', status: 'pending', createdAt: '2026-08-01T08:00:00' },
      ],
    });
    mockNotesQueryBuilder.getMany.mockResolvedValue([
      {
        customerId: 1,
        note: 'Ghi chú 1',
        noteType: 'call',
        isImportant: true,
        createdByUser: { name: 'Admin' },
        createdAt: '2026-08-02T09:00:00',
        updatedByUser: null,
        updatedAt: null,
        editCount: 0,
      },
      {
        customerId: 2,
        note: 'Ghi chú 2',
        noteType: 'general',
        isImportant: false,
        createdByUser: { name: 'Sale B' },
        createdAt: '2026-08-03T09:00:00',
        updatedByUser: { name: 'Sale B' },
        updatedAt: '2026-08-04T09:00:00',
        editCount: 2,
      },
    ]);

    const { buffer } = await service.exportCustomers({} as any, 1, 'admin', 'all');

    // Query PHẢI chỉ lọc theo đúng customerIds mà findAll() đã trả về (1, 2)
    // - không được tự ý mở rộng phạm vi ra toàn bộ bảng customer_notes.
    expect(mockNotesQueryBuilder.where).toHaveBeenCalledWith('note.customer_id IN (:...ids)', {
      ids: [1, 2],
    });

    const wb = await loadWorkbook(buffer);
    const notesSheet = wb.getWorksheet('Ghi chú khách hàng');
    expect(notesSheet).toBeDefined();

    expect(notesSheet!.getRow(2).getCell(2).value).toBe('Khach A'); // customerName
    expect(notesSheet!.getRow(2).getCell(4).value).toBe('Ghi chú 1'); // note
    expect(notesSheet!.getRow(2).getCell(5).value).toBe('Cuộc gọi'); // noteType
    expect(notesSheet!.getRow(2).getCell(6).value).toBe('Có'); // isImportant

    expect(notesSheet!.getRow(3).getCell(2).value).toBe('Khach B'); // customerName
    expect(notesSheet!.getRow(3).getCell(11).value).toBe(2); // editCount
  });

  it('KHÔNG truy vấn notesRepository khi findAll() trả về danh sách khách hàng rỗng (tránh query customer_id IN () vô nghĩa)', async () => {
    mockCustomersService.findAll.mockResolvedValue({ data: [] });

    const { buffer } = await service.exportCustomers({} as any, 1, 'admin', 'all');

    expect(mockNotesRepo.createQueryBuilder).not.toHaveBeenCalled();

    const wb = await loadWorkbook(buffer);
    const notesSheet = wb.getWorksheet('Ghi chú khách hàng');
    expect(notesSheet).toBeDefined();
    // Header vẫn dựng đủ dù không có dòng dữ liệu nào.
    expect(notesSheet!.getRow(1).getCell(1).value).toBe('STT');
  });

  it('đặt tên file "KhachHang ToanBo.xlsx" khi không có filter dateFrom/dateTo', async () => {
    mockCustomersService.findAll.mockResolvedValue({ data: [] });

    const { filename } = await service.exportCustomers({} as any, 1, 'admin', 'all');

    expect(filename).toBe('KhachHang ToanBo.xlsx');
  });
});
