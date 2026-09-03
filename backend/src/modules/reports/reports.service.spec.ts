import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { Customer } from '../../database/entities/customer.entity';
import { Role } from '../../common/enums/role.enum';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { getReportPeriodRange, getNowVn } from '../../common/utils/date-vn.util';

/**
 * ⚠️ CHIẾN LƯỢC MOCK - đọc trước khi sửa test này:
 *
 * `ReportsService` gọi `customerRepo.createQueryBuilder()` NHIỀU LẦN ĐỘC LẬP
 * (không chỉ qua `.clone()`) trong CÙNG 1 method (vd `getCustomerReport()`
 * tạo mới querybuilder riêng cho personalJoinedQb/departmentJoinedQb/
 * totalJoinedQb, KHÔNG clone từ mainQb) - mock theo "instance cụ thể nào trả
 * về giá trị gì" sẽ cực kỳ dài dòng và dễ vỡ mỗi khi thứ tự gọi trong service
 * đổi nhẹ. Thay vào đó, dùng 2 HÀNG ĐỢI (FIFO) DÙNG CHUNG cho MỌI
 * querybuilder instance (kể cả các instance sinh ra từ `.clone()`):
 * `rawManyQueue`/`rawOneQueue`. Vì code LUÔN `await` tuần tự (không
 * Promise.all), thứ tự `.shift()` ra khỏi hàng đợi CHÍNH XÁC bằng thứ tự
 * các lệnh `await qb.getRawMany()/getRawOne()` xuất hiện trong service -
 * chỉ cần push đúng thứ tự đó vào hàng đợi trước khi gọi service, KHÔNG cần
 * quan tâm instance nào gọi.
 *
 * Mọi lệnh `.setParameters()` và tham số thứ 3 của `.innerJoin()` được gom
 * chung vào `capturedSetParameters`/`capturedInnerJoinParams` (mảng, không
 * phân biệt instance) - dùng để viết test HỒI QUY (regression) riêng cho bug
 * lệch giờ UTC/naive đã sửa (xem reports.service.ts - createdAt/joined_at
 * PHẢI dùng fromUtc/toUtc, closedDate PHẢI dùng from/to naive).
 */
