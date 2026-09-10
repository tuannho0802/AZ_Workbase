import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { AssignmentGroupsService } from './assignment-groups.service';
import { AssignmentGroupConfig } from '../../database/entities/assignment-group-config.entity';
import { AssignmentGroupConfigDepartment } from '../../database/entities/assignment-group-config-department.entity';
import { AssignmentGroupConfigPosition } from '../../database/entities/assignment-group-config-position.entity';
import { User } from '../../database/entities/user.entity';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';

describe('AssignmentGroupsService', () => {
  let service: AssignmentGroupsService;

  const mockConfigRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockDeptRepo = {
    find: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockPosRepo = {
    find: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const mockUserRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentGroupsService,
        { provide: getRepositoryToken(AssignmentGroupConfig), useValue: mockConfigRepo },
        { provide: getRepositoryToken(AssignmentGroupConfigDepartment), useValue: mockDeptRepo },
        { provide: getRepositoryToken(AssignmentGroupConfigPosition), useValue: mockPosRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<AssignmentGroupsService>(AssignmentGroupsService);
  });

  describe('findOne', () => {
    it('báo lỗi NotFoundException nếu không tìm thấy config', async () => {
      mockConfigRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('báo lỗi ConflictException nếu key đã tồn tại', async () => {
      mockConfigRepo.findOne.mockResolvedValue({ id: 1, key: 'sales' });
      await expect(
        service.create({ key: 'sales', name: 'Sales', departmentIds: [1] }),
      ).rejects.toThrow(ConflictException);
    });

    it('tạo config mới + replace departments/positions', async () => {
      mockConfigRepo.findOne
        .mockResolvedValueOnce(null) // check trùng key
        .mockResolvedValueOnce({ id: 5, key: 'content_staff' }); // findOne() cuối cùng để trả về
      mockConfigRepo.save.mockResolvedValue({ id: 5, key: 'content_staff' });

      await service.create({ key: 'content_staff', name: 'Content', departmentIds: [2], positionIds: [3] });

      expect(mockDeptRepo.delete).toHaveBeenCalledWith({ configId: 5 });
      expect(mockDeptRepo.save).toHaveBeenCalledWith([{ configId: 5, departmentId: 2 }]);
      expect(mockPosRepo.delete).toHaveBeenCalledWith({ configId: 5 });
      expect(mockPosRepo.save).toHaveBeenCalledWith([{ configId: 5, positionId: 3 }]);
    });
  });

  describe('remove', () => {
    it('báo lỗi BadRequestException nếu config là hệ thống (is_system=true)', async () => {
      mockConfigRepo.findOne.mockResolvedValue({ id: 1, key: 'sales', isSystem: true });
      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockConfigRepo.delete).not.toHaveBeenCalled();
    });

    it('xoá được config không phải hệ thống', async () => {
      mockConfigRepo.findOne.mockResolvedValue({ id: 9, key: 'custom', isSystem: false });
      const result = await service.remove(9);
      expect(result).toEqual({ deleted: true });
      expect(mockConfigRepo.delete).toHaveBeenCalledWith(9);
    });
  });

  describe('resolveUsers', () => {
    it('báo lỗi NotFoundException nếu key không tồn tại', async () => {
      mockConfigRepo.findOne.mockResolvedValue(null);
      await expect(service.resolveUsers('unknown')).rejects.toThrow(NotFoundException);
    });

    it('trả về RỖNG nếu config chưa cấu hình phòng ban nào (KHÔNG fallback all)', async () => {
      mockConfigRepo.findOne.mockResolvedValue({ id: 1, key: 'sales' });
      mockDeptRepo.find.mockResolvedValue([]);
      mockPosRepo.find.mockResolvedValue([]);

      const result = await service.resolveUsers('sales');

      expect(result).toEqual([]);
      expect(mockUserRepo.find).not.toHaveBeenCalled();
    });

    it('lọc theo department BẮT BUỘC, KHÔNG lọc position nếu config không có dòng position nào', async () => {
      mockConfigRepo.findOne.mockResolvedValue({ id: 1, key: 'sales' });
      mockDeptRepo.find.mockResolvedValue([{ departmentId: 10 }, { departmentId: 11 }]);
      mockPosRepo.find.mockResolvedValue([]);
      mockUserRepo.find.mockResolvedValue([{ id: 1, name: 'A' }]);

      const result = await service.resolveUsers('sales');

      expect(result).toEqual([{ id: 1, name: 'A' }]);
      const whereArg = mockUserRepo.find.mock.calls[0][0].where;
      expect(whereArg.isActive).toBe(true);
      expect(whereArg.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(whereArg.positionId).toBeUndefined();
    });

    it('lọc thêm theo position nếu config CÓ dòng position (content_staff)', async () => {
      mockConfigRepo.findOne.mockResolvedValue({ id: 3, key: 'content_staff' });
      mockDeptRepo.find.mockResolvedValue([{ departmentId: 20 }]);
      mockPosRepo.find.mockResolvedValue([{ positionId: 7 }]);
      mockUserRepo.find.mockResolvedValue([{ id: 2, name: 'Content Staff' }]);

      await service.resolveUsers('content_staff');

      const whereArg = mockUserRepo.find.mock.calls[0][0].where;
      expect(whereArg.positionId).toBeDefined();
    });
  });
});
