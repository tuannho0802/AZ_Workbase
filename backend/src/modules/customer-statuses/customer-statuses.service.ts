import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { Customer } from '../../database/entities/customer.entity';
import { CreateCustomerStatusDto } from './dto/create-customer-status.dto';
import { UpdateCustomerStatusDto } from './dto/update-customer-status.dto';

/**
 * CustomerStatusesService - CRUD "Trạng thái khách hàng", thay thế ENUM cứng
 * cũ ở `customers.status` - xem `CreateCustomerStatuses1781400000000`.
 */
@Injectable()
export class CustomerStatusesService {
  constructor(
    @InjectRepository(CustomerStatus)
    private readonly statusRepo: Repository<CustomerStatus>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async findAll(): Promise<CustomerStatus[]> {
    return this.statusRepo.find({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  async findOne(id: number): Promise<CustomerStatus> {
    const status = await this.statusRepo.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Không tìm thấy trạng thái với ID ${id}`);
    }
    return status;
  }

  async create(dto: CreateCustomerStatusDto): Promise<CustomerStatus> {
    const existing = await this.statusRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Mã trạng thái "${dto.code}" đã tồn tại`);
    }

    const status = this.statusRepo.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      color: dto.color ?? '#1890ff',
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.statusRepo.save(status);
  }

  async update(id: number, dto: UpdateCustomerStatusDto): Promise<CustomerStatus> {
    const status = await this.findOne(id);

    if (dto.name !== undefined) status.name = dto.name;
    if (dto.description !== undefined) status.description = dto.description ?? null;
    if (dto.color !== undefined) status.color = dto.color;
    if (dto.sortOrder !== undefined) status.sortOrder = dto.sortOrder;

    return this.statusRepo.save(status);
  }

  /**
   * ⚠️ KHÔNG xoá trạng thái hệ thống (`isSystem = true`, 5 giá trị seed từ
   * ENUM cũ) - đúng nguyên tắc `PositionsService.remove()`. Với trạng thái
   * tuỳ chỉnh (`isSystem = false`), vẫn chặn xoá nếu đang có customer dùng
   * (cột `customers.status` là free-text sau migration, không có FK) - đúng
   * pattern `MediaSourcesService.remove()`, gợi ý đổi status cho các customer
   * đó trước khi xoá thay vì để "mồ côi" dữ liệu.
   */
  async remove(id: number): Promise<{ deleted: true }> {
    const status = await this.findOne(id);

    if (status.isSystem) {
      throw new BadRequestException(`Không thể xoá trạng thái hệ thống "${status.name}"`);
    }

    const inUseCount = await this.customerRepo.count({ where: { status: status.code } });
    if (inUseCount > 0) {
      throw new BadRequestException(
        `Không thể xoá "${status.name}" vì đang có ${inUseCount} khách hàng dùng trạng thái này. ` +
          'Vui lòng đổi trạng thái cho các khách hàng đó trước khi xoá.',
      );
    }

    await this.statusRepo.remove(status);
    return { deleted: true };
  }
}
