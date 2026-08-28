import { Brackets } from 'typeorm';
import { CustomerAccessHelper } from './customer-access.helper';
import { Role } from '../../../common/enums/role.enum';

/**
 * QueryBuilder giả lập tối thiểu - chỉ implement đúng những method
 * applyViewFilter() thực sự gọi (.andWhere), ghi lại mọi lệnh gọi để assert.
 * Trả về chính nó (fluent chain) giống QueryBuilder thật của TypeORM.
 */
function makeFakeQueryBuilder() {
  const calls: { sqlOrBrackets: any; params?: any }[] = [];
  const qb: any = {
    andWhere: jest.fn((sqlOrBrackets: any, params?: any) => {
      calls.push({ sqlOrBrackets, params });
      return qb;
    }),
  };
  return { qb, calls };
}

/**
 * Với nhánh EMPLOYEE, applyViewFilter() gói điều kiện trong 1 `new
 * Brackets(cb)` rồi truyền cho .andWhere(). Muốn assert ĐÚNG nội dung bên
 * trong bracket (where/orWhere/orWhere), phải tự chạy `cb` với 1 "qb con"
 * giả lập khác rồi xem nó bị gọi thế nào - .whereFactory là property công
 * khai của TypeORM's Brackets (xem node_modules/typeorm/query-builder/Brackets.js).
 */
function extractBracketCalls(bracket: Brackets) {
  const innerCalls: { method: 'where' | 'orWhere'; sql: string; params?: any }[] = [];
  const innerQb: any = {
    where: jest.fn((sql: string, params?: any) => {
      innerCalls.push({ method: 'where', sql, params });
      return innerQb;
    }),
    orWhere: jest.fn((sql: string, params?: any) => {
      innerCalls.push({ method: 'orWhere', sql, params });
      return innerQb;
    }),
  };
  bracket.whereFactory(innerQb);
  return innerCalls;
}

describe('CustomerAccessHelper', () => {
  describe('applyViewFilter', () => {
    it('ADMIN: không áp thêm bất kỳ điều kiện lọc nào (xem tất cả)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      const result = CustomerAccessHelper.applyViewFilter(qb, 1, Role.ADMIN);

      expect(calls).toHaveLength(0);
      expect(result).toBe(qb); // vẫn trả về đúng instance (fluent chain nguyên vẹn)
    });

    it('ASSISTANT: không áp thêm bất kỳ điều kiện lọc nào (xem tất cả, bất chấp phòng ban)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      CustomerAccessHelper.applyViewFilter(qb, 1, Role.ASSISTANT);

      expect(calls).toHaveLength(0);
    });

    it('MANAGER: lọc theo department mà manager_user_id = chính mình', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      CustomerAccessHelper.applyViewFilter(qb, 42, Role.MANAGER);

      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toContain('department_id IN');
      expect(calls[0].sqlOrBrackets).toContain('manager_user_id = :accessManagerId');
      expect(calls[0].params).toEqual({ accessManagerId: 42 });
    });

    it('EMPLOYEE: lọc theo (createdById = mình) OR (salesUserId = mình) OR (đang có assignment active)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      CustomerAccessHelper.applyViewFilter(qb, 7, Role.EMPLOYEE);

      expect(calls).toHaveLength(1);
      const bracket = calls[0].sqlOrBrackets as Brackets;
      expect(bracket).toBeInstanceOf(Brackets);

      const inner = extractBracketCalls(bracket);
      expect(inner).toHaveLength(3);

      expect(inner[0].method).toBe('where');
      expect(inner[0].sql).toContain('createdById = :accessUserId');
      expect(inner[0].params).toEqual({ accessUserId: 7 });

      expect(inner[1].method).toBe('orWhere');
      expect(inner[1].sql).toContain('salesUserId = :accessUserId');

      expect(inner[2].method).toBe('orWhere');
      expect(inner[2].sql).toContain('customer_assignments');
      expect(inner[2].sql).toContain("status = :accessStatus");
      expect(inner[2].params).toEqual({ accessUserId: 7, accessStatus: 'active' });
    });

    it('role lạ/không xác định (không phải 3 role trên) -> rơi vào nhánh EMPLOYEE (phòng thủ mặc định chặt nhất)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      CustomerAccessHelper.applyViewFilter(qb, 7, 'some_unknown_role');

      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toBeInstanceOf(Brackets);
    });
  });

  describe('canDelete', () => {
    it('ADMIN -> true', () => {
      expect(CustomerAccessHelper.canDelete({} as any, 1, Role.ADMIN)).toBe(true);
    });

    it('ASSISTANT -> false (chỉ Admin được xoá)', () => {
      expect(CustomerAccessHelper.canDelete({} as any, 1, Role.ASSISTANT)).toBe(false);
    });

    it('MANAGER -> false, kể cả khi khách hàng thuộc phòng ban mình quản lý', () => {
      const customer: any = { departmentId: 5 };
      expect(CustomerAccessHelper.canDelete(customer, 1, Role.MANAGER)).toBe(false);
    });

    it('EMPLOYEE -> false, KỂ CẢ khi chính họ là người tạo ra bản ghi (không còn ngoại lệ "chủ sở hữu tự xoá")', () => {
      const customer: any = { createdById: 1 };
      expect(CustomerAccessHelper.canDelete(customer, 1, Role.EMPLOYEE)).toBe(false);
    });
  });

  describe('canManageCustomer', () => {
    it('ADMIN/ASSISTANT -> luôn true bất kể dữ liệu customer', () => {
      expect(CustomerAccessHelper.canManageCustomer({} as any, 1, Role.ADMIN)).toBe(true);
      expect(CustomerAccessHelper.canManageCustomer({} as any, 1, Role.ASSISTANT)).toBe(true);
    });

    it('MANAGER -> true nếu departmentId của customer nằm trong managerDepartmentIds truyền vào', () => {
      const customer: any = { departmentId: 5 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, Role.MANAGER, [3, 5, 8])).toBe(true);
    });

    it('MANAGER -> false nếu departmentId của customer KHÔNG nằm trong managerDepartmentIds', () => {
      const customer: any = { departmentId: 99 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, Role.MANAGER, [3, 5, 8])).toBe(false);
    });

    it('MANAGER -> false nếu customer chưa có departmentId (null)', () => {
      const customer: any = { departmentId: null };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, Role.MANAGER, [3, 5, 8])).toBe(false);
    });

    it('MANAGER -> false nếu không truyền managerDepartmentIds (mặc định mảng rỗng - phòng thủ, không vô tình cấp quyền)', () => {
      const customer: any = { departmentId: 5 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, Role.MANAGER)).toBe(false);
    });

    it('EMPLOYEE -> true nếu là người tạo (createdById)', () => {
      const customer: any = { createdById: 7, salesUserId: 99 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 7, Role.EMPLOYEE)).toBe(true);
    });

    it('EMPLOYEE -> true nếu là sales chính (salesUserId)', () => {
      const customer: any = { createdById: 99, salesUserId: 7 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 7, Role.EMPLOYEE)).toBe(true);
    });

    it('EMPLOYEE -> false nếu không phải người tạo và không phải sales chính', () => {
      const customer: any = { createdById: 99, salesUserId: 98 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 7, Role.EMPLOYEE)).toBe(false);
    });
  });
});
