import { UsersAccessHelper } from './users-access.helper';
import { Role } from '../../../common/enums/role.enum';
import { PermissionScope } from '../../../database/entities/role-permission.entity';

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

describe('UsersAccessHelper', () => {
  describe('applyViewFilter', () => {
    it('ADMIN -> không áp dụng filter', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, Role.ADMIN, 'all');
      expect(calls).toHaveLength(0);
    });

    it('custom role + PermissionScope.ALL -> không áp dụng filter', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, 'custom_role', PermissionScope.ALL);
      expect(calls).toHaveLength(0);
    });

    it('custom role + PermissionScope.DEPARTMENT -> lọc theo department_managers', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(calls).toHaveLength(1);
      // ⚠️ MỚI: đọc từ bảng nhiều-nhiều department_managers (thay cho cột
      // đơn department.manager_user_id cũ) - xem users-access.helper.ts.
      expect(calls[0].sqlOrBrackets).toContain('department_managers');
      expect(calls[0].sqlOrBrackets).toContain('user.department_id IN');
    });

    it('custom role + không có scope -> chỉ thấy bản thân (own)', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, 'custom_role', null);
      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toContain('user.id = :accessUserId');
    });

    it('MANAGER + không có scope -> KHÔNG còn fallback cứng theo role, chỉ thấy bản thân (own) - hoàn toàn theo scope từ role_permissions', () => {
    // ⚠️ Đổi ý nghĩa so với bản cũ: code hiện tại đã bỏ hẳn nhánh
    // hardcode Role.MANAGER, hành vi CHỈ phụ thuộc `scope` truyền vào -
    // scope=null (dù role là Manager) rơi vào nhánh "own" cuối cùng.
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, Role.MANAGER, null);
      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toContain('user.id = :accessUserId');
    });

    it('MANAGER + scope=department -> lọc theo department_managers (scope đúng mới kích hoạt filter)', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, Role.MANAGER, PermissionScope.DEPARTMENT);
      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toContain('department_managers');
    });
  });

  describe('canManageUser', () => {
    let departmentManagerRepoMock: any;
    let departmentRepoMock: any;

    beforeEach(() => {
      departmentManagerRepoMock = {
        findOne: jest.fn(),
      };
      departmentRepoMock = {
        // ⚠️ MỚI: canManageUser() lấy DepartmentManagerRepository qua
        // `departmentRepo.manager.getRepository(DepartmentManager)` (đúng
        // pattern dùng chung trong toàn bộ codebase để không cần sửa
        // constructor/module ở call site) - xem users-access.helper.ts.
        manager: {
          getRepository: jest.fn(() => departmentManagerRepoMock),
        },
      };
    });

    it('ADMIN -> true', async () => {
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, Role.ADMIN);
      expect(result).toBe(true);
    });

    it('custom role + PermissionScope.ALL -> true', async () => {
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, 'custom_role', PermissionScope.ALL);
      expect(result).toBe(true);
    });

    it('custom role + PermissionScope.DEPARTMENT -> tự quản lý chính mình', async () => {
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 1, 5, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(result).toBe(true);
      expect(departmentManagerRepoMock.findOne).not.toHaveBeenCalled();
    });

    it('custom role + PermissionScope.DEPARTMENT -> kiểm tra department_managers', async () => {
      departmentManagerRepoMock.findOne.mockResolvedValue({ departmentId: 5, userId: 1 });
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(result).toBe(true);
      expect(departmentManagerRepoMock.findOne).toHaveBeenCalledWith({
        where: { departmentId: 5, userId: 1 },
      });
    });

    it('PermissionScope.DEPARTMENT nhưng không phải manager của đúng phòng ban đó -> false', async () => {
      departmentManagerRepoMock.findOne.mockResolvedValue(null);
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(result).toBe(false);
    });

    it('custom role + không có scope -> chỉ sửa được chính mình', async () => {
      const result1 = await UsersAccessHelper.canManageUser(departmentRepoMock, 1, 5, 1, 'custom_role', null);
      const result2 = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, 'custom_role', null);
      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('MANAGER + không có scope -> KHÔNG còn fallback cứng theo role, chỉ sửa được chính mình', async () => {
    // ⚠️ Đổi ý nghĩa so với bản cũ (từng test "backward-compat" giả định
    // Role.MANAGER luôn có quyền theo phòng ban dù thiếu scope) - code
    // hiện tại hoàn toàn theo `scope`, không còn đọc Role.MANAGER đặc biệt.
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, Role.MANAGER, null);
      expect(result).toBe(false);
      expect(departmentManagerRepoMock.findOne).not.toHaveBeenCalled();
    });

    it('MANAGER + scope=department -> kiểm tra department_managers đúng như custom role', async () => {
      departmentManagerRepoMock.findOne.mockResolvedValue({ departmentId: 5, userId: 1 });
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, Role.MANAGER, PermissionScope.DEPARTMENT);
      expect(result).toBe(true);
      expect(departmentManagerRepoMock.findOne).toHaveBeenCalledWith({
        where: { departmentId: 5, userId: 1 },
      });
    });
  });

  describe('getManagedDepartmentIds', () => {
    it('trả về danh sách departmentId từ bảng department_managers (có thể nhiều hơn 1)', async () => {
      const departmentManagerRepoMock = {
        find: jest.fn().mockResolvedValue([
          { departmentId: 1 },
          { departmentId: 3 },
        ]),
      };
      const departmentRepoMock = {
        manager: { getRepository: jest.fn(() => departmentManagerRepoMock) },
      };

      const result = await UsersAccessHelper.getManagedDepartmentIds(departmentRepoMock as any, 1);

      expect(result).toEqual([1, 3]);
      expect(departmentManagerRepoMock.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        select: ['departmentId'],
      });
    });
  });
});