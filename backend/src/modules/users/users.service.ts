import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
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

  async saveRefreshToken(userId: number, token: string | null): Promise<void> {
    const hashedRefreshToken = token ? await bcrypt.hash(token, 10) : null;
    // Use query builder to update the field that has select: false
    await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({ hashedRefreshToken })
      .where('id = :id', { id: userId })
      .execute();
  }

  async findByIdWithRefreshToken(id: number): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.hashedRefreshToken')
      .where('user.id = :id', { id })
      .getOne();
  }

  async findEmployees(callerId: number, callerRole: string, targetRole?: string): Promise<User[]> {
    const qb = this.usersRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.department', 'department')
      .where('1=1');
      
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
    const { role, departmentId, isActive, search, page = 1, limit = 20 } = options;
    
    const queryBuilder = this.usersRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.department', 'department')
      .where('1=1');

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

  async create(createDto: CreateUserDto): Promise<User> {
    // 1. Check email exists
    const existing = await this.usersRepository.findOne({
      where: { email: createDto.email },
    });

    if (existing) {
      throw new ConflictException('Email đã tồn tại');
    }

    // 2. Hash password
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(createDto.password, 10);

    // 3. Create entity
    const user = this.usersRepository.create({
      ...createDto,
      password: hashedPassword,
    });

    // 4. CRITICAL: PHẢI CÓ SAVE()
    const savedUser = await this.usersRepository.save(user);

    console.log('[DEBUG] New user created:', savedUser.id);
    
    return savedUser;
  }

  async update(id: number, updateDto: UpdateUserDto): Promise<User> {
    // 1. Tìm user
    const user = await this.usersRepository.findOne({ 
      where: { id } 
    });

    if (!user) {
      throw new NotFoundException('Không tìm thấy nhân viên');
    }

    // 2. Nếu có password, hash trước. Nếu không, XÓA khỏi DTO để tránh Object.assign chép đè chuỗi rỗng
    if ((updateDto as any).password && (updateDto as any).password.trim() !== '') {
      const bcrypt = require('bcrypt');
      (updateDto as any).password = await bcrypt.hash((updateDto as any).password, 10);
    } else {
      delete (updateDto as any).password;
    }

    // 3. Merge data
    Object.assign(user, updateDto);

    // 4. CRITICAL: PHẢI CÓ SAVE()
    const savedUser = await this.usersRepository.save(user);

    console.log('[DEBUG] User saved to DB:', savedUser.id, '- isActive:', savedUser.isActive);
    
    return savedUser;
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
