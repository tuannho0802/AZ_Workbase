import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Position } from '../../database/entities/position.entity';
import { User } from '../../database/entities/user.entity';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

/**
 * PositionsService - CRUD "Vị trí" (xem PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md
 * mục 3.1). Position là bảng cấu hình TOÀN CỤC (không theo phòng ban, dù có
 * cột `departmentId` chỉ mang tính gợi ý hiển thị - xem entity).
 */
@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(): Promise<Position[]> {
    return this.positionRepo.find({
      relations: ['department'],
      order: { name: 'ASC' },
    });
  }

  // Public - dùng cho form đăng ký tài khoản (POST /auth/register), KHÔNG
  // cần đăng nhập. Position không có cột `isActive` (khác Department) nên
  // trả toàn bộ danh mục, chỉ giới hạn 2 field id/name giống đúng
  // DepartmentsService.findAllPublic() (không lộ description/isSystem).
  async findAllPublic(): Promise<{ id: number; name: string }[]> {
    return this.positionRepo.find({
      order: { name: 'ASC' },
      select: ['id', 'name'],
    });
  }

  async findOne(id: number): Promise<Position> {
    const position = await this.positionRepo.findOne({
      where: { id },
      relations: ['department'],
    });
    if (!position) {
      throw new NotFoundException(`Không tìm thấy vị trí với ID ${id}`);
    }
    return position;
  }

  async create(dto: CreatePositionDto): Promise<Position> {
    const existing = await this.positionRepo.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new ConflictException(`Mã vị trí "${dto.code}" đã tồn tại`);
    }

    const position = this.positionRepo.create({
      code: dto.code,
      name: dto.name,
      departmentId: dto.departmentId ?? null,
      description: dto.description ?? null,
      isSystem: false,
    });
    return this.positionRepo.save(position);
  }

  async update(id: number, dto: UpdatePositionDto): Promise<Position> {
    const position = await this.findOne(id);

    if (dto.name !== undefined) position.name = dto.name;
    if (dto.description !== undefined) position.description = dto.description ?? null;
    if (dto.departmentId !== undefined) position.departmentId = dto.departmentId ?? null;

    return this.positionRepo.save(position);
  }

  /**
   * ⚠️ KHÔNG xoá Position đang có User gán (dù FK `users.position_id` là
   * `ON DELETE SET NULL` nên về mặt kỹ thuật xoá vẫn không lỗi/mất dữ liệu
   * User) - chặn tường minh ở đây để Admin PHẢI chủ động gỡ/đổi Position
   * cho các User đó trước, tránh vô tình làm mất override đang áp dụng cho
   * họ mà không nhận ra (đúng nguyên tắc PLAN mục 3.1: "KHÔNG xoá cứng 1
   * Position đang có User gán").
   */
  async remove(id: number): Promise<{ deleted: true }> {
    const position = await this.findOne(id);

    if (position.isSystem) {
      throw new BadRequestException(`Không thể xoá vị trí hệ thống "${position.name}"`);
    }

    const usersCount = await this.userRepo.count({ where: { positionId: id } });
    if (usersCount > 0) {
      throw new BadRequestException(
        `Không thể xoá vị trí "${position.name}" - đang có ${usersCount} nhân viên gán vị trí này. ` +
          'Vui lòng đổi/gỡ vị trí cho các nhân viên đó trước khi xoá.',
      );
    }

    await this.positionRepo.delete(id);
    return { deleted: true };
  }
}