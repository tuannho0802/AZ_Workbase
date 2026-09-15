import { PeriodicTaskAccessHelper } from './periodic-task-access.helper';
import { Role } from '../../../common/enums/role.enum';
import { PermissionScope } from '../../../database/entities/role-permission.entity';

/**
 * QueryBuilder giả lập tối thiểu - chỉ implement đúng .andWhere() mà
 * applyViewFilter() thực sự gọi, ghi lại mọi lệnh gọi để assert. Mirror
 * `customer-access.helper.spec.ts`.
 */
function makeFakeQueryBuilder() {
  const calls: { sql: any; params?: any }[] = [];
  const qb: any = {
    andWhere: jest.fn((sql: any, params?: any) => {
      calls.push({ sql, params });
      return qb;
    }),
  };
  return { qb, calls };
}

describe('PeriodicTaskAccessHelper', () => {
  describe('applyViewFilter', () => {
    it('ADMIN: không áp thêm bất kỳ điều kiện lọc nào (xem tất cả)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      const result = PeriodicTaskAccessHelper.applyViewFilter(
        qb,
        1,
        Role.ADMIN,
        'all',
      );

      expect(calls).toHaveLength(0);
      expect(result).toBe(qb);
    });

    it('scope=all (kể cả role tuỳ chỉnh): không áp thêm điều kiện lọc nào', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      PeriodicTaskAccessHelper.applyViewFilter(
        qb,
        1,
        'custom_manager',
        PermissionScope.ALL,
      );

      expect(calls).toHaveLength(0);
    });

    it('scope=department: lọc theo phòng ban có dòng department_managers cho chính mình', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      PeriodicTaskAccessHelper.applyViewFilter(
        qb,
        42,
        Role.MANAGER,
        PermissionScope.DEPARTMENT,
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain('task.department_id IN');
      expect(calls[0].sql).toContain(
        'SELECT dm.department_id FROM department_managers dm WHERE dm.user_id = :accessManagerId',
      );
      expect(calls[0].params).toEqual({ accessManagerId: 42 });
    });

    it('scope=own (EMPLOYEE): lọc theo (createdById = mình) OR (primaryAssigneeId = mình) OR (Phụ trách PHỤ = mình)', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      PeriodicTaskAccessHelper.applyViewFilter(
        qb,
        7,
        Role.EMPLOYEE,
        PermissionScope.OWN,
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain('task.createdById = :accessUserId');
      expect(calls[0].sql).toContain('task.primaryAssigneeId = :accessUserId');
      // Regression test cho bug đã sửa (2026-09-15): scope `own` PHẢI bao gồm cả Phụ trách PHỤ
      // (periodic_task_secondary_assignees), không chỉ createdById/primaryAssigneeId.
      expect(calls[0].sql).toContain(
        'task.id IN (SELECT psa.task_id FROM periodic_task_secondary_assignees psa WHERE psa.user_id = :accessUserId)',
      );
      expect(calls[0].params).toEqual({ accessUserId: 7 });
    });

    it('không có scope/scope lạ: rơi vào nhánh sở hữu (own) - phòng thủ mặc định chặt nhất', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      PeriodicTaskAccessHelper.applyViewFilter(qb, 7, 'some_unknown_role');

      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain('task.createdById = :accessUserId');
    });

    it('MANAGER + không có scope -> KHÔNG fallback cứng theo Role, rơi vào nhánh own giống mọi role khác', () => {
      const { qb, calls } = makeFakeQueryBuilder();

      PeriodicTaskAccessHelper.applyViewFilter(qb, 42, Role.MANAGER, null);

      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain('task.createdById = :accessUserId');
    });
  });

  describe('canDelete', () => {
    it('ADMIN -> true', () => {
      expect(PeriodicTaskAccessHelper.canDelete({} as any, 1, Role.ADMIN)).toBe(
        true,
      );
    });

    it('ASSISTANT -> false (chỉ Admin được xoá)', () => {
      expect(
        PeriodicTaskAccessHelper.canDelete({} as any, 1, Role.ASSISTANT),
      ).toBe(false);
    });

    it('EMPLOYEE -> false, KỂ CẢ khi chính họ là người tạo/phụ trách chính', () => {
      const task: any = { createdById: 1, primaryAssigneeId: 1 };
      expect(PeriodicTaskAccessHelper.canDelete(task, 1, Role.EMPLOYEE)).toBe(
        false,
      );
    });
  });

  describe('canManageTask', () => {
    it('ADMIN -> luôn true bất kể dữ liệu task', () => {
      expect(
        PeriodicTaskAccessHelper.canManageTask({} as any, 1, Role.ADMIN),
      ).toBe(true);
    });

    it('scope=all -> luôn true bất kể dữ liệu task', () => {
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          {} as any,
          1,
          'custom_manager',
          [],
          'all',
        ),
      ).toBe(true);
    });

    it('scope=department -> true nếu departmentId của task nằm trong managerDepartmentIds truyền vào', () => {
      const task: any = { departmentId: 5 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          task,
          1,
          Role.MANAGER,
          [3, 5, 8],
          'department',
        ),
      ).toBe(true);
    });

    it('scope=department -> false nếu departmentId KHÔNG nằm trong managerDepartmentIds', () => {
      const task: any = { departmentId: 99 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          task,
          1,
          Role.MANAGER,
          [3, 5, 8],
          'department',
        ),
      ).toBe(false);
    });

    it('scope=department -> false nếu task chưa có departmentId (null)', () => {
      const task: any = { departmentId: null };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          task,
          1,
          Role.MANAGER,
          [3, 5, 8],
          'department',
        ),
      ).toBe(false);
    });

    it('scope=department -> false nếu không truyền managerDepartmentIds (mặc định rỗng - phòng thủ)', () => {
      const task: any = { departmentId: 5 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          task,
          1,
          Role.MANAGER,
          undefined as any,
          'department',
        ),
      ).toBe(false);
    });

    it('own -> true nếu là người tạo (createdById)', () => {
      const task: any = { createdById: 7, primaryAssigneeId: 99 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(task, 7, Role.EMPLOYEE),
      ).toBe(true);
    });

    it('own -> true nếu là phụ trách chính (primaryAssigneeId)', () => {
      const task: any = { createdById: 99, primaryAssigneeId: 7 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(task, 7, Role.EMPLOYEE),
      ).toBe(true);
    });

    it('own -> false nếu không phải người tạo, không phải phụ trách chính, không phải phụ trách phụ', () => {
      const task: any = { createdById: 99, primaryAssigneeId: 98 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(task, 7, Role.EMPLOYEE),
      ).toBe(false);
    });

    // Regression test cho bug đã sửa (2026-09-15): nhánh `own` PHẢI tính cả Phụ trách PHỤ.
    it('own -> true nếu là Phụ trách PHỤ (secondaryAssigneeUserIds có chứa userId)', () => {
      const task: any = { createdById: 99, primaryAssigneeId: 98 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          task,
          7,
          Role.EMPLOYEE,
          [],
          undefined,
          [3, 7, 10],
        ),
      ).toBe(true);
    });

    it('own -> false nếu KHÔNG có trong secondaryAssigneeUserIds (không tự ý cho true)', () => {
      const task: any = { createdById: 99, primaryAssigneeId: 98 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          task,
          7,
          Role.EMPLOYEE,
          [],
          undefined,
          [3, 10],
        ),
      ).toBe(false);
    });

    it('own -> mặc định secondaryAssigneeUserIds rỗng nếu không truyền (phòng thủ, không throw)', () => {
      const task: any = { createdById: 99, primaryAssigneeId: 98 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          task,
          7,
          Role.EMPLOYEE,
          [],
          null,
        ),
      ).toBe(false);
    });

    it('MANAGER + không có scope -> KHÔNG fallback cứng theo Role, kiểm tra theo nhánh own giống mọi role khác', () => {
      const task: any = {
        departmentId: 5,
        createdById: 99,
        primaryAssigneeId: 98,
      };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          task,
          1,
          Role.MANAGER,
          [5],
          null,
        ),
      ).toBe(false);
      const ownedTask: any = { departmentId: 5, createdById: 1 };
      expect(
        PeriodicTaskAccessHelper.canManageTask(
          ownedTask,
          1,
          Role.MANAGER,
          [5],
          null,
        ),
      ).toBe(true);
    });
  });
});