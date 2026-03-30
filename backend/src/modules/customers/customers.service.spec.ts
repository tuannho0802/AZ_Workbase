import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CustomersService } from './customers.service';
import { Customer } from './entities/customer.entity';
import { DuplicatePhoneException, CustomerNotFoundException, UnauthorizedCustomerAccessException } from './exceptions/customer.exceptions';
import { Role } from '../../common/enums/role.enum';

describe('CustomersService', () => {
  let service: CustomersService;
  
  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    merge: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: getRepositoryToken(Customer),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it('nên khởi tạo thành công service', () => {
    expect(service).toBeDefined();
  });

  describe('create - Tạo khách hàng', () => {
    it('nên tạo và lưu trữ khách hàng thành công', async () => {
      const dto: any = { name: 'Test Nguyen', phone: '0912345678' };
      mockRepository.create.mockReturnValue(dto);
      mockRepository.save.mockResolvedValue(dto);

      const result = await service.create(dto, 1);
      expect(result).toEqual(dto);
      expect(mockRepository.create).toHaveBeenCalledWith({ ...dto, createdBy: 1 });
    });

    it('nên ném lỗi DuplicatePhoneException khi dính rào cản ER_DUP_ENTRY', async () => {
      const dto: any = { name: 'Test', phone: '0912345678' };
      mockRepository.create.mockReturnValue(dto);
      mockRepository.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

      await expect(service.create(dto, 1)).rejects.toThrow(DuplicatePhoneException);
    });
  });
});
