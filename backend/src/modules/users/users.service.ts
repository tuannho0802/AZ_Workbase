import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../../common/enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async updateLastLogin(id: number): Promise<void> {
    await this.usersRepository.update(id, { lastLoginAt: new Date() });
  }

  async findEmployees(callerId: number, callerRole: string, targetRole?: string): Promise<User[]> {
    const qb = this.usersRepository.createQueryBuilder('user')
      .where('user.isActive = :isActive', { isActive: true })
      .select(['user.id', 'user.name', 'user.email', 'user.role', 'user.departmentId']);
      
    if (targetRole) {
      qb.andWhere('user.role = :targetRole', { targetRole });
    }

    if (callerRole === Role.MANAGER) {
      const caller = await this.findById(callerId);
      if (caller?.departmentId) {
        qb.andWhere('user.departmentId = :deptId', { deptId: caller.departmentId });
      }
    }

    return qb.getMany();
  }

  async findAll(userId: number, userRole: string, options: { role?: string; departmentId?: number; isActive?: boolean; search?: string; page?: number; limit?: number }) {
    const { role, departmentId, isActive = true, search, page = 1, limit = 20 } = options;
    
    const queryBuilder = this.usersRepository.createQueryBuilder('user')
      .where('1=1') // boilerplate for andWhere
      .select(['user.id', 'user.email', 'user.name', 'user.role', 'user.departmentId', 'user.isActive', 'user.lastLoginAt']);

    if (userRole === Role.MANAGER) {
      const manager = await this.findById(userId);
      if (manager?.departmentId) {
        queryBuilder.andWhere('user.departmentId = :deptId', { deptId: manager.departmentId });
      } else {
        return { data: [], total: 0 };
      }
    } else if (userRole !== Role.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền xem danh sách nhân viên');
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }
    if (departmentId) {
      queryBuilder.andWhere('user.departmentId = :departmentId', { departmentId });
    }
    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }
    if (search) {
      queryBuilder.andWhere('(user.name LIKE :search OR user.email LIKE :search)', { search: `%${search}%` });
    }

    const [data, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.id', 'DESC')
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit
    };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã tồn tại trong hệ thống');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.usersRepository.create({
      ...dto,
      password: hashedPassword,
    });

    const saved = await this.usersRepository.save(user);
    const { password, ...result } = saved;
    return result;
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    this.usersRepository.merge(user, dto);
    const saved = await this.usersRepository.save(user);
    const { password, ...result } = saved;
    return result;
  }

  async resetPassword(id: number, dto: ResetPasswordDto) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersRepository.update(id, { password: hashedPassword });
    
    return { success: true, message: 'Đã đặt lại mật khẩu thành công' };
  }
}
