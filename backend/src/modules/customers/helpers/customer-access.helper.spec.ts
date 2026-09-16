import { Brackets } from 'typeorm';
import { CustomerAccessHelper } from './customer-access.helper';
import { Role } from '../../../common/enums/role.enum';
import { PermissionScope } from '../../../database/entities/role-permission.entity';

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

      const result = CustomerAccessHelper.applyViewFilter(qb, 1, Role.ADMIN, 'all');

      expect(calls).toHaveLength(0);
      expect(result).toBe(qb); // vẫn trả về đúng instance (fluent chain nguyên vẹn)
    });

    it('ASSISTANT: không áp thêm bất kỳ điều kiện lọc nào (xem tất cả, bất chấp phòng ban)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      CustomerAccessHelper.applyViewFilter(qb, 1, Role.ASSISTANT, 'all');

      expect(calls).toHaveLength(0);
    });

    /**
     * ⚠️ FIX BUG THẬT (báo lỗi trực tiếp từ người dùng kèm ảnh chụp màn
     * hình): scope='department' giờ là SUPERSET của 'own' - gói trong 1
     * Brackets với 5 điều kiện OR (department_id IN managed depts, cộng 4
     * điều kiện own giống hệt nhánh 'own' bên dưới), KHÔNG còn là 1 chuỗi
     * SQL đơn lẻ như trước. Test cập nhật để assert đúng cấu trúc Brackets
     * mới, đồng thời khẳng định rõ vế "own" vẫn còn trong đó.
     */
    it('MANAGER: scope=department -> lọc theo (phòng ban mình quản lý) OR (chính mình là người tạo/sales/marketing/đang được gán) - department là superset của own', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      CustomerAccessHelper.applyViewFilter(qb, 42, Role.MANAGER, 'department');

      expect(calls).toHaveLength(1);
      const bracket = calls[0].sqlOrBrackets as Brackets;
      expect(bracket).toBeInstanceOf(Brackets);

      const inner = extractBracketCalls(bracket);
      expect(inner).toHaveLength(5);

      expect(inner[0].method).toBe('where');
      expect(inner[0].sql).toContain('department_id IN');
      expect(inner[0].sql).toContain(
        'SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :accessManagerId',
      );
      expect(inner[0].params).toEqual({ accessManagerId: 42 });

      expect(inner[1].method).toBe('orWhere');
      expect(inner[1].sql).toContain('createdById = :accessUserId');
      expect(inner[1].params).toEqual({ accessUserId: 42 });

      expect(inner[2].method).toBe('orWhere');
      expect(inner[2].sql).toContain('salesUserId = :accessUserId');

      expect(inner[3].method).toBe('orWhere');
      expect(inner[3].sql).toContain('marketingUserId = :accessUserId');

      expect(inner[4].method).toBe('orWhere');
      expect(inner[4].sql).toContain('customer_assignments');
      expect(inner[4].params).toEqual({ accessUserId: 42, accessStatus: 'active' });
    });

    it('EMPLOYEE: lọc theo (createdById = mình) OR (salesUserId = mình) OR (marketingUserId = mình) OR (đang có assignment active)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      CustomerAccessHelper.applyViewFilter(qb, 7, Role.EMPLOYEE);

      expect(calls).toHaveLength(1);
      const bracket = calls[0].sqlOrBrackets as Brackets;
      expect(bracket).toBeInstanceOf(Brackets);

      const inner = extractBracketCalls(bracket);
      expect(inner).toHaveLength(4);

      expect(inner[0].method).toBe('where');
      expect(inner[0].sql).toContain('createdById = :accessUserId');
      expect(inner[0].params).toEqual({ accessUserId: 7 });

      expect(inner[1].method).toBe('orWhere');
      expect(inner[1].sql).toContain('salesUserId = :accessUserId');

      expect(inner[2].method).toBe('orWhere');
      expect(inner[2].sql).toContain('marketingUserId = :accessUserId');
      expect(inner[2].params).toEqual({ accessUserId: 7 });

      expect(inner[3].method).toBe('orWhere');
      expect(inner[3].sql).toContain('customer_assignments');
      expect(inner[3].sql).toContain("status = :accessStatus");
      expect(inner[3].params).toEqual({ accessUserId: 7, accessStatus: 'active' });
    });

    it('role lạ/không xác định (không phải 3 role trên) -> rơi vào nhánh EMPLOYEE (phòng thủ mặc định chặt nhất)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      CustomerAccessHelper.applyViewFilter(qb, 7, 'some_unknown_role');

      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toBeInstanceOf(Brackets);
    });

    it('custom role + PermissionScope.DEPARTMENT -> lọc theo department (chuẩn mới), vẫn là superset của own', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      CustomerAccessHelper.applyViewFilter(qb, 42, 'custom_manager', PermissionScope.DEPARTMENT);
      expect(calls).toHaveLength(1);
      const bracket = calls[0].sqlOrBrackets as Brackets;
      expect(bracket).toBeInstanceOf(Brackets);
      const inner = extractBracketCalls(bracket);
      expect(inner).toHaveLength(5);
      expect(inner[0].sql).toContain('department_id IN');
    });

    it('custom role + không có scope -> rơi vào nhánh sở hữu (own)', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      CustomerAccessHelper.applyViewFilter(qb, 42, 'custom_manager', null);
      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toBeInstanceOf(Brackets);
    });

    it('MANAGER + không có scope -> KHÔNG còn fallback cứng theo Role, rơi vào nhánh sở hữu (own) giống mọi role khác (hoàn toàn theo scope từ role_permissions)', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      CustomerAccessHelper.applyViewFilter(qb, 42, Role.MANAGER, null);
      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toBeInstanceOf(Brackets);
    });
  });

  describe('canManageCustomer', () => {
    it('ADMIN/ASSISTANT -> luôn true bất kể dữ liệu customer', () => {
      expect(CustomerAccessHelper.canManageCustomer({} as any, 1, Role.ADMIN)).toBe(true);
      expect(CustomerAccessHelper.canManageCustomer({} as any, 1, Role.ASSISTANT, [], 'all')).toBe(true);
    });

    it('MANAGER -> true nếu departmentId của customer nằm trong managerDepartmentIds truyền vào', () => {
      const customer: any = { departmentId: 5 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, Role.MANAGER, [3, 5, 8], 'department')).toBe(true);
    });

    it('MANAGER -> false nếu departmentId của customer KHÔNG nằm trong managerDepartmentIds', () => {
      const customer: any = { departmentId: 99 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, Role.MANAGER, [3, 5, 8], 'department')).toBe(false);
    });

    it('MANAGER -> false nếu customer chưa có departmentId (null)', () => {
      const customer: any = { departmentId: null };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, Role.MANAGER, [3, 5, 8], 'department')).toBe(false);
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

    it('EMPLOYEE -> true nếu là Marketing phụ trách (marketingUserId)', () => {
      const customer: any = { createdById: 99, salesUserId: 98, marketingUserId: 7 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 7, Role.EMPLOYEE)).toBe(true);
    });

    it('EMPLOYEE -> false nếu không phải người tạo, không phải sales chính, không phải marketing phụ trách', () => {
      const customer: any = { createdById: 99, salesUserId: 98, marketingUserId: 97 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 7, Role.EMPLOYEE)).toBe(false);
    });

    it('custom role + PermissionScope.DEPARTMENT -> kiểm tra theo department (chuẩn mới)', () => {
      const customer: any = { departmentId: 5 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, 'custom_manager', [5], PermissionScope.DEPARTMENT)).toBe(true);
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, 'custom_manager', [99], PermissionScope.DEPARTMENT)).toBe(false);
    });

    /**
     * ⚠️ FIX BUG THẬT (đúng kịch bản người dùng báo, ảnh chụp màn hình):
     * Assistant (scope='department') tự tạo 1 khách hàng KHÔNG thuộc phòng
     * ban mình quản lý (hoặc chưa gán phòng ban, departmentId=null) - vẫn
     * phải quản lý (sửa/xoá mềm) được chính bản ghi mình tạo, vì
     * scope='department' là superset của 'own', không phải tập tách biệt.
     */
    it('scope=department -> vẫn true nếu KHÔNG thuộc phòng ban mình quản lý nhưng chính mình là người tạo/sales/marketing (department là superset của own)', () => {
      const outsideDeptButCreatedByMe: any = { departmentId: 99, createdById: 1 };
      expect(
        CustomerAccessHelper.canManageCustomer(outsideDeptButCreatedByMe, 1, 'custom_manager', [5], PermissionScope.DEPARTMENT),
      ).toBe(true);

      const noDeptButImSales: any = { departmentId: null, salesUserId: 1 };
      expect(
        CustomerAccessHelper.canManageCustomer(noDeptButImSales, 1, Role.MANAGER, [5], PermissionScope.DEPARTMENT),
      ).toBe(true);

      const unrelatedCustomer: any = { departmentId: 99, createdById: 2, salesUserId: 3, marketingUserId: 4 };
      expect(
        CustomerAccessHelper.canManageCustomer(unrelatedCustomer, 1, 'custom_manager', [5], PermissionScope.DEPARTMENT),
      ).toBe(false);
    });

    it('custom role + không có scope -> kiểm tra nhánh sở hữu (own)', () => {
      const customer1: any = { createdById: 1 };
      const customer2: any = { createdById: 99 };
      expect(CustomerAccessHelper.canManageCustomer(customer1, 1, 'custom_manager', [], null)).toBe(true);
      expect(CustomerAccessHelper.canManageCustomer(customer2, 1, 'custom_manager', [], null)).toBe(false);
    });

    it('MANAGER + không có scope -> KHÔNG còn fallback cứng theo Role, kiểm tra theo nhánh sở hữu (own) giống mọi role khác', () => {
      const customer: any = { departmentId: 5, createdById: 99, salesUserId: 98, marketingUserId: 97 };
      expect(CustomerAccessHelper.canManageCustomer(customer, 1, Role.MANAGER, [5], null)).toBe(false);
      const ownedCustomer: any = { departmentId: 5, createdById: 1 };
      expect(CustomerAccessHelper.canManageCustomer(ownedCustomer, 1, Role.MANAGER, [5], null)).toBe(true);
    });
  });
});