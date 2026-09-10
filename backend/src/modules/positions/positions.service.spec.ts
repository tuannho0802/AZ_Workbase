import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PositionsService } from './positions.service';
import { Position } from '../../database/entities/position.entity';
import { User } from '../../database/entities/user.entity';

describe('PositionsService', () => {
  let service: PositionsService;

  const mockPositionRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockUserRepo = {
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PositionsService,
        { provide: getRepositoryToken(Position), useValue: mockPositionRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<PositionsService>(PositionsService);
  });

  describe('findOne', () => {
    it('báo lỗi NotFoundException nếu không tìm thấy vị trí', async () => {
      mockPositionRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('trả về vị trí kèm department relation nếu tìm thấy', async () => {
      mockPositionRepo.findOne.mockResolvedValue({ id: 1, code: 'content', name: 'Content' });
      const res = await service.findOne(1);
      expect(res).toEqual({ id: 1, code: 'content', name: 'Content' });
      expect(mockPositionRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['department'],
      });
    });
  });

  describe('create', () => {
    it('báo lỗi ConflictException nếu code đã tồn tại', async () => {
      mockPositionRepo.findOne.mockResolvedValue({ id: 1, code: 'content' });
      await expect(
        service.create({ code: 'content', name: 'Content' }),
      ).rejects.toThrow(ConflictException);
    });

    it('tạo thành công, departmentId chỉ mang tính gợi ý (không bắt buộc)', async () => {
      mockPositionRepo.findOne.mockResolvedValue(null);
      mockPositionRepo.create.mockImplementation((data) => data);
      mockPositionRepo.save.mockImplementation((data) => Promise.resolve({ id: 1, ...data }));

      const res = await service.create({ code: 'hr', name: 'HR' });

      expect(res).toEqual(
        expect.objectContaining({ code: 'hr', name: 'HR', departmentId: null, isSystem: false }),
      );
    });
  });

  describe('update', () => {
    it('không cho sửa `code` (chỉ nhận field khác qua DTO)', async () => {
      mockPositionRepo.findOne.mockResolvedValue({
        id: 1,
        code: 'content',
        name: 'Content',
        description: null,
        departmentId: null,
      });
      mockPositionRepo.save.mockImplementation((data) => Promise.resolve(data));

      const res = await service.update(1, { name: 'Content Staff' });

      expect(res.name).toBe('Content Staff');
      expect(res.code).toBe('content'); // không đổi
    });
  });

  describe('remove', () => {
    it('chặn xoá nếu là vị trí hệ thống (isSystem=true)', async () => {
      mockPositionRepo.findOne.mockResolvedValue({ id: 1, name: 'Content', isSystem: true });
      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockUserRepo.count).not.toHaveBeenCalled();
    });

    it('chặn xoá nếu đang có nhân viên gán vị trí này (KHÔNG dựa vào FK ON DELETE SET NULL để âm thầm mất override)', async () => {
      mockPositionRepo.findOne.mockResolvedValue({ id: 1, name: 'Content', isSystem: false });
      mockUserRepo.count.mockResolvedValue(3);

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockPositionRepo.delete).not.toHaveBeenCalled();
    });

    it('xoá thành công nếu không có nhân viên nào đang gán', async () => {
      mockPositionRepo.findOne.mockResolvedValue({ id: 1, name: 'Content', isSystem: false });
      mockUserRepo.count.mockResolvedValue(0);

      const res = await service.remove(1);

      expect(res).toEqual({ deleted: true });
      expect(mockPositionRepo.delete).toHaveBeenCalledWith(1);
    });
  });
});
