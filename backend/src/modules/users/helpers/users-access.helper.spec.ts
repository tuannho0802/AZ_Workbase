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
    it('ADMIN -> không áp d?ng filter', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, Role.ADMIN, 'all');
      expect(calls).toHaveLength(0);
    });

    it('custom role + PermissionScope.ALL -> không áp d?ng filter', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, 'custom_role', PermissionScope.ALL);
      expect(calls).toHaveLength(0);
    });

    it('custom role + PermissionScope.DEPARTMENT -> l?c theo phòng ban', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toContain('department_id IN');
    });

    it('custom role + không có scope -> ch? th?y b?n thân (own)', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, 'custom_role', null);
      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toContain('user.id = :accessUserId');
    });

    it('backward-compat: MANAGER + không có scope -> l?c theo phòng ban', () => {
      const { qb, calls } = makeFakeQueryBuilder();
      UsersAccessHelper.applyViewFilter(qb, 1, Role.MANAGER, null);
      expect(calls).toHaveLength(1);
      expect(calls[0].sqlOrBrackets).toContain('department_id IN');
    });
  });

  describe('canManageUser', () => {
    let departmentRepoMock: any;

    beforeEach(() => {
      departmentRepoMock = {
        findOne: jest.fn(),
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

    it('custom role + PermissionScope.DEPARTMENT -> t? qu?n lý chính mình', async () => {
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 1, 5, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(result).toBe(true);
      expect(departmentRepoMock.findOne).not.toHaveBeenCalled();
    });

    it('custom role + PermissionScope.DEPARTMENT -> ki?m tra repo', async () => {
      departmentRepoMock.findOne.mockResolvedValue({ id: 5 });
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, 'custom_role', PermissionScope.DEPARTMENT);
      expect(result).toBe(true);
      expect(departmentRepoMock.findOne).toHaveBeenCalledWith({ where: { id: 5, managerUserId: 1 } });
    });

    it('custom role + không có scope -> ch? s?a du?c chính mình', async () => {
      const result1 = await UsersAccessHelper.canManageUser(departmentRepoMock, 1, 5, 1, 'custom_role', null);
      const result2 = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, 'custom_role', null);
      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('backward-compat: MANAGER + không có scope -> ki?m tra repo', async () => {
      departmentRepoMock.findOne.mockResolvedValue({ id: 5 });
      const result = await UsersAccessHelper.canManageUser(departmentRepoMock, 2, 5, 1, Role.MANAGER, null);
      expect(result).toBe(true);
      expect(departmentRepoMock.findOne).toHaveBeenCalledWith({ where: { id: 5, managerUserId: 1 } });
    });
  });
});
