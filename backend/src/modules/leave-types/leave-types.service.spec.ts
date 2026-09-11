import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { LeaveTypesService } from './leave-types.service';
import { LeaveType } from '../../database/entities/leave-type.entity';
import { LeaveRequest } from '../../database/entities/leave-request.entity';

describe('LeaveTypesService', () => {
  let service: LeaveTypesService;

  const mockTransactionManager = {
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockLeaveTypeRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: {
      transaction: jest.fn(async (cb: (manager: typeof mockTransactionManager) => Promise<void>) => {
        await cb(mockTransactionManager);
      }),
    },
  };
  const mockLeaveRequestRepo = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaveTypesService,
        { provide: getRepositoryToken(LeaveType), useValue: mockLeaveTypeRepo },
        { provide: getRepositoryToken(LeaveRequest), useValue: mockLeaveRequestRepo },
      ],
    }).compile();

    service = module.get<LeaveTypesService>(LeaveTypesService);
  });

  describe('findAll', () => {
    it('trả về [] ngay, không query đếm nếu chưa có loại phép nào', async () => {
      mockLeaveTypeRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(mockLeaveRequestRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('lấy tất cả loại phép kèm inUseCount, sắp theo sortOrder', async () => {
      mockLeaveTypeRepo.find.mockResolvedValue([
        { id: 1, code: 'annual' },
        { id: 2, code: 'meet_client' },
      ]);
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ leaveType: 'annual', count: '4' }]),
      };
      mockLeaveRequestRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll();

      expect(mockLeaveTypeRepo.find).toHaveBeenCalledWith({
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      expect(result).toEqual([
        { id: 1, code: 'annual', inUseCount: 4 },
        { id: 2, code: 'meet_client', inUseCount: 0 },
      ]);
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('trả về loại phép nếu tìm thấy', async () => {
      const type = { id: 1, code: 'annual', name: 'Phép năm' };
      mockLeaveTypeRepo.findOne.mockResolvedValue(type);

      const result = await service.findOne(1);

      expect(result).toEqual(type);
    });
  });

  describe('getByCode', () => {
    it('trả về null nếu code không tồn tại', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue(null);

      const result = await service.getByCode('khong_ton_tai');

      expect(result).toBeNull();
    });
  });

  describe('assertExists', () => {
    it('ném BadRequestException nếu code không tồn tại', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue(null);

      await expect(service.assertExists('khong_ton_tai')).rejects.toThrow(BadRequestException);
    });

    it('trả về loại phép nếu code tồn tại', async () => {
      const type = { id: 1, code: 'annual', name: 'Phép năm' };
      mockLeaveTypeRepo.findOne.mockResolvedValue(type);

      const result = await service.assertExists('annual');

      expect(result).toEqual(type);
    });
  });

  describe('create', () => {
    it('tạo loại phép mới thành công khi code chưa tồn tại', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue(null);
      mockLeaveTypeRepo.create.mockReturnValue({ code: 'meet_client', name: 'Gặp khách' });
      mockLeaveTypeRepo.save.mockResolvedValue({ id: 8, code: 'meet_client', name: 'Gặp khách' });

      const result = await service.create({ code: 'meet_client', name: 'Gặp khách' });

      expect(mockLeaveTypeRepo.create).toHaveBeenCalledWith({
        code: 'meet_client',
        name: 'Gặp khách',
        description: null,
        isSystem: false,
        color: '#1890ff',
        isPaid: true,
        deductsAnnualBalance: false,
        sortOrder: 0,
      });
      expect(result).toEqual({ id: 8, code: 'meet_client', name: 'Gặp khách' });
    });

    it('ném ConflictException nếu code đã tồn tại', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue({ id: 1, code: 'annual' });

      await expect(service.create({ code: 'annual', name: 'X' })).rejects.toThrow(ConflictException);
      expect(mockLeaveTypeRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu loại phép không tồn tại', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('cho phép đổi tên/màu/isPaid mà không đổi code', async () => {
      const type = {
        id: 1,
        code: 'annual',
        name: 'Phép năm',
        color: '#1890ff',
        isPaid: true,
        deductsAnnualBalance: true,
        sortOrder: 0,
      };
      mockLeaveTypeRepo.findOne.mockResolvedValue(type);
      mockLeaveTypeRepo.save.mockImplementation((t) => Promise.resolve(t));

      const result = await service.update(1, { name: 'Phép năm mới', color: '#52c41a', isPaid: false });

      expect(result.name).toBe('Phép năm mới');
      expect(result.color).toBe('#52c41a');
      expect(result.isPaid).toBe(false);
      expect(result.code).toBe('annual');
    });
  });

  describe('remove', () => {
    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });

    it('ném BadRequestException nếu là loại phép hệ thống', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue({ id: 1, code: 'annual', name: 'Phép năm', isSystem: true });

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockTransactionManager.remove).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu đang có đơn dùng mà KHÔNG truyền fallbackCode', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue({
        id: 2,
        code: 'meet_client',
        name: 'Gặp khách',
        isSystem: false,
      });
      mockLeaveRequestRepo.count.mockResolvedValue(3);

      await expect(service.remove(2)).rejects.toThrow(BadRequestException);
      expect(mockTransactionManager.remove).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu fallbackCode trùng với code đang xoá', async () => {
      mockLeaveTypeRepo.findOne.mockResolvedValue({
        id: 2,
        code: 'meet_client',
        name: 'Gặp khách',
        isSystem: false,
      });
      mockLeaveRequestRepo.count.mockResolvedValue(3);

      await expect(service.remove(2, 'meet_client')).rejects.toThrow(BadRequestException);
      expect(mockTransactionManager.remove).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu fallbackCode không tồn tại', async () => {
      mockLeaveTypeRepo.findOne
        .mockResolvedValueOnce({ id: 2, code: 'meet_client', name: 'Gặp khách', isSystem: false }) // findOne(id)
        .mockResolvedValueOnce(null); // tìm fallback theo code
      mockLeaveRequestRepo.count.mockResolvedValue(3);

      await expect(service.remove(2, 'khong_ton_tai')).rejects.toThrow(BadRequestException);
      expect(mockTransactionManager.remove).not.toHaveBeenCalled();
    });

    it('xoá thành công khi loại phép tuỳ chỉnh KHÔNG có đơn nào dùng (không cần fallback)', async () => {
      const type = { id: 2, code: 'meet_client', name: 'Gặp khách', isSystem: false };
      mockLeaveTypeRepo.findOne.mockResolvedValue(type);
      mockLeaveRequestRepo.count.mockResolvedValue(0);

      const result = await service.remove(2);

      expect(mockLeaveRequestRepo.count).toHaveBeenCalledWith({ where: { leaveType: 'meet_client' } });
      expect(mockTransactionManager.update).not.toHaveBeenCalled();
      expect(mockTransactionManager.remove).toHaveBeenCalledWith(LeaveType, type);
      expect(result).toEqual({ deleted: true, reassignedCount: 0 });
    });

    it('chuyển đơn nghỉ phép sang fallbackCode rồi xoá khi đang có đơn dùng', async () => {
      const type = { id: 2, code: 'meet_client', name: 'Gặp khách', isSystem: false };
      const fallbackType = { id: 1, code: 'annual', name: 'Phép năm', isSystem: true };
      mockLeaveTypeRepo.findOne
        .mockResolvedValueOnce(type) // findOne(id)
        .mockResolvedValueOnce(fallbackType); // tìm fallback theo code
      mockLeaveRequestRepo.count.mockResolvedValue(5);

      const result = await service.remove(2, 'annual');

      expect(mockTransactionManager.update).toHaveBeenCalledWith(
        LeaveRequest,
        { leaveType: 'meet_client' },
        { leaveType: 'annual' },
      );
      expect(mockTransactionManager.remove).toHaveBeenCalledWith(LeaveType, type);
      expect(result).toEqual({ deleted: true, reassignedCount: 5 });
    });
  });
});