describe('ReportsService', () => {
  let service: ReportsService;

  let rawManyQueue: any[][];
  let rawOneQueue: any[];
  let capturedSetParameters: Record<string, any>[];
  let capturedInnerJoinParams: Record<string, any>[];
  let capturedAndWhere: Array<{ condition: any; params?: any }>;

  function createMockQb(): any {
    const qb: any = {};
    const chainMethods = ['select', 'addSelect', 'where', 'leftJoin', 'groupBy', 'addGroupBy', 'orderBy'];
    chainMethods.forEach((m) => {
      qb[m] = jest.fn(() => qb);
    });
    qb.andWhere = jest.fn((condition: any, params?: any) => {
      capturedAndWhere.push({ condition, params });
      return qb;
    });
    qb.innerJoin = jest.fn((...args: any[]) => {
      // 2 chữ ký khác nhau đang dùng trong service:
      // - innerJoin('customer.deposits', 'deposit')            (revenue - 2 tham số)
      // - innerJoin(EntityClass, 'membership', condStr, params) (customer - 4 tham số)
      if (args.length >= 4) capturedInnerJoinParams.push(args[3]);
      return qb;
    });
    qb.setParameters = jest.fn((params: any) => {
      capturedSetParameters.push(params);
      return qb;
    });
    qb.clone = jest.fn(() => createMockQb());
    qb.getRawMany = jest.fn(() => Promise.resolve(rawManyQueue.shift() ?? []));
    qb.getRawOne = jest.fn(() => Promise.resolve(rawOneQueue.shift() ?? null));
    return qb;
  }

  const mockCustomerRepo = {
    createQueryBuilder: jest.fn(() => createMockQb()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    rawManyQueue = [];
    rawOneQueue = [];
    capturedSetParameters = [];
    capturedInnerJoinParams = [];
    capturedAndWhere = [];
    mockCustomerRepo.createQueryBuilder.mockImplementation(() => createMockQb());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ═══════════════════════ getRevenueReport ═══════════════════════

  describe('getRevenueReport', () => {
    it('ADMIN: có đủ personal + department + total, applyViewFilter được gọi ĐÚNG 1 lần với (viewerId, role)', async () => {
      const spy = jest.spyOn(CustomerAccessHelper, 'applyViewFilter');
      rawManyQueue = [
        [{ userId: '1', userName: 'Sales A', amount: '1500000.00' }], // personal
        [{ departmentId: '2', departmentName: 'Kinh doanh', amount: '3000000.00' }], // department
      ];
      rawOneQueue = [{ total: '5000000.00' }]; // total

      const result = await service.getRevenueReport(
        { period: 'month' } as any,
        99,
        Role.ADMIN,
      );

      expect(spy).toHaveBeenCalledWith(expect.anything(), 99, Role.ADMIN);
      expect(result.personal).toEqual([{ userId: 1, userName: 'Sales A', amount: 1500000 }]);
      expect(result.department).toEqual([
        { departmentId: 2, departmentName: 'Kinh doanh', amount: 3000000 },
      ]);
      expect(result.total).toBe(5000000);
    });

    it('EMPLOYEE: department=null, total=null, personal LUÔN bị ép về đúng selfId (bất kể applyViewFilter cho xem rộng hơn)', async () => {
      rawManyQueue = [[{ userId: '7', userName: 'Tôi', amount: '900000.00' }]];

      const result = await service.getRevenueReport({ period: 'week' } as any, 7, Role.EMPLOYEE);

      expect(result.department).toBeNull();
      expect(result.total).toBeNull();
      expect(result.personal).toEqual([{ userId: 7, userName: 'Tôi', amount: 900000 }]);
      // Xác nhận CÓ andWhere ép salesUserId = selfId (7) - không chỉ dựa vào applyViewFilter
      expect(
        capturedAndWhere.some(
          (c) =>
            typeof c.condition === 'string' &&
            c.condition.includes('customer.salesUserId = :selfId') &&
            c.params?.selfId === 7,
        ),
      ).toBe(true);
    });

    it('MANAGER: có department, KHÔNG có total (ẩn theo đúng bảng phân quyền)', async () => {
      rawManyQueue = [
        [{ userId: '3', userName: 'NV A', amount: '100000.00' }],
        [{ departmentId: '9', departmentName: 'Phòng B', amount: '200000.00' }],
      ];

      const result = await service.getRevenueReport({ period: 'quarter' } as any, 3, Role.MANAGER);

      expect(result.department).not.toBeNull();
      expect(result.total).toBeNull();
    });

    it('amount null/không có dòng nào -> trả 0, không phải null/NaN', async () => {
      rawOneQueue = [{ total: null }];
      rawManyQueue = [[], []];

      const result = await service.getRevenueReport({ period: 'year' } as any, 1, Role.ADMIN);

      expect(result.total).toBe(0);
      expect(result.personal).toEqual([]);
    });
  });

  // ═══════════════════════ getCustomerReport ═══════════════════════

  describe('getCustomerReport - HỒI QUY bug lệch giờ UTC/naive', () => {
    it('createdAt (UTC thật) dùng fromUtc/toUtc; closedDate (date naive) dùng from/to; joined_at (UTC thật) dùng fromUtc/toUtc', async () => {
      // Dựng đúng cùng công thức resolveRange() private dùng, để so khớp
      // TUYỆT ĐỐI với giá trị thật (không hardcode chuỗi ngày thủ công, tránh
      // test tự sai nếu công thức đổi nhẹ nhưng vẫn đúng bản chất).
      const anchor = new Date('2026-08-19T00:00:00');
      const { start, end } = getReportPeriodRange('week', anchor);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
      const expectedFrom = fmt(start);
      const expectedTo = fmt(end);
      const expectedFromUtc = fmt(new Date(start.getTime() - VN_OFFSET_MS));
      const expectedToUtc = fmt(new Date(end.getTime() - VN_OFFSET_MS));

      // EMPLOYEE: chỉ nhánh "Cá nhân" chạy (1 lần buildMainSelect + 1 lần
      // buildJoinedSelect) - đủ để kiểm chứng, không cần dựng cả bảng phòng
      // ban/tổng.
      rawManyQueue = [
        [{ userId: '5', userName: 'Tôi', totalCustomers: '2', closedCustomers: '1' }], // main
        [{ userId: '5', joinedGroupCustomers: '1' }], // joined
      ];

      await service.getCustomerReport(
        { period: 'week', anchor: '2026-08-19' } as any,
        5,
        Role.EMPLOYEE,
      );

      expect(capturedSetParameters).toContainEqual({
        createdFrom: expectedFromUtc,
        createdTo: expectedToUtc,
        closedFrom: expectedFrom,
        closedTo: expectedTo,
      });
      expect(capturedInnerJoinParams).toContainEqual({
        joinedFrom: expectedFromUtc,
        joinedTo: expectedToUtc,
      });
      // Đảm bảo KHÔNG còn sót tham số :from/:to chung chung (bug cũ) lẫn vào
      // createdFrom/createdTo (tức KHÔNG bằng closedFrom/closedTo - 2 cặp
      // phải LỆCH NHAU đúng 7 tiếng vì giờ VN hiện tại không phải 00:00 UTC).
      expect(expectedFromUtc).not.toBe(expectedFrom);
    });
  });

  describe('getCustomerReport - RBAC branching', () => {
    it('ADMIN: có total (Admin/Assistant mới có)', async () => {
      rawManyQueue = [
        [], // personal main
        [], // personal joined
        [], // department main
        [], // department joined
      ];
      rawOneQueue = [
        { totalCustomers: '10', closedCustomers: '4' }, // total main
        { joinedGroupCustomers: '3' }, // total joined
      ];

      const result = await service.getCustomerReport(
        { period: 'month' } as any,
        1,
        Role.ADMIN,
      );

      expect(result.total).toEqual({ totalCustomers: 10, closedCustomers: 4, joinedGroupCustomers: 3 });
    });

    it('EMPLOYEE: department=null, total=null', async () => {
      rawManyQueue = [[], []];

      const result = await service.getCustomerReport(
        { period: 'month' } as any,
        1,
        Role.EMPLOYEE,
      );

      expect(result.department).toBeNull();
      expect(result.total).toBeNull();
    });

    it('EMPLOYEE: personalMainRaw có lẫn userId khác (lý thuyết không nên xảy ra nhưng phòng hờ) -> vẫn bị lọc chỉ còn đúng chính mình', async () => {
      rawManyQueue = [
        [
          { userId: '5', userName: 'Tôi', totalCustomers: '2', closedCustomers: '0' },
          { userId: '99', userName: 'Người khác', totalCustomers: '9', closedCustomers: '9' },
        ],
        [],
      ];

      const result = await service.getCustomerReport(
        { period: 'month' } as any,
        5,
        Role.EMPLOYEE,
      );

      expect(result.personal).toHaveLength(1);
      expect(result.personal[0].userId).toBe(5);
    });
  });

  describe('getCustomerReport - mergeBreakdown (OUTER JOIN theo JS, qua public API)', () => {
    it('user CÓ trong main nhưng KHÔNG có trong joined -> joinedGroupCustomers = 0 (không bị loại khỏi kết quả)', async () => {
      rawManyQueue = [
        [{ userId: '1', userName: 'A', totalCustomers: '5', closedCustomers: '2' }],
        [], // không ai join nhóm trong kỳ
      ];

      const result = await service.getCustomerReport({ period: 'month' } as any, 1, Role.ADMIN);

      expect(result.personal).toEqual([
        { userId: 1, userName: 'A', totalCustomers: 5, closedCustomers: 2, joinedGroupCustomers: 0 },
      ]);
    });

    it('user CÓ trong joined nhưng KHÔNG có trong main (vd data cũ join nhóm trong kỳ dù không tạo/chốt trong kỳ) -> vẫn xuất hiện với totalCustomers/closedCustomers = 0', async () => {
      rawManyQueue = [
        [], // không ai được tạo/chốt trong kỳ
        [{ userId: '2', joinedGroupCustomers: '3' }],
      ];

      const result = await service.getCustomerReport({ period: 'month' } as any, 1, Role.ADMIN);

      expect(result.personal).toEqual([
        { userId: 2, userName: '(Không rõ)', totalCustomers: 0, closedCustomers: 0, joinedGroupCustomers: 3 },
      ]);
    });
  });

  describe('resolveRange (qua tham số anchor/period truyền vào service)', () => {
    it('không truyền anchor -> mặc định dùng NGÀY HIỆN TẠI (giờ VN), không throw, không rơi vào NaN', async () => {
      rawManyQueue = [[], []];

      const result = await service.getCustomerReport({ period: 'month' } as any, 1, Role.EMPLOYEE);

      const now = getNowVn();
      expect(result.period.from.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)).toBe(true);
    });

    it('period=custom thiếu customFrom/customTo -> ném lỗi (không âm thầm trả về range rỗng/sai)', async () => {
      await expect(
        service.getCustomerReport({ period: 'custom' } as any, 1, Role.EMPLOYEE),
      ).rejects.toThrow();
    });
  });
});
