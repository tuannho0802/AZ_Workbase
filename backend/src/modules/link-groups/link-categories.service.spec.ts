import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { LinkCategoriesService } from './link-categories.service';
import { LinkCategory } from '../../database/entities/link-category.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';

describe('LinkCategoriesService', () => {
  let service: LinkCategoriesService;

  const mockCategoryRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockGroupRepo = {
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinkCategoriesService,
        { provide: getRepositoryToken(LinkCategory), useValue: mockCategoryRepo },
        { provide: getRepositoryToken(LinkGroup), useValue: mockGroupRepo },
      ],
    }).compile();

    service = module.get<LinkCategoriesService>(LinkCategoriesService);
  });

  describe('findAll', () => {
    it('activeOnly=false -> lấy TẤT CẢ category (kể cả đã khoá), sắp theo sortOrder', async () => {
      mockCategoryRepo.find.mockResolvedValue([{ id: 1, name: 'Zalo' }]);

      const result = await service.findAll(false);

      expect(mockCategoryRepo.find).toHaveBeenCalledWith({
        where: {},
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      expect(result).toEqual([{ id: 1, name: 'Zalo' }]);
    });

    it('activeOnly=true -> chỉ lấy category CHƯA khoá (isLocked: false)', async () => {
      mockCategoryRepo.find.mockResolvedValue([]);

      await service.findAll(true);

      expect(mockCategoryRepo.find).toHaveBeenCalledWith({
        where: { isLocked: false },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
    });
  });

  describe('create', () => {
    it('tạo category mới thành công khi tên chưa tồn tại', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);
      mockCategoryRepo.create.mockReturnValue({ name: 'Threads', color: '#1677ff', sortOrder: 0 });
      mockCategoryRepo.save.mockResolvedValue({ id: 5, name: 'Threads', color: '#1677ff', sortOrder: 0 });

      const result = await service.create({ name: 'Threads' });

      expect(mockCategoryRepo.create).toHaveBeenCalledWith({ name: 'Threads', color: '#1677ff', sortOrder: 0 });
      expect(result).toEqual({ id: 5, name: 'Threads', color: '#1677ff', sortOrder: 0 });
    });

    it('cho phép truyền màu tuỳ chỉnh khi tạo', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);
      mockCategoryRepo.create.mockReturnValue({ name: 'Zalo', color: '#0068FF', sortOrder: 0 });
      mockCategoryRepo.save.mockResolvedValue({ id: 1, name: 'Zalo', color: '#0068FF', sortOrder: 0 });

      await service.create({ name: 'Zalo', color: '#0068FF' });

      expect(mockCategoryRepo.create).toHaveBeenCalledWith({ name: 'Zalo', color: '#0068FF', sortOrder: 0 });
    });

    it('ném ConflictException nếu tên category đã tồn tại', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo' });

      await expect(service.create({ name: 'Zalo' })).rejects.toThrow(ConflictException);
      expect(mockCategoryRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu category không tồn tại', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('ném ConflictException nếu đổi tên trùng với category khác đã có', async () => {
      mockCategoryRepo.findOne
        .mockResolvedValueOnce({ id: 1, name: 'Zalo' }) // tìm category cần sửa
        .mockResolvedValueOnce({ id: 2, name: 'Threads' }); // tìm trùng tên mới

      await expect(service.update(1, { name: 'Threads' })).rejects.toThrow(ConflictException);
    });

    it('cho phép đổi màu/sortOrder mà không cần đổi tên', async () => {
      const category = { id: 1, name: 'Zalo', color: '#0068FF', sortOrder: 0 };
      mockCategoryRepo.findOne.mockResolvedValue(category);
      mockCategoryRepo.save.mockImplementation((c) => Promise.resolve(c));

      const result = await service.update(1, { color: '#ff0000', sortOrder: 3 });

      expect(result.color).toBe('#ff0000');
      expect(result.sortOrder).toBe(3);
      expect(result.name).toBe('Zalo');
    });
  });

  describe('setLocked', () => {
    it('khoá category thành công', async () => {
      const category = { id: 1, name: 'Zalo', isLocked: false };
      mockCategoryRepo.findOne.mockResolvedValue(category);
      mockCategoryRepo.save.mockImplementation((c) => Promise.resolve(c));

      const result = await service.setLocked(1, true);

      expect(result.isLocked).toBe(true);
    });

    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(service.setLocked(999, true)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('xoá thành công khi KHÔNG có group nào thuộc category này', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo' });
      mockGroupRepo.count.mockResolvedValue(0);

      const result = await service.remove(1);

      expect(mockGroupRepo.count).toHaveBeenCalledWith({ where: { categoryId: 1 } });
      expect(mockCategoryRepo.remove).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('ném BadRequestException nếu đang có group thuộc category này (gợi ý Khoá thay vì Xoá)', async () => {
      mockCategoryRepo.findOne.mockResolvedValue({ id: 1, name: 'Zalo' });
      mockGroupRepo.count.mockResolvedValue(3);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockCategoryRepo.remove).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
