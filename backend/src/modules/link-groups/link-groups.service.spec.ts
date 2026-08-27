import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { LinkGroupsService } from './link-groups.service';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { User } from '../../database/entities/user.entity';

describe('LinkGroupsService', () => {
  let service: LinkGroupsService;

  const mockGroupRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockCategoryRepo = {
    findOne: jest.fn(),
  };
  const mockMembershipRepo = {
    count: jest.fn(),
  };
  const mockUserRepo = {
    findOneBy: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkGroupsService,
        { provide: getRepositoryToken(LinkGroup), useValue: mockGroupRepo },
        { provide: getRepositoryToken(LinkCategory), useValue: mockCategoryRepo },
        { provide: getRepositoryToken(CustomerGroupMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<LinkGroupsService>(LinkGroupsService);
  });

  describe('findAll', () => {
    it('không truyền filter -> lấy TẤT CẢ group, kèm relation category + quản lý chính/phụ, sắp theo sortOrder', async () => {
      mockGroupRepo.find.mockResolvedValue([{ id: 1, name: 'Nhóm A' }]);

      const result = await service.findAll();

      expect(mockGroupRepo.find).toHaveBeenCalledWith({
        where: {},
        relations: ['category', 'primaryManager', 'secondaryManagers', 'secondaryManagers.user'],
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      expect(result).toEqual([{ id: 1, name: 'Nhóm A' }]);
    });

    it('lọc theo categoryId khi có truyền', async () => {
      mockGroupRepo.find.mockResolvedValue([]);

      await service.findAll(2);

      expect(mockGroupRepo.find).toHaveBeenCalledWith({
        where: { categoryId: 2 },
        relations: ['category', 'primaryManager', 'secondaryManagers', 'secondaryManagers.user'],
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
    });

    it('activeOnly=true -> chỉ lấy group đang active', async () => {
      mockGroupRepo.find.mockResolvedValue([]);

      await service.findAll(undefined, true);

      expect(mockGroupRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        relations: ['category', 'primaryManager', 'secondaryManagers', 'secondaryManagers.user'],
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
    });

    it('kết hợp cả categoryId và activeOnly', async () => {
      mockGroupRepo.find.mockResolvedValue([]);

      await service.findAll(2, true);

      expect(mockGroupRepo.find).toHaveBeenCalledWith({
        where: { categoryId: 2, isActive: true },
        relations: ['category', 'primaryManager', 'secondaryManagers', 'secondaryManagers.user'],
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
    });
  });

  describe('create', () => {
    it('tạo group mới thành công khi category tồn tại và tên chưa trùng trong category đó', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo' });
      mockGroupRepo.findOne.mockResolvedValue(null);
      mockGroupRepo.create.mockReturnValue({
        categoryId: 1, name: 'Nhóm Sales HN', url: 'https://zalo.me/g/abc', sortOrder: 0, primaryManagerId: null,
      });
      mockGroupRepo.save.mockResolvedValue({
        id: 10, categoryId: 1, name: 'Nhóm Sales HN', url: 'https://zalo.me/g/abc', sortOrder: 0, primaryManagerId: null,
      });

      const result = await service.create({ categoryId: 1, name: 'Nhóm Sales HN', url: 'https://zalo.me/g/abc' });

      expect(mockGroupRepo.create).toHaveBeenCalledWith({
        categoryId: 1, name: 'Nhóm Sales HN', url: 'https://zalo.me/g/abc', sortOrder: 0, primaryManagerId: null,
      });
      expect(result.id).toBe(10);
    });

    it('ném NotFoundException nếu categoryId không tồn tại', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ categoryId: 999, name: 'X', url: 'https://x.com' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockGroupRepo.save).not.toHaveBeenCalled();
    });

    it('ném ConflictException nếu tên nhóm đã tồn tại TRONG CÙNG category', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo' });
      mockGroupRepo.findOne.mockResolvedValue({ id: 5, categoryId: 1, name: 'Nhóm Sales HN' });

      await expect(
        service.create({ categoryId: 1, name: 'Nhóm Sales HN', url: 'https://zalo.me/g/xyz' }),
      ).rejects.toThrow(ConflictException);
      expect(mockGroupRepo.save).not.toHaveBeenCalled();
    });

    it('tạo group kèm primaryManagerId hợp lệ - có validate user tồn tại + active', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo' });
      mockGroupRepo.findOne.mockResolvedValue(null);
      mockUserRepo.findOneBy.mockResolvedValue({ id: 7, isActive: true });
      mockGroupRepo.create.mockImplementation((v) => v);
      mockGroupRepo.save.mockImplementation((g) => Promise.resolve({ id: 10, ...g }));

      const result = await service.create({
        categoryId: 1, name: 'Nhóm Sales HN', url: 'https://zalo.me/g/abc', primaryManagerId: 7,
      });

      expect(mockUserRepo.findOneBy).toHaveBeenCalledWith({ id: 7, isActive: true });
      expect(result.primaryManagerId).toBe(7);
    });

    it('ném BadRequestException nếu primaryManagerId không tồn tại/đã khoá', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo' });
      mockGroupRepo.findOne.mockResolvedValue(null);
      mockUserRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.create({ categoryId: 1, name: 'X', url: 'https://x.com', primaryManagerId: 999 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockGroupRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu group không tồn tại', async () => {
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('ném ConflictException nếu đổi tên trùng với nhóm khác TRONG CÙNG category', async () => {
      mockGroupRepo.findOne
        .mockResolvedValueOnce({ id: 1, categoryId: 1, name: 'Nhóm A', url: 'https://a.com' }) // group cần sửa
        .mockResolvedValueOnce({ id: 2, categoryId: 1, name: 'Nhóm B' }); // trùng tên mới

      await expect(service.update(1, { name: 'Nhóm B' })).rejects.toThrow(ConflictException);
    });

    it('cho phép đổi url mà không cần đổi tên', async () => {
      const group = { id: 1, categoryId: 1, name: 'Nhóm A', url: 'https://old.com', sortOrder: 0 };
      mockGroupRepo.findOne.mockResolvedValue(group);
      mockGroupRepo.save.mockImplementation((g) => Promise.resolve(g));

      const result = await service.update(1, { url: 'https://new.com' });

      expect(result.url).toBe('https://new.com');
      expect(result.name).toBe('Nhóm A');
    });

    it('gán primaryManagerId hợp lệ - có validate user tồn tại + active', async () => {
      const group = { id: 1, categoryId: 1, name: 'Nhóm A', url: 'https://a.com', sortOrder: 0, primaryManagerId: null };
      mockGroupRepo.findOne.mockResolvedValue(group);
      mockUserRepo.findOneBy.mockResolvedValue({ id: 7, isActive: true });
      mockGroupRepo.save.mockImplementation((g) => Promise.resolve(g));

      const result = await service.update(1, { primaryManagerId: 7 });

      expect(mockUserRepo.findOneBy).toHaveBeenCalledWith({ id: 7, isActive: true });
      expect(result.primaryManagerId).toBe(7);
    });

    it('cho phép bỏ gán primaryManagerId bằng null - KHÔNG cần validate user', async () => {
      const group = { id: 1, categoryId: 1, name: 'Nhóm A', url: 'https://a.com', sortOrder: 0, primaryManagerId: 7 };
      mockGroupRepo.findOne.mockResolvedValue(group);
      mockGroupRepo.save.mockImplementation((g) => Promise.resolve(g));

      const result = await service.update(1, { primaryManagerId: null });

      expect(mockUserRepo.findOneBy).not.toHaveBeenCalled();
      expect(result.primaryManagerId).toBeNull();
    });

    it('ném BadRequestException nếu primaryManagerId mới không tồn tại/đã khoá', async () => {
      const group = { id: 1, categoryId: 1, name: 'Nhóm A', url: 'https://a.com', sortOrder: 0, primaryManagerId: null };
      mockGroupRepo.findOne.mockResolvedValue(group);
      mockUserRepo.findOneBy.mockResolvedValue(null);

      await expect(service.update(1, { primaryManagerId: 999 })).rejects.toThrow(BadRequestException);
      expect(mockGroupRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('setActive', () => {
    it('ẩn nhóm (isActive=false) thành công', async () => {
      const group = { id: 1, name: 'Nhóm A', isActive: true };
      mockGroupRepo.findOne.mockResolvedValue(group);
      mockGroupRepo.save.mockImplementation((g) => Promise.resolve(g));

      const result = await service.setActive(1, false);

      expect(result.isActive).toBe(false);
    });

    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.setActive(999, false)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('xoá thành công khi KHÔNG có customer nào có dữ liệu join gắn với nhóm này', async () => {
      mockGroupRepo.findOne.mockResolvedValue({ id: 1, name: 'Nhóm A' });
      mockMembershipRepo.count.mockResolvedValue(0);

      const result = await service.remove(1);

      expect(mockMembershipRepo.count).toHaveBeenCalledWith({ where: { groupId: 1 } });
      expect(mockGroupRepo.remove).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('ném BadRequestException nếu đang có membership gắn với nhóm này (gợi ý Ẩn thay vì Xoá)', async () => {
      mockGroupRepo.findOne.mockResolvedValue({ id: 1, name: 'Nhóm A' });
      mockMembershipRepo.count.mockResolvedValue(7);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockGroupRepo.remove).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockGroupRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});