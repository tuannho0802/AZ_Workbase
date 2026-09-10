import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AssignmentGroupConfig } from '../../database/entities/assignment-group-config.entity';
import { AssignmentGroupConfigDepartment } from '../../database/entities/assignment-group-config-department.entity';
import { AssignmentGroupConfigPosition } from '../../database/entities/assignment-group-config-position.entity';
import { User } from '../../database/entities/user.entity';
import { ApprovalStatus } from '../../common/enums/approval-status.enum';
import { CreateAssignmentGroupDto } from './dto/create-assignment-group.dto';
import { UpdateAssignmentGroupDto } from './dto/update-assignment-group.dto';

/**
 * AssignmentGroupsService - "Quản lý phụ trách" (xem
 * PLAN_POSITION_FIELD_VISIBILITY_ASSIGNMENT_GROUPS.md mục 3.6). Thay thế
 * hardcode FE `.find((d) => d.name.includes('kinh doanh'))` bằng bảng cấu
 * hình Admin tự sửa qua UI: "nhóm phụ trách X gồm N Phòng ban (BẮT BUỘC >=1)
 * + N Vị trí (TUỲ CHỌN)".
 *
 * ⚠️ CHƯA có nơi nào trong `customers` module gọi `resolveUsers()` - service
 * này độc lập, dùng dần khi FE chuyển đổi (xem comment đầu migration
 * 1781100000000). Không phá hành vi hardcode hiện tại.
 */
@Injectable()
export class AssignmentGroupsService {
  constructor(
    @InjectRepository(AssignmentGroupConfig)
    private readonly configRepo: Repository<AssignmentGroupConfig>,
    @InjectRepository(AssignmentGroupConfigDepartment)
    private readonly deptRepo: Repository<AssignmentGroupConfigDepartment>,
    @InjectRepository(AssignmentGroupConfigPosition)
    private readonly posRepo: Repository<AssignmentGroupConfigPosition>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(): Promise<AssignmentGroupConfig[]> {
    return this.configRepo.find({
      relations: ['departments', 'departments.department', 'positions', 'positions.position'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<AssignmentGroupConfig> {
    const config = await this.configRepo.findOne({
      where: { id },
      relations: ['departments', 'departments.department', 'positions', 'positions.position'],
    });
    if (!config) {
      throw new NotFoundException(`Không tìm thấy config với ID ${id}`);
    }
    return config;
  }

  private async findByKeyOrThrow(key: string): Promise<AssignmentGroupConfig> {
    const config = await this.configRepo.findOne({ where: { key } });
    if (!config) {
      throw new NotFoundException(`Không tìm thấy "Quản lý phụ trách" với key "${key}"`);
    }
    return config;
  }

  async create(dto: CreateAssignmentGroupDto): Promise<AssignmentGroupConfig> {
    const existing = await this.configRepo.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new ConflictException(`Key "${dto.key}" đã tồn tại`);
    }

    const config = await this.configRepo.save(
      this.configRepo.create({
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        isSystem: false,
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      }),
    );

    await this.replaceDepartments(config.id, dto.departmentIds);
    await this.replacePositions(config.id, dto.positionIds ?? []);

    return this.findOne(config.id);
  }

  async update(id: number, dto: UpdateAssignmentGroupDto): Promise<AssignmentGroupConfig> {
    const config = await this.findOne(id);

    if (dto.name !== undefined) config.name = dto.name;
    if (dto.description !== undefined) config.description = dto.description ?? null;
    if (dto.color !== undefined) config.color = dto.color;
    await this.configRepo.save(config);

    await this.replaceDepartments(id, dto.departmentIds);
    await this.replacePositions(id, dto.positionIds ?? []);

    return this.findOne(id);
  }

  async remove(id: number): Promise<{ deleted: true }> {
    const config = await this.findOne(id);
    if (config.isSystem) {
      throw new BadRequestException(`Không thể xoá config hệ thống "${config.name}"`);
    }
    await this.configRepo.delete(id);
    return { deleted: true };
  }

  private async replaceDepartments(configId: number, departmentIds: number[]): Promise<void> {
    await this.deptRepo.delete({ configId });
    if (departmentIds.length === 0) return;
    const rows = departmentIds.map((departmentId) => this.deptRepo.create({ configId, departmentId }));
    await this.deptRepo.save(rows);
  }

  private async replacePositions(configId: number, positionIds: number[]): Promise<void> {
    await this.posRepo.delete({ configId });
    if (positionIds.length === 0) return;
    const rows = positionIds.map((positionId) => this.posRepo.create({ configId, positionId }));
    await this.posRepo.save(rows);
  }

  /**
   * Danh sách user hợp lệ cho 1 config, theo đúng thuật toán mục 3.6 của
   * PLAN: isActive + approved + department BẮT BUỘC khớp + position TUỲ
   * CHỌN (không có dòng position nào = không lọc thêm).
   *
   * Config không có phòng ban nào (chưa cấu hình) → trả rỗng, KHÔNG fallback
   * "tất cả phòng ban" (tránh lộ data ngoài ý muốn nếu Admin quên cấu hình).
   */
  // ⚠️ SỬA (2026-09-10, rà soát GroupManagersModal.tsx): trước đây chỉ
  // `select: ['id', 'name']` -> dropdown "Nhân viên Content" ở FE thiếu hẳn
  // department/role/position để vẽ dropdown chi tiết như `SalesUserSelect`
  // (dùng chung nguồn `GET /users/all`). Đổi sang JOIN 'department'+'position'
  // đối xứng `UsersService.findEmployees()`, trả về đủ field FE cần - không
  // đổi logic lọc (department/position theo config), chỉ đổi field trả về.
  async resolveUsers(key: string): Promise<
    Pick<User, 'id' | 'name' | 'email' | 'role' | 'department' | 'position'>[]
  > {
    const config = await this.findByKeyOrThrow(key);

    const [deptRows, posRows] = await Promise.all([
      this.deptRepo.find({ where: { configId: config.id } }),
      this.posRepo.find({ where: { configId: config.id } }),
    ]);

    const departmentIds = deptRows.map((d) => d.departmentId);
    if (departmentIds.length === 0) {
      return [];
    }

    const where: Record<string, unknown> = {
      isActive: true,
      approvalStatus: ApprovalStatus.APPROVED,
      departmentId: In(departmentIds),
    };
    const positionIds = posRows.map((p) => p.positionId);
    if (positionIds.length > 0) {
      where.positionId = In(positionIds);
    }

    const users = await this.userRepo.find({
      where,
      relations: ['department', 'position'],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: { id: true, name: true },
        position: { id: true, name: true, code: true },
      },
      order: { name: 'ASC' },
    });
    return users;
  }
}