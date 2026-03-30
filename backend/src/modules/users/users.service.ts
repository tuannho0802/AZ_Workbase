import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Role } from '../../common/enums/role.enum';

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
}
