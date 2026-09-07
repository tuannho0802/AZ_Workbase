import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Department } from '../../database/entities/department.entity';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Danh sách phòng ban, kèm PREVIEW nhân viên (id/name, KHÔNG kèm email/
   * role/thông tin khác) đang thuộc từng phòng - phục vụ UI trang
   * /phong-ban hiển thị dạng "Tên A +N" ở cột "Nhân viên" mà không cần Drawer
   * gọi thêm request nào chỉ để đếm số lượng.
   *
   * Chỉ 2 QUERY DUY NHẤT bất kể có bao nhiêu phòng ban (KHÔNG N+1: không
   * query riêng cho từng phòng) - query 1 lấy danh sách phòng, query 2 lấy
   * TOÀN BỘ user active thuộc các phòng đó 1 lần, rồi gom nhóm ở tầng ứng
   * dụng (JS Map), không phải tại DB.
   *
   * Khi cần xem ĐẦY ĐỦ chi tiết nhân viên (email, role...) - vd mở Drawer -
   * FE tự gọi riêng `GET /users?departmentId=X`, KHÔNG dùng field
   * `employees` rút gọn ở đây (tránh nhúng dữ liệu nặng cho MỌI phòng ban
   * trong khi người dùng chỉ xem chi tiết 1 phòng tại 1 thời điểm).
   */
  async findAll() {
    const departments = await this.departmentRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });

    if (departments.length === 0) return [];

    const deptIds = departments.map((d) => d.id);
    const users = await this.userRepository.find({
      where: { departmentId: In(deptIds), isActive: true },
      select: ['id', 'name', 'departmentId'],
      order: { name: 'ASC' },
    });

    const employeesByDept = new Map<number, { id: number; name: string }[]>();
    for (const u of users) {
      if (u.departmentId == null) continue;
      const list = employeesByDept.get(u.departmentId) ?? [];
      list.push({ id: u.id, name: u.name });
      employeesByDept.set(u.departmentId, list);
    }

    return departments.map((d) => ({
      ...d,
      employees: employeesByDept.get(d.id) ?? [],
    }));
  }

  /**
   * Danh sách phòng ban PUBLIC (không cần đăng nhập) - dùng cho form đăng ký
   * tài khoản công khai (POST /auth/register). Chỉ trả id/name - KHÔNG trả
   * các field khác (createdAt, isActive...) để không lộ thừa dữ liệu nội bộ
   * qua 1 endpoint không yêu cầu xác thực.
   */
  async findAllPublic(): Promise<{ id: number; name: string }[]> {
    return this.departmentRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
      select: ['id', 'name'],
    });
  }

  async findOne(id: number) {
    const department = await this.departmentRepository.findOne({ where: { id } });
    if (!department) {
      throw new NotFoundException(`Không tìm thấy phòng ban với ID ${id}`);
    }
    return department;
  }

  async create(dto: CreateDepartmentDto) {
    const existing = await this.departmentRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('Tên phòng ban đã tồn tại');
    }

    const department = this.departmentRepository.create(dto);
    return await this.departmentRepository.save(department);
  }

  async update(id: number, dto: UpdateDepartmentDto) {
    const department = await this.findOne(id);

    if (dto.name && dto.name !== department.name) {
      const existing = await this.departmentRepository.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException('Tên phòng ban đã tồn tại');
      }
    }

    // ⚠️ FIX PERMISSIONS.md mục 2.9 (blocker): trước đây KHÔNG có endpoint
    // nào cho phép gán "Manager quản lý phòng ban nào" - managerUserId chỉ
    // sửa được thủ công qua DB. Đây là field CHỦ ĐỘNG dùng bởi
    // CustomerAccessHelper (và các module khác) để tính phạm vi Manager -
    // validate chặt: user được gán PHẢI có role MANAGER và đang active,
    // tránh gán nhầm 1 Employee/Admin làm "manager_user_id" khiến toàn bộ
    // rule phân quyền theo phòng ban bị sai lệch ở MỌI module liên quan.
    if (dto.managerUserId !== undefined) {
      if (dto.managerUserId === null) {
        department.managerUserId = null as any;
      } else {
        const managerCandidate = await this.userRepository.findOne({
          where: { id: dto.managerUserId },
        });
        if (!managerCandidate) {
          throw new NotFoundException('Không tìm thấy user để gán làm Manager phòng ban');
        }
        if (managerCandidate.role !== Role.MANAGER) {
          throw new BadRequestException(
            'Chỉ có thể gán user có vai trò Manager làm người quản lý phòng ban',
          );
        }
        if (!managerCandidate.isActive) {
          throw new BadRequestException(
            'Không thể gán Manager đang bị khoá tài khoản (isActive = false)',
          );
        }
        department.managerUserId = dto.managerUserId;
      }
    }

    const { managerUserId, ...rest } = dto;
    this.departmentRepository.merge(department, rest);
    return await this.departmentRepository.save(department);
  }
}