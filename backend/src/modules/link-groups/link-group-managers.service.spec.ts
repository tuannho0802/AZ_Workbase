import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { LinkGroupManagersService } from './link-group-managers.service';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { LinkGroupSecondaryManager } from '../../database/entities/link-group-secondary-manager.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';

describe('LinkGroupManagersService', () => {
  let service: LinkGroupManagersService;

  const mockGroupRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const mockSecondaryRepo = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockUserRepo = {
    findOneBy: jest.fn(),
  };

  // Helper dựng nhanh 1 "user" giả để nhét vào relation primaryManager/user
  const fakeUser = (id: number, name = `User ${id}`) => ({
    id,
    name,
    email: `user${id}@az.vn`,
    role: Role.EMPLOYEE,
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkGroupManagersService,
        { provide: getRepositoryToken(LinkGroup), useValue: mockGroupRepo },
        { provide: getRepositoryToken(LinkGroupSecondaryManager), useValue: mockSecondaryRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<LinkGroupManagersService>(LinkGroupManagersService);
  });

  describe('listManagedByMe', () => {
    it('admin -> lấy TẤT CẢ group (không lọc theo primary/secondary), sắp theo sortOrder', async () => {
      mockGroupRepo.find.mockResolvedValue([
        { id: 1, name: 'Nhóm A', sortOrder: 0, primaryManager: null, secondaryManagers: [] },
      ]);

      const result = await service.listManagedByMe(999, Role.ADMIN);

      expect(mockGroupRepo.find).toHaveBeenCalledWith({
        relations: ['primaryManager', 'secondaryManagers', 'secondaryManagers.user', 'category'],
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      // Admin không đụng tới secondaryRepo.find (không cần tra bảng phụ)
      expect(mockSecondaryRepo.find).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe(1);
    });

    it('user thường là Quản lý CHÍNH của 1 nhóm -> chỉ thấy nhóm đó', async () => {
      const group = {
        id: 5,
        name: 'Nhóm Zalo HN',
        sortOrder: 0,
        primaryManagerId: 7,
        primaryManager: fakeUser(7),
        secondaryManagers: [],
      };
      mockGroupRepo.find.mockResolvedValue([group]); // asPrimary
      mockSecondaryRepo.find.mockResolvedValue([]); // asSecondary rỗng

      const result = await service.listManagedByMe(7, Role.EMPLOYEE);

      expect(mockGroupRepo.find).toHaveBeenCalledWith({
        where: { primaryManagerId: 7 },
        relations: ['primaryManager', 'secondaryManagers', 'secondaryManagers.user', 'category'],
      });
      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe(5);
    });

    it('user thường là Quản lý PHỤ của 1 nhóm (không phải chính bất kỳ nhóm nào) -> chỉ thấy nhóm đó', async () => {
      mockGroupRepo.find.mockResolvedValue([]); // asPrimary rỗng
      const group = {
        id: 8,
        name: 'Nhóm FB SG',
        sortOrder: 1,
        primaryManagerId: 3,
        primaryManager: fakeUser(3),
        secondaryManagers: [{ userId: 9, user: fakeUser(9), createdAt: new Date() }],
      };
      mockSecondaryRepo.find.mockResolvedValue([{ group }]);

      const result = await service.listManagedByMe(9, Role.EMPLOYEE);

      expect(mockSecondaryRepo.find).toHaveBeenCalledWith({
        where: { userId: 9 },
        relations: [
          'group',
          'group.primaryManager',
          'group.secondaryManagers',
          'group.secondaryManagers.user',
          'group.category',
        ],
      });
      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe(8);
    });

    it('user vừa là chính (nhóm A) vừa là phụ (nhóm B) -> gộp cả 2, không trùng lặp', async () => {
      const groupA = {
        id: 1,
        name: 'Nhóm A',
        sortOrder: 0,
        primaryManagerId: 4,
        primaryManager: fakeUser(4),
        secondaryManagers: [],
      };
      const groupB = {
        id: 2,
        name: 'Nhóm B',
        sortOrder: 1,
        primaryManagerId: 1,
        primaryManager: fakeUser(1),
        secondaryManagers: [{ userId: 4, user: fakeUser(4), createdAt: new Date() }],
      };
      mockGroupRepo.find.mockResolvedValue([groupA]); // asPrimary
      mockSecondaryRepo.find.mockResolvedValue([{ group: groupB }]); // asSecondary

      const result = await service.listManagedByMe(4, Role.EMPLOYEE);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.groupId).sort()).toEqual([1, 2]);
    });

    it('user vừa được gán chính VÀ vẫn còn sót trong bảng phụ của CÙNG 1 nhóm -> loại trùng, chỉ trả về 1 lần', async () => {
      const group = {
        id: 5,
        name: 'Nhóm Zalo HN',
        sortOrder: 0,
        primaryManagerId: 7,
        primaryManager: fakeUser(7),
        secondaryManagers: [{ userId: 7, user: fakeUser(7), createdAt: new Date() }],
      };
      mockGroupRepo.find.mockResolvedValue([group]); // asPrimary
      mockSecondaryRepo.find.mockResolvedValue([{ group }]); // asSecondary - cùng group id=5

      const result = await service.listManagedByMe(7, Role.EMPLOYEE);

      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe(5);
    });

    it('user không phải chính/phụ của nhóm nào -> mảng rỗng', async () => {
      mockGroupRepo.find.mockResolvedValue([]);
      mockSecondaryRepo.find.mockResolvedValue([]);

      const result = await service.listManagedByMe(999, Role.EMPLOYEE);

      expect(result).toEqual([]);
    });
  });

  describe('getManagers', () => {
    it('admin xem được managers của bất kỳ nhóm nào', async () => {
      mockGroupRepo.findOne.mockResolvedValue({
        id: 1,
        name: 'Nhóm A',
        primaryManagerId: 5,
        primaryManager: fakeUser(5),
        secondaryManagers: [],
      });

      const result = await service.getManagers(1, 999, Role.ADMIN);

      expect(result.groupId).toBe(1);
      expect(result.primaryManager?.id).toBe(5);
    });

    it('Quản lý chính xem được managers của nhóm mình', async () => {
      mockGroupRepo.findOne.mockResolvedValue({
        id: 1,
        name: 'Nhóm A',
        primaryManagerId: 5,
        primaryManager: fakeUser(5),
        secondaryManagers: [],
      });

      const result = await service.getManagers(1, 5, Role.EMPLOYEE);

      expect(result.groupId).toBe(1);
    });

    it('Quản lý phụ xem được managers của nhóm mình', async () => {
      mockGroupRepo.findOne.mockResolvedValue({
        id: 1,
        name: 'Nhóm A',
        primaryManagerId: 5,
        primaryManager: fakeUser(5),
        secondaryManagers: [{ userId: 9, user: fakeUser(9), createdAt: new Date() }],
      });

      const result = await service.getManagers(1, 9, Role.EMPLOYEE);

      expect(result.secondaryManagers).toHaveLength(1);
      expect(result.secondaryManagers[0].id).toBe(9);
    });

    it('ném ForbiddenException nếu user không liên quan gì tới nhóm (không chính, không phụ)', async () => {
      mockGroupRepo.findOne.mockResolvedValue({
        id: 1,
        name: 'Nhóm A',
        primaryManagerId: 5,
        primaryManager: fakeUser(5),
        secondaryManagers: [],
      });

      await expect(service.getManagers(1, 11, Role.EMPLOYEE)).rejects.toThrow(ForbiddenException);
    });

    it('ném NotFoundException nếu group không tồn tại', async () => {
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.getManagers(999, 1, Role.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('kết quả lọc bỏ secondary manager có relation user null (phòng thủ dữ liệu mồ côi)', async () => {
      mockGroupRepo.findOne.mockResolvedValue({
        id: 1,
        name: 'Nhóm A',
        primaryManagerId: 5,
        primaryManager: fakeUser(5),
        secondaryManagers: [
          { userId: 9, user: fakeUser(9), createdAt: new Date() },
          { userId: 10, user: null, createdAt: new Date() },
        ],
      });

      const result = await service.getManagers(1, 5, Role.EMPLOYEE);

      expect(result.secondaryManagers).toHaveLength(1);
      expect(result.secondaryManagers[0].id).toBe(9);
    });
  });

  describe('addSecondaryManager', () => {
    const baseGroup = () => ({
      id: 1,
      name: 'Nhóm A',
      primaryManagerId: 5,
      primaryManager: fakeUser(5),
      secondaryManagers: [],
    });

    it('Quản lý chính thêm thành công 1 quản lý phụ mới', async () => {
      const group = baseGroup();
      mockGroupRepo.findOne
        .mockResolvedValueOnce(group) // load trong addSecondaryManager
        .mockResolvedValueOnce({ ...group, secondaryManagers: [{ userId: 9, user: fakeUser(9), createdAt: new Date() }] }); // load lại trong getManagers cuối
      mockUserRepo.findOneBy.mockResolvedValue({ id: 9, isActive: true });
      mockSecondaryRepo.create.mockReturnValue({ groupId: 1, userId: 9, addedById: 5 });
      mockSecondaryRepo.save.mockResolvedValue({ id: 100, groupId: 1, userId: 9, addedById: 5 });

      const result = await service.addSecondaryManager(1, 9, 5, Role.EMPLOYEE);

      expect(mockUserRepo.findOneBy).toHaveBeenCalledWith({ id: 9, isActive: true });
      expect(mockSecondaryRepo.create).toHaveBeenCalledWith({ groupId: 1, userId: 9, addedById: 5 });
      expect(mockSecondaryRepo.save).toHaveBeenCalled();
      expect(result.secondaryManagers).toHaveLength(1);
      expect(result.secondaryManagers[0].id).toBe(9);
    });

    it('admin cũng thêm được quản lý phụ (không cần là chính)', async () => {
      const group = baseGroup();
      mockGroupRepo.findOne.mockResolvedValueOnce(group).mockResolvedValueOnce(group);
      mockUserRepo.findOneBy.mockResolvedValue({ id: 9, isActive: true });
      mockSecondaryRepo.create.mockReturnValue({ groupId: 1, userId: 9, addedById: 999 });
      mockSecondaryRepo.save.mockResolvedValue({ id: 100 });

      await service.addSecondaryManager(1, 9, 999, Role.ADMIN);

      expect(mockSecondaryRepo.create).toHaveBeenCalledWith({ groupId: 1, userId: 9, addedById: 999 });
    });

    it('ném ForbiddenException nếu requester không phải admin và không phải Quản lý chính của nhóm (kể cả đang là phụ)', async () => {
      const group = {
        ...baseGroup(),
        secondaryManagers: [{ userId: 9, user: fakeUser(9), createdAt: new Date() }],
      };
      mockGroupRepo.findOne.mockResolvedValue(group);

      // userId=9 hiện đang là quản lý PHỤ - không được quyền tự thêm phụ khác
      await expect(service.addSecondaryManager(1, 12, 9, Role.EMPLOYEE)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockSecondaryRepo.save).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu người được thêm đang là Quản lý chính của chính nhóm đó', async () => {
      const group = baseGroup(); // primaryManagerId=5
      mockGroupRepo.findOne.mockResolvedValue(group);

      await expect(service.addSecondaryManager(1, 5, 5, Role.EMPLOYEE)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSecondaryRepo.save).not.toHaveBeenCalled();
    });

    it('ném ConflictException nếu người này đã là Quản lý phụ rồi', async () => {
      const group = {
        ...baseGroup(),
        secondaryManagers: [{ userId: 9, user: fakeUser(9), createdAt: new Date() }],
      };
      mockGroupRepo.findOne.mockResolvedValue(group);

      await expect(service.addSecondaryManager(1, 9, 5, Role.EMPLOYEE)).rejects.toThrow(
        ConflictException,
      );
      expect(mockSecondaryRepo.save).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu user được thêm không tồn tại hoặc đã bị khoá', async () => {
      const group = baseGroup();
      mockGroupRepo.findOne.mockResolvedValue(group);
      mockUserRepo.findOneBy.mockResolvedValue(null);

      await expect(service.addSecondaryManager(1, 999, 5, Role.EMPLOYEE)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSecondaryRepo.save).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu group không tồn tại', async () => {
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.addSecondaryManager(999, 9, 5, Role.EMPLOYEE)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeSecondaryManager', () => {
    const groupWithSecondary = () => ({
      id: 1,
      name: 'Nhóm A',
      primaryManagerId: 5,
      primaryManager: fakeUser(5),
      secondaryManagers: [{ userId: 9, user: fakeUser(9), createdAt: new Date() }],
    });

    it('Quản lý chính gỡ thành công 1 quản lý phụ', async () => {
      const group = groupWithSecondary();
      const existing = group.secondaryManagers[0];
      mockGroupRepo.findOne
        .mockResolvedValueOnce(group) // load trong removeSecondaryManager
        .mockResolvedValueOnce({ ...group, secondaryManagers: [] }); // load lại trong getManagers cuối
      mockSecondaryRepo.remove.mockResolvedValue(existing);

      const result = await service.removeSecondaryManager(1, 9, 5, Role.EMPLOYEE);

      expect(mockSecondaryRepo.remove).toHaveBeenCalledWith(existing);
      expect(result.secondaryManagers).toHaveLength(0);
    });

    it('admin cũng gỡ được quản lý phụ (không cần là chính)', async () => {
      const group = groupWithSecondary();
      mockGroupRepo.findOne.mockResolvedValueOnce(group).mockResolvedValueOnce({ ...group, secondaryManagers: [] });
      mockSecondaryRepo.remove.mockResolvedValue(group.secondaryManagers[0]);

      await service.removeSecondaryManager(1, 9, 999, Role.ADMIN);

      expect(mockSecondaryRepo.remove).toHaveBeenCalled();
    });

    it('ném ForbiddenException nếu requester không phải admin/Quản lý chính (kể cả đang là chính quản lý phụ bị gỡ)', async () => {
      const group = groupWithSecondary();
      mockGroupRepo.findOne.mockResolvedValue(group);

      // user 9 (chính người đang là phụ) không có quyền tự gỡ chính mình khỏi vai trò phụ
      await expect(service.removeSecondaryManager(1, 9, 9, Role.EMPLOYEE)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockSecondaryRepo.remove).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu người cần gỡ không phải Quản lý phụ của nhóm', async () => {
      const group = groupWithSecondary();
      mockGroupRepo.findOne.mockResolvedValue(group);

      await expect(service.removeSecondaryManager(1, 123, 5, Role.EMPLOYEE)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockSecondaryRepo.remove).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu group không tồn tại', async () => {
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.removeSecondaryManager(999, 9, 5, Role.EMPLOYEE)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
