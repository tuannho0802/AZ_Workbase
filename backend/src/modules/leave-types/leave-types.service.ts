import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveType } from '../../database/entities/leave-type.entity';
import { LeaveRequest } from '../../database/entities/leave-request.entity';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';

/**
 * LeaveTypesService - CRUD "Loại đơn nghỉ phép", thay thế ENUM cứng cũ ở
 * `leave_requests.leave_type` - mirror CHÍNH XÁC `CustomerStatusesService`
 * (xem `customer-statuses.service.ts`), thêm 2 helper (`getByCode()`,
 * `assertActiveCode()`) để `LeaveRequestsService` đọc động `isPaid`/
 * `deductsAnnualBalance` thay vì so sánh cứng theo enum.
 */
@Injectable()
export class LeaveTypesService {
  constructor(
    @InjectRepository(LeaveType)
    private readonly leaveTypeRepo: Repository<LeaveType>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepo: Repository<LeaveRequest>,
  ) {}

  /**
   * `inUseCount` KHÔNG lưu trong entity (chỉ tính động từ
   * `leave_requests.leave_type`, cột free-text sau migration, không có FK) -
   * mirror đúng `CustomerStatusesService.findAll()`.
   */
  async findAll(): Promise<(LeaveType & { inUseCount: number })[]> {
    const types = await this.leaveTypeRepo.find({
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    if (types.length === 0) return [];

    const counts = await this.leaveRequestRepo
      .createQueryBuilder('leave')
      .select('leave.leaveType', 'leaveType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('leave.leaveType')
      .getRawMany<{ leaveType: string; count: string }>();
    const countMap = new Map(counts.map((c) => [c.leaveType, Number(c.count)]));

    return types.map((t) => ({ ...t, inUseCount: countMap.get(t.code) ?? 0 }));
  }

  async findOne(id: number): Promise<LeaveType> {
    const type = await this.leaveTypeRepo.findOne({ where: { id } });
    if (!type) {
      throw new NotFoundException(`Không tìm thấy loại phép với ID ${id}`);
    }
    return type;
  }

  /** Dùng nội bộ (LeaveRequestsService) - null nếu code không tồn tại. */
  async getByCode(code: string): Promise<LeaveType | null> {
    return this.leaveTypeRepo.findOne({ where: { code } });
  }

  /**
   * Xác nhận `code` là 1 loại phép hợp lệ đang tồn tại - dùng ở
   * `LeaveRequestsService.create()` để chặn tạo đơn với `leaveType` không
   * tồn tại (trước đây cột ENUM tự chặn ở tầng DB, giờ VARCHAR tự do nên
   * PHẢI validate ở tầng ứng dụng).
   */
  async assertExists(code: string): Promise<LeaveType> {
    const type = await this.getByCode(code);
    if (!type) {
      throw new BadRequestException(`Loại phép "${code}" không tồn tại`);
    }
    return type;
  }

  async create(dto: CreateLeaveTypeDto): Promise<LeaveType> {
    const existing = await this.leaveTypeRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Mã loại phép "${dto.code}" đã tồn tại`);
    }

    const type = this.leaveTypeRepo.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      isSystem: false,
      color: dto.color ?? '#1890ff',
      isPaid: dto.isPaid ?? true,
      deductsAnnualBalance: dto.deductsAnnualBalance ?? false,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.leaveTypeRepo.save(type);
  }

  async update(id: number, dto: UpdateLeaveTypeDto): Promise<LeaveType> {
    const type = await this.findOne(id);

    if (dto.name !== undefined) type.name = dto.name;
    if (dto.description !== undefined) type.description = dto.description ?? null;
    if (dto.color !== undefined) type.color = dto.color;
    if (dto.isPaid !== undefined) type.isPaid = dto.isPaid;
    if (dto.deductsAnnualBalance !== undefined) type.deductsAnnualBalance = dto.deductsAnnualBalance;
    if (dto.sortOrder !== undefined) type.sortOrder = dto.sortOrder;

    return this.leaveTypeRepo.save(type);
  }

  /**
   * ⚠️ KHÔNG xoá loại phép hệ thống (`isSystem = true`, 7 giá trị seed từ
   * migration `CreateLeaveTypes1781500000000`) - đúng nguyên tắc
   * `CustomerStatusesService.remove()`. Với loại phép tuỳ chỉnh (`isSystem =
   * false`) đang có đơn nghỉ phép dùng (cột `leave_requests.leave_type` là
   * free-text sau migration, không có FK), cho phép xoá kèm "fallback": mọi
   * đơn đang có `leave_type = code cũ` sẽ được chuyển sang `fallbackCode` do
   * người dùng chọn, TRƯỚC khi loại phép cũ bị xoá - tránh làm "mồ côi"
   * dữ liệu, không cần người dùng tự sửa từng đơn trước.
   *
   * `fallbackCode` CHƯA truyền + đang có đơn dùng -> ném lỗi rõ ràng (kèm số
   * lượng) để FE hiện modal bắt chọn, KHÔNG tự ý chọn hộ 1 fallback mặc định
   * nào - đây là quyết định nghiệp vụ, phải do người xoá chọn.
   */
  async remove(id: number, fallbackCode?: string): Promise<{ deleted: true; reassignedCount: number }> {
    const type = await this.findOne(id);

    if (type.isSystem) {
      throw new BadRequestException(`Không thể xoá loại phép hệ thống "${type.name}"`);
    }

    const inUseCount = await this.leaveRequestRepo.count({ where: { leaveType: type.code } });

    let fallbackType: LeaveType | null = null;
    if (inUseCount > 0) {
      if (!fallbackCode) {
        throw new BadRequestException(
          `Đang có ${inUseCount} đơn nghỉ phép dùng loại phép "${type.name}". ` +
          'Vui lòng chọn loại phép thay thế (fallbackCode) để chuyển dữ liệu trước khi xoá.',
        );
      }
      if (fallbackCode === type.code) {
        throw new BadRequestException('Loại phép thay thế không được trùng với loại phép đang xoá');
      }
      fallbackType = await this.leaveTypeRepo.findOne({ where: { code: fallbackCode } });
      if (!fallbackType) {
        throw new BadRequestException(`Loại phép thay thế "${fallbackCode}" không tồn tại`);
      }
    }

    // Transaction: chuyển dữ liệu đơn nghỉ phép (nếu có) + xoá loại phép phải
    // cùng thành công hoặc cùng rollback - tránh trạng thái nửa vời.
    await this.leaveTypeRepo.manager.transaction(async (manager) => {
      if (inUseCount > 0 && fallbackType) {
        await manager.update(LeaveRequest, { leaveType: type.code }, { leaveType: fallbackType.code });
      }
      await manager.remove(LeaveType, type);
    });

    return { deleted: true, reassignedCount: inUseCount };
  }
}
