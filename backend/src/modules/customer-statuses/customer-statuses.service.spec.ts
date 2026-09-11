import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CustomerStatusesService } from './customer-statuses.service';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { Customer } from '../../database/entities/customer.entity';

describe('CustomerStatusesService', () => {
  let service: CustomerStatusesService;

  const mockStatusRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockCustomerRepo = {
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerStatusesService,
        { provide: getRepositoryToken(CustomerStatus), useValue: mockStatusRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
      ],
    }).compile();

    service = module.get<CustomerStatusesService>(CustomerStatusesService);
  });

  describe('findAll', () => {
    it('lấy tất cả trạng thái, sắp theo sortOrder', async () => {
      mockStatusRepo.find.mockResolvedValue([{ id: 1, code: 'pending' }]);

      const result = await service.findAll();

      expect(mockStatusRepo.find).toHaveBeenCalledWith({
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      expect(result).toEqual([{ id: 1, code: 'pending' }]);
    });
  });

  describe('findOne', () => {
    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('tạo trạng thái mới thành công khi code chưa tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue(null);
      mockStatusRepo.create.mockReturnValue({ code: 'callback_later', name: 'Gọi lại sau' });
      mockStatusRepo.save.mockResolvedValue({ id: 7, code: 'callback_later', name: 'Gọi lại sau' });

      const result = await service.create({ code: 'callback_later', name: 'Gọi lại sau' });

      expect(mockStatusRepo.create).toHaveBeenCalledWith({
        code: 'callback_later',
        name: 'Gọi lại sau',
        description: null,
        isSystem: false,
        color: '#1890ff',
        sortOrder: 0,
      });
      expect(result).toEqual({ id: 7, code: 'callback_later', name: 'Gọi lại sau' });
    });

    it('ném ConflictException nếu code đã tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'pending' });

      await expect(service.create({ code: 'pending', name: 'X' })).rejects.toThrow(ConflictException);
      expect(mockStatusRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu trạng thái không tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.update(999, { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('cho phép đổi màu/tên mà không đổi code', async () => {
      const status = { id: 1, code: 'pending', name: 'Chờ xử lý', color: '#faad14', sortOrder: 0 };
      mockStatusRepo.findOne.mockResolvedValue(status);
      mockStatusRepo.save.mockImplementation((s) => Promise.resolve(s));

      const result = await service.update(1, { name: 'Chờ xử lý mới', color: '#0068FF' });

      expect(result.name).toBe('Chờ xử lý mới');
      expect(result.color).toBe('#0068FF');
      expect(result.code).toBe('pending');
    });
  });

  describe('remove', () => {
    it('ném BadRequestException nếu là trạng thái hệ thống', async () => {
      mockStatusRepo.findOne.mockResolvedValue({ id: 1, code: 'pending', name: 'Chờ xử lý', isSystem: true });

      await expect(service.remove(1)).rejects.toThrow(BadRequestException);
      expect(mockStatusRepo.remove).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu đang có customer dùng trạng thái tuỳ chỉnh này', async () => {
      mockStatusRepo.findOne.mockResolvedValue({ id: 2, code: 'callback_later', name: 'Gọi lại sau', isSystem: false });
      mockCustomerRepo.count.mockResolvedValue(3);

      await expect(service.remove(2)).rejects.toThrow(BadRequestException);
      expect(mockStatusRepo.remove).not.toHaveBeenCalled();
    });

    it('xoá thành công khi trạng thái tuỳ chỉnh KHÔNG có customer nào dùng', async () => {
      const status = { id: 2, code: 'callback_later', name: 'Gọi lại sau', isSystem: false };
      mockStatusRepo.findOne.mockResolvedValue(status);
      mockCustomerRepo.count.mockResolvedValue(0);

      const result = await service.remove(2);

      expect(mockCustomerRepo.count).toHaveBeenCalledWith({ where: { status: 'callback_later' } });
      expect(mockStatusRepo.remove).toHaveBeenCalledWith(status);
      expect(result).toEqual({ deleted: true });
    });

    it('ném NotFoundException nếu id không tồn tại', async () => {
      mockStatusRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
