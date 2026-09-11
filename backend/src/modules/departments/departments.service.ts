import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Department } from '../../database/entities/department.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { User } from '../../database/entities/user.entity';
import { Customer } from '../../database/entities/customer.entity';
import { Role } from '../../common/enums/role.enum';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DeleteDepartmentDto } from './dto/delete-department.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(DepartmentManager)
    private readonly departmentManagerRepository: Repository<DepartmentManager>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly auditService: AuditService,
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

    // Managers (nhiều-nhiều, xem department-manager.entity.ts) - THÊM 2
    // QUERY (không N+1: 1 query lấy hết dòng department_managers của các
    // phòng ban này, 1 query lấy hết user liên quan) rồi JOIN ở tầng ứng
    // dụng, CÙNG 1 pattern với employeesByDept ở trên.
    const managerRows = await this.departmentManagerRepository.find({
      where: { departmentId: In(deptIds) },
    });
    const managerUserIds = [...new Set(managerRows.map((r) => r.userId))];
    const managerUsers = managerUserIds.length
      ? await this.userRepository.find({
        where: { id: In(managerUserIds) },
        select: ['id', 'name', 'role'],
      })
      : [];
    const managerUserById = new Map(managerUsers.map((u) => [u.id, u]));

    const managersByDept = new Map<number, { id: number; name: string; role: string }[]>();
    for (const row of managerRows) {
      const u = managerUserById.get(row.userId);
      if (!u) continue; // phòng thủ - không nên xảy ra do FK RESTRICT ở user_id
      const list = managersByDept.get(row.departmentId) ?? [];
      list.push({ id: u.id, name: u.name, role: u.role });
      managersByDept.set(row.departmentId, list);
    }

    return departments.map((d) => ({
      ...d,
      employees: employeesByDept.get(d.id) ?? [],
      managers: managersByDept.get(d.id) ?? [],
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

    // ⚠️ FIX PERMISSIONS.md mục 2.9 (blocker, đã fix) + yêu cầu 2026-09-11
    // (mở rộng: cho phép NHIỀU Manager/Assistant cùng quản lý 1 phòng ban,
    // không còn giới hạn 1-1 như cột managerUserId cũ - xem
    // department-manager.entity.ts + migration CreateDepartmentManagers).
    //
    // managerUserIds THAY THẾ TOÀN BỘ danh sách Manager hiện tại của phòng
    // ban này (không phải thêm/bớt từng phần) - đơn giản hoá hợp đồng API,
    // khớp đúng cách Select mode="multiple" ở FE luôn gửi lại toàn bộ danh
    // sách đang chọn. Không truyền field này (undefined) = không đụng gì.
    //
    // Validate: MỌI user trong danh sách PHẢI thuộc nhóm role "quản trị"
    // (Admin/Assistant/Manager) và đang active - tránh gán nhầm 1 Employee
    // làm "manager" (Employee về nguyên tắc CHỈ nên ở scope='own', gán
    // Employee làm mốc quy chiếu phòng ban cho role khác là sai ý đồ nghiệp
    // vụ, dù kỹ thuật không sai) khiến rule phân quyền theo phòng ban bị sai
    // lệch ở MỌI module liên quan (CustomerAccessHelper/UsersAccessHelper/
    // LeaveRequestsService/ZkDeviceService).
    if (dto.managerUserIds !== undefined) {
      const managerUserIds = [...new Set(dto.managerUserIds)];

      if (managerUserIds.length > 0) {
        const candidates = await this.userRepository.find({ where: { id: In(managerUserIds) } });
        if (candidates.length !== managerUserIds.length) {
          const foundIds = candidates.map((u) => u.id);
          const missing = managerUserIds.filter((uid) => !foundIds.includes(uid));
          throw new NotFoundException(
            `Không tìm thấy user để gán làm Manager phòng ban: ${missing.join(', ')}`,
          );
        }
        const invalidRoleUser = candidates.find(
          (u) => u.role !== Role.MANAGER && u.role !== Role.ASSISTANT && u.role !== Role.ADMIN,
        );
        if (invalidRoleUser) {
          throw new BadRequestException(
            `Chỉ có thể gán user có vai trò Admin/Assistant/Manager làm người quản lý phòng ban (user #${invalidRoleUser.id} không hợp lệ)`,
          );
        }
        const inactiveUser = candidates.find((u) => !u.isActive);
        if (inactiveUser) {
          throw new BadRequestException(
            `Không thể gán Manager đang bị khoá tài khoản (isActive = false): user #${inactiveUser.id}`,
          );
        }
      }

      // Xoá hết rồi chèn lại trong 1 transaction - tránh trạng thái nửa vời
      // (vd mất hết Manager cũ nhưng insert danh sách mới bị lỗi giữa chừng).
      await this.departmentManagerRepository.manager.transaction(async (manager) => {
        await manager.delete(DepartmentManager, { departmentId: id });
        if (managerUserIds.length > 0) {
          await manager.insert(
            DepartmentManager,
            managerUserIds.map((userId) => ({ departmentId: id, userId })),
          );
        }
      });
    }

    const { managerUserIds: _ignoredManagerUserIds, ...rest } = dto;
    this.departmentRepository.merge(department, rest);
    const saved = await this.departmentRepository.save(department);

    const currentManagerUserIds = (
      await this.departmentManagerRepository.find({ where: { departmentId: id }, select: ['userId'] })
    ).map((r) => r.userId);

    return { ...saved, managerUserIds: currentManagerUserIds };
  }

  /**
   * Xoá phòng ban - CÓ ĐỦ RÀNG BUỘC AN TOÀN theo đúng yêu cầu nghiệp vụ
   * (KHÔNG dùng migration để xoá dữ liệu, luôn qua endpoint có kiểm tra):
   *
   * 1. Không cho xoá nếu đây là phòng ban CUỐI CÙNG (hệ thống phải luôn còn
   *    tối thiểu 1 phòng ban - tức là chỉ xoá được khi đang có >= 2 phòng
   *    ban tồn tại trước khi xoá).
   * 2. Nếu phòng ban sắp xoá còn User nào đang thuộc về (user.department_id
   *    = phòng ban này) - BẮT BUỘC phải truyền `moveUsersToDepartmentId`
   *    (1 phòng ban khác đang tồn tại) để di dời toàn bộ User đó sang
   *    trước khi xoá. Không tự ý chọn hộ 1 phòng ban ngẫu nhiên - từ chối
   *    rõ ràng nếu thiếu tham số này, để người gọi (Admin) chủ động quyết
   *    định đích di dời.
   *    (Khớp đúng ràng buộc DB thật: users.department_id có FK
   *    `ON DELETE NO ACTION` - nếu không di dời trước, MySQL sẽ tự chặn
   *    bằng lỗi FK constraint; ở đây chủ động kiểm tra + thông báo rõ ràng
   *    bằng tiếng Việt thay vì để lộ lỗi SQL thô ra ngoài.)
   * 3. Customer đang thuộc phòng ban này KHÔNG bắt buộc di dời - FK
   *    `customers.department_id` đã là `ON DELETE SET NULL` sẵn (khách
   *    hàng chỉ mất gán phòng ban, không bị lỗi/mất dữ liệu) - vẫn LOG rõ
   *    số lượng bị ảnh hưởng vào audit log để Admin biết mà rà soát lại
   *    nếu cần gán lại phòng ban cho các khách hàng đó.
   * 4. Ghi audit log đầy đủ (loại action DELETE_DEPARTMENT), lưu lại toàn
   *    bộ dữ liệu phòng ban đã xoá + số user đã di dời + số customer bị
   *    ảnh hưởng - phục vụ truy vết sau này (không thể hoàn tác qua UI,
   *    audit log là nơi duy nhất còn giữ lại thông tin phòng ban đã mất).
   */
  async remove(id: number, dto: DeleteDepartmentDto, adminId: number) {
    const department = await this.findOne(id);

    const totalDepartments = await this.departmentRepository.count();
    if (totalDepartments <= 1) {
      throw new BadRequestException(
        'Không thể xoá phòng ban cuối cùng - hệ thống phải luôn còn tối thiểu 1 phòng ban.',
      );
    }

    const usersInDept = await this.userRepository.find({
      where: { departmentId: id },
      select: ['id', 'name'],
    });

    if (usersInDept.length > 0) {
      if (!dto.moveUsersToDepartmentId) {
        throw new BadRequestException(
          `Phòng ban "${department.name}" đang có ${usersInDept.length} nhân viên ` +
          `(${usersInDept.map((u) => u.name).join(', ')}). ` +
          'Vui lòng chọn 1 phòng ban khác để di dời họ sang trước khi xoá ' +
          '(truyền moveUsersToDepartmentId).',
        );
      }

      if (dto.moveUsersToDepartmentId === id) {
        throw new BadRequestException(
          'Phòng ban đích để di dời phải KHÁC với phòng ban đang xoá.',
        );
      }

      const targetDept = await this.departmentRepository.findOne({
        where: { id: dto.moveUsersToDepartmentId },
      });
      if (!targetDept) {
        throw new NotFoundException(
          `Không tìm thấy phòng ban đích (ID ${dto.moveUsersToDepartmentId}) để di dời nhân viên`,
        );
      }

      await this.userRepository
        .createQueryBuilder()
        .update(User)
        .set({ departmentId: dto.moveUsersToDepartmentId })
        .where('department_id = :id', { id })
        .execute();
    }

    // Đếm (KHÔNG bắt buộc di dời - FK đã SET NULL sẵn, chỉ để ghi audit)
    const affectedCustomersCount = await this.customerRepository.count({
      where: { departmentId: id },
    });

    const oldData = {
      ...department,
      movedUsersCount: usersInDept.length,
      movedUsersTo: dto.moveUsersToDepartmentId ?? null,
      affectedCustomersCount,
    };

    await this.departmentRepository.delete(id);

    this.auditService.logActionAsync(
      adminId,
      'DELETE_DEPARTMENT',
      'department',
      id,
      oldData,
      null,
    );

    return {
      message: `Đã xoá phòng ban "${department.name}"`,
      movedUsersCount: usersInDept.length,
      affectedCustomersCount,
    };
  }
}