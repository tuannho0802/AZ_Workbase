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

  /**
   * `inUseCount` KHÔNG lưu trong entity (chỉ tính động từ `customers.status`,
   * cột free-text sau migration, không có FK) - FE dùng số này để: (1) hiển
   * thị ngay trong bảng quản lý ("Đang dùng: N khách hàng"), (2) quyết định
   * có cần bắt buộc chọn `fallbackCode` khi xoá hay không (xem `remove()`)
   * TRƯỚC KHI user bấm Xoá, tránh phải bấm rồi mới biết cần chọn fallback.
   * 1 query GROUP BY duy nhất, không N+1 theo từng status.
   */
  async findAll(): Promise<(CustomerStatus & { inUseCount: number })[]> {
    const statuses = await this.statusRepo.find({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (statuses.length === 0) return [];

    const counts = await this.customerRepo
      .createQueryBuilder('customer')
      .select('customer.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('customer.status')
      .getRawMany<{ status: string; count: string }>();
    const countMap = new Map(counts.map((c) => [c.status, Number(c.count)]));

    return statuses.map((s) => ({ ...s, inUseCount: countMap.get(s.code) ?? 0 }));
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
   * ⚠️ KHÔNG xoá trạng thái hệ thống (`isSystem = true`, 9 giá trị seed từ
   * migration `CreateCustomerStatuses1781400000000`) - đúng nguyên tắc
   * `PositionsService.remove()`. Với trạng thái tuỳ chỉnh (`isSystem =
   * false`) đang có customer dùng (cột `customers.status` là free-text sau
   * migration, không có FK), thay vì chặn cứng như trước, BÂY GIỜ cho phép
   * xoá kèm "fallback": mọi customer đang có `status = code cũ` sẽ được
   * chuyển sang `fallbackCode` do người dùng chọn (UI bắt buộc chọn - xem
   * `CustomerStatusesController.remove()` + modal xoá ở FE) TRƯỚC khi status
   * cũ bị xoá, tránh làm "mồ côi" dữ liệu như pattern cũ nhưng không cần
   * người dùng phải tự sửa từng khách hàng trước.
   *
   * `fallbackCode` CHƯA truyền + đang có customer dùng -> ném lỗi rõ ràng
   * (kèm số lượng) để FE hiện modal bắt chọn, KHÔNG tự ý chọn hộ 1 fallback
   * mặc định nào - đây là quyết định nghiệp vụ, phải do người xoá chọn.
   */
  async remove(id: number, fallbackCode?: string): Promise<{ deleted: true; reassignedCount: number }> {
    const status = await this.findOne(id);

    if (status.isSystem) {
      throw new BadRequestException(`Không thể xoá trạng thái hệ thống "${status.name}"`);
    }

    const inUseCount = await this.customerRepo.count({ where: { status: status.code } });

    let fallbackStatus: CustomerStatus | null = null;
    if (inUseCount > 0) {
      if (!fallbackCode) {
        throw new BadRequestException(
          `Đang có ${inUseCount} khách hàng dùng trạng thái "${status.name}". ` +
          'Vui lòng chọn trạng thái thay thế (fallbackCode) để chuyển dữ liệu trước khi xoá.',
        );
      }
      if (fallbackCode === status.code) {
        throw new BadRequestException('Trạng thái thay thế không được trùng với trạng thái đang xoá');
      }
      fallbackStatus = await this.statusRepo.findOne({ where: { code: fallbackCode } });
      if (!fallbackStatus) {
        throw new BadRequestException(`Trạng thái thay thế "${fallbackCode}" không tồn tại`);
      }
    }

    // Transaction: chuyển dữ liệu customer (nếu có) + xoá status phải cùng
    // thành công hoặc cùng rollback - tránh trạng thái nửa vời (đã chuyển
    // hết customer sang fallback nhưng status cũ vẫn còn, hoặc ngược lại).
    await this.statusRepo.manager.transaction(async (manager) => {
      if (inUseCount > 0 && fallbackStatus) {
        await manager.update(Customer, { status: status.code }, { status: fallbackStatus.code });
      }
      await manager.remove(CustomerStatus, status);
    });

    return { deleted: true, reassignedCount: inUseCount };
  }
}