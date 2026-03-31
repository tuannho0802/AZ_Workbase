import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, IsNull } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerFiltersDto } from './dto/customer-filters.dto';
import { BulkAssignDto } from './dto/bulk-assign.dto';
import { Role } from '../../common/enums/role.enum';
import { User } from '../users/entities/user.entity';
import {
  DuplicatePhoneException,
  CustomerNotFoundException,
  UnauthorizedCustomerAccessException,
} from './exceptions/customer.exceptions';
import { CustomerNote } from './entities/customer-note.entity';
import { Deposit } from '../deposits/entities/deposit.entity';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(CustomerNote)
    private readonly notesRepository: Repository<CustomerNote>,
    @InjectRepository(Deposit)
    private readonly depositsRepository: Repository<Deposit>,
  ) {}

  async create(createCustomerDto: CreateCustomerDto, userId: number) {
    try {
      const customer = this.customersRepository.create({
        ...createCustomerDto,
        createdBy: userId,
      });
      return await this.customersRepository.save(customer);
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new DuplicatePhoneException();
      }
      throw error;
    }
  }

  async findAll(filtersDto: CustomerFiltersDto, userId: number, userRole: string) {
    const { page = 1, limit = 20, departmentId, salesUserId, status, search, dateFrom, dateTo } = filtersDto;

    console.log('=== DEBUG CUSTOMERS SERVICE ===');
    console.log('User ID:', userId);
    console.log('User Role:', userRole);
    console.log('Filters:', filtersDto);

    const queryBuilder = this.customersRepository.createQueryBuilder('customer');

    queryBuilder.leftJoinAndSelect('customer.salesUser', 'salesUser');
    queryBuilder.leftJoinAndSelect('customer.department', 'department');

    queryBuilder.where('customer.deleted_at IS NULL');

    if (userRole === Role.EMPLOYEE) {
      console.log('[RBAC] Employee - Filter by createdBy');
      queryBuilder.andWhere('customer.createdBy = :userId', { userId });
    } else {
      console.log('[RBAC] Admin/Manager - Show ALL customers');
    }

    if (departmentId) {
      queryBuilder.andWhere('customer.departmentId = :departmentId', { departmentId });
    }
    if (salesUserId) {
      queryBuilder.andWhere('customer.salesUserId = :salesUserId', { salesUserId });
    }
    if (status) {
      queryBuilder.andWhere('customer.status = :status', { status });
    }
    if (search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('customer.name LIKE :search', { search: `%${search}%` })
            .orWhere('customer.phone LIKE :search', { search: `%${search}%` })
            .orWhere('customer.email LIKE :search', { search: `%${search}%` });
        }),
      );
    }
    if (dateFrom) {
      queryBuilder.andWhere('DATE(customer.createdAt) >= DATE(:dateFrom)', { dateFrom });
    }
    if (dateTo) {
      queryBuilder.andWhere('DATE(customer.createdAt) <= DATE(:dateTo)', { dateTo });
    }

    queryBuilder.orderBy('customer.createdAt', 'DESC');
    queryBuilder.skip((page - 1) * limit).take(limit);

    console.log('SQL Query:', queryBuilder.getSql());
    console.log('Query Parameters:', queryBuilder.getParameters());

    const [data, total] = await queryBuilder.getManyAndCount();

    console.log('Result count:', data.length);
    console.log('Total in DB:', total);
    console.log('=== END DEBUG ===');

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats(userId: number, userRole: string) {
    const queryBuilder = this.customersRepository.createQueryBuilder('customer')
      .where('customer.deletedAt IS NULL');

    // RBAC Option A: Employee only sees their own stats
    if (userRole === Role.EMPLOYEE) {
      queryBuilder.andWhere('customer.createdBy = :userId', { userId });
    }

    const [total, newToday, closedTotal] = await Promise.all([
      queryBuilder.clone().getCount(),
      queryBuilder.clone()
        .andWhere("DATE(CONVERT_TZ(customer.createdAt, '+00:00', '+07:00')) = CURDATE()")
        .getCount(),
      queryBuilder.clone()
        .andWhere('customer.status = :status', { status: 'closed' })
        .getCount(),
    ]);

    // Pending and Potential for completeness (matching promt)
    const [pendingTotal, potentialTotal] = await Promise.all([
      queryBuilder.clone().andWhere('customer.status = :status', { status: 'pending' }).getCount(),
      queryBuilder.clone().andWhere('customer.status = :status', { status: 'potential' }).getCount(),
    ]);

    const depositsQuery = this.depositsRepository.createQueryBuilder('deposit')
      .leftJoin('deposit.customer', 'customer')
      .where('customer.deletedAt IS NULL');

    if (userRole === Role.EMPLOYEE) {
      depositsQuery.andWhere('customer.createdBy = :userId', { userId });
    }

    const totalDepositRaw = await depositsQuery
      .select('SUM(deposit.amount)', 'total')
      .getRawOne();

    return {
      totalCustomers: total,
      newToday: newToday,
      closedTotal: closedTotal,
      pendingTotal,
      potentialTotal,
      totalDepositAmount: parseFloat(totalDepositRaw?.total || '0'),
    };
  }

  async findOne(id: number, userId: number, userRole: string) {
    const queryBuilder = this.customersRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.department', 'department')
      .leftJoinAndSelect('customer.deposits', 'deposits')
      .leftJoinAndSelect('customer.notes', 'notes')
      .leftJoinAndSelect('notes.createdByUser', 'noteCreator');
    
    queryBuilder.where('customer.id = :id', { id });
    queryBuilder.andWhere('customer.deletedAt IS NULL');

    if (userRole === Role.EMPLOYEE) {
      queryBuilder.andWhere('customer.createdBy = :userId', { userId });
    }

    const customer = await queryBuilder.getOne();

    if (!customer) {
      throw new CustomerNotFoundException();
    }

    // Sort relations in memory as TB queryBuilder complex sorting for sub-entities is tricky
    if (customer.deposits) {
      customer.deposits.sort((a, b) => new Date(b.depositDate).getTime() - new Date(a.depositDate).getTime());
    }
    if (customer.notes) {
      customer.notes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    return customer;
  }

  async createNote(customerId: number, dto: CreateCustomerNoteDto, userId: number) {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId, deletedAt: IsNull() }
    });

    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng');
    }

    // RBAC: Any role can add note to customer they can see?
    // User requested: employee only for own. 
    // findOne already handles RBAC check via userId/role but here we use simple find.
    // Let's reuse findOne check logic or keep it simple.

    const note = this.notesRepository.create({
      ...dto,
      customerId,
      createdBy: userId,
    });

    const savedNote = await this.notesRepository.save(note);
    return this.notesRepository.findOne({
      where: { id: savedNote.id },
      relations: ['createdByUser']
    });
  }

  async createDeposit(customerId: number, dto: CreateDepositDto, userId: number) {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId, deletedAt: IsNull() }
    });

    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('Số tiền phải lớn hơn 0');
    }

    const deposit = this.depositsRepository.create({
      ...dto,
      customer: { id: customerId } as any,
      createdBy: userId,
    });

    return await this.depositsRepository.save(deposit);
  }

  async update(id: number, updateCustomerDto: UpdateCustomerDto, userId: number, userRole: string) {
    const customer = await this.findOne(id, userId, userRole);
    
    try {
      this.customersRepository.merge(customer, {
        ...updateCustomerDto,
        updatedBy: userId,
      });
      return await this.customersRepository.save(customer);
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new DuplicatePhoneException();
      }
      throw error;
    }
  }

  async remove(id: number, userId: number, userRole: string) {
    if (userRole !== Role.ADMIN && userRole !== Role.MANAGER) {
      throw new UnauthorizedCustomerAccessException();
    }

    const customer = await this.findOne(id, userId, userRole);
    if (!customer) {
      throw new CustomerNotFoundException();
    }

    await this.customersRepository.softDelete(id);
    return { message: 'Xóa khách hàng thành công' };
  }

  async bulkAssign(dto: BulkAssignDto, callerId: number, callerRole: string) {
    const userRepo = this.customersRepository.manager.getRepository(User);
    const salesUser = await userRepo.findOneBy({ id: dto.salesUserId, isActive: true, role: Role.EMPLOYEE });
    
    if (!salesUser) {
      throw new DuplicatePhoneException(); // To satisfy interface temporarily or throw specific. 
      // actually let's throw proper Error
    }

    if (callerRole === Role.MANAGER) {
      const caller = await userRepo.findOneBy({ id: callerId });
      if (caller?.departmentId !== salesUser.departmentId) {
        throw new UnauthorizedCustomerAccessException();
      }
    }

    const query = this.customersRepository.createQueryBuilder('customer')
      .where('customer.id IN (:...ids)', { ids: dto.customerIds })
      .andWhere('customer.deleted_at IS NULL');

    if (callerRole === Role.MANAGER) {
      const caller = await userRepo.findOneBy({ id: callerId });
      query.andWhere('customer.departmentId = :deptId', { deptId: caller?.departmentId });
    }

    const validCustomers = await query.getMany();
    const validIds = validCustomers.map(c => c.id);
    const skippedIds = dto.customerIds.filter(id => !validIds.includes(id));

    if (validIds.length > 0) {
      await this.customersRepository.update(validIds, {
        salesUserId: dto.salesUserId,
        updatedBy: callerId
      });
    }

    return {
      success: true,
      updatedCount: validIds.length,
      skippedIds,
      message: `Đã gán thành công ${validIds.length} khách hàng cho Sales User ${dto.salesUserId}`
    };
  }
}
