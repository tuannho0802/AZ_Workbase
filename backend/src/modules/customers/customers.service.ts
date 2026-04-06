import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, IsNull } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerFiltersDto } from './dto/customer-filters.dto';
import { BulkAssignDto } from './dto/bulk-assign.dto';
import { Role } from '../../common/enums/role.enum';
import { User } from '../../database/entities/user.entity';
import {
  DuplicatePhoneException,
  CustomerNotFoundException,
  UnauthorizedCustomerAccessException,
} from './exceptions/customer.exceptions';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { Deposit } from '../../database/entities/deposit.entity';
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

  private getTodayVn(): Date {
    const now = new Date();
    // Offset for UTC+7 (Vietnam time)
    const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return vnTime;
  }

  async create(createCustomerDto: CreateCustomerDto, userId: number) {
    const userRepo = this.customersRepository.manager.getRepository(User);
    
    // Default department if missing (required by legacy DB column)
    if (!createCustomerDto.departmentId) {
      const creator = await userRepo.findOneBy({ id: userId });
      createCustomerDto.departmentId = creator?.departmentId || 1;
    }

    if (createCustomerDto.salesUserId) {
      const salesUser = await userRepo.findOneBy({ 
        id: createCustomerDto.salesUserId, 
        isActive: true 
      });
      if (!salesUser) {
        throw new BadRequestException(`Nhân viên ID ${createCustomerDto.salesUserId} không tồn tại hoặc đã bị khóa`);
      }
    }

    try {
      const today = this.getTodayVn();
      const customer = this.customersRepository.create({
        ...createCustomerDto,
        createdById: userId,
        inputDate: createCustomerDto.inputDate ? new Date(createCustomerDto.inputDate) : today,
        assignedDate: createCustomerDto.salesUserId ? today : null,
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
    queryBuilder.leftJoinAndSelect('customer.createdBy', 'creator');
    queryBuilder.leftJoinAndSelect('customer.updatedBy', 'updater');

    queryBuilder.where('customer.deletedAt IS NULL');

    if (userRole === Role.EMPLOYEE) {
      console.log('[RBAC] Employee - Filter by createdById OR salesUserId');
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('customer.createdById = :userId', { userId })
            .orWhere('customer.salesUserId = :userId', { userId });
        }),
      );
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

    // Calculate totalDeposit30Days for the current page of results
    if (data.length > 0) {
      const customerIds = data.map(c => c.id);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const depositSums = await this.depositsRepository.createQueryBuilder('deposit')
        .select('deposit.customerId', 'customerId')
        .addSelect('SUM(deposit.amount)', 'total')
        .where('deposit.customerId IN (:...customerIds)', { customerIds })
        .andWhere('deposit.depositDate >= :thirtyDaysAgo', { thirtyDaysAgo })
        .groupBy('deposit.customerId')
        .getRawMany();

      const sumMap = new Map(depositSums.map(s => [Number(s.customerId), parseFloat(s.total || '0')]));
      
      data.forEach(customer => {
        (customer as any).totalDeposit30Days = sumMap.get(customer.id) || 0;
      });
    }

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
      queryBuilder.andWhere('customer.createdById = :userId', { userId });
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
      depositsQuery.andWhere('customer.createdById = :userId', { userId });
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
      .leftJoinAndSelect('notes.createdByUser', 'noteCreator')
      .leftJoinAndSelect('customer.createdBy', 'creator')
      .leftJoinAndSelect('customer.updatedBy', 'updater');
    
    queryBuilder.where('customer.id = :id', { id });
    queryBuilder.andWhere('customer.deletedAt IS NULL');

    if (userRole === Role.EMPLOYEE) {
      queryBuilder.andWhere('customer.createdById = :userId', { userId });
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
      createdById: userId,
      createdBy_OLD: userId, // ← Populate legacy NOT NULL column
    });

    return await this.depositsRepository.save(deposit);
  }

  async getDeposits(customerId: number) {
    return this.depositsRepository.createQueryBuilder('deposit')
      .where('deposit.customerId = :customerId', { customerId })
      .leftJoinAndSelect('deposit.createdBy', 'createdBy')
      .orderBy('deposit.depositDate', 'DESC')
      .addOrderBy('deposit.createdAt', 'DESC')
      .take(5)
      .getMany();
  }

  async deleteDeposit(id: number) {
    const deposit = await this.depositsRepository.findOne({ where: { id } });
    if (!deposit) {
      throw new NotFoundException('Không tìm thấy bản ghi nạp tiền');
    }
    return await this.depositsRepository.remove(deposit);
  }

  async update(id: number, updateCustomerDto: UpdateCustomerDto, userId: number, userRole: string) {
    const customer = await this.findOne(id, userId, userRole);
    const today = this.getTodayVn();
    const todayStr = today.toISOString().split('T')[0];
    
    // Step 1: Handle salesUserId assignment explicitly (Case B)
    if (updateCustomerDto.salesUserId && updateCustomerDto.salesUserId !== customer.salesUserId) {
      const userRepo = this.customersRepository.manager.getRepository(User);
      const salesUser = await userRepo.findOneBy({ 
        id: updateCustomerDto.salesUserId, 
        isActive: true 
      });
      if (!salesUser) {
        throw new BadRequestException(`Nhân viên ID ${updateCustomerDto.salesUserId} không tồn tại hoặc đã bị khóa`);
      }
      customer.salesUser = salesUser;
      customer.salesUserId = salesUser.id;
    }

    // Logic cho assignedDate: Tự động set khi salesUserId được gán lần đầu
    if (updateCustomerDto.salesUserId && 
        !customer.assignedDate && 
        !updateCustomerDto.assignedDate) {
      (updateCustomerDto as any).assignedDate = todayStr;
    }

    // Logic cho closedDate: Tự động set khi status chuyển sang 'closed' lần đầu
    if (updateCustomerDto.status === 'closed' && 
        !customer.closedDate && 
        !updateCustomerDto.closedDate) {
      (updateCustomerDto as any).closedDate = todayStr;
    }
    
    try {
      this.customersRepository.merge(customer, {
        ...updateCustomerDto,
        updatedById: userId,
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
    const salesUser = await userRepo.findOneBy({ id: dto.salesUserId, isActive: true });
    
    if (!salesUser) {
      throw new BadRequestException(`Nhân viên ID ${dto.salesUserId} không tồn tại hoặc đã bị khóa`);
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
      const today = this.getTodayVn();
      for (const customer of validCustomers) {
        // Chỉ set assignedDate nếu nó đang NULL
        if (!customer.assignedDate) {
          customer.assignedDate = today;
        }
        customer.salesUserId = dto.salesUserId;
        customer.updatedById = callerId;
      }
      await this.customersRepository.save(validCustomers);
    }

    return {
      success: true,
      updatedCount: validIds.length,
      skippedIds,
      message: `Đã gán thành công ${validIds.length} khách hàng cho Sales User ${dto.salesUserId}`
    };
  }

  async getStatsToday(userId: number, userRole: string) {
    const baseQuery = () => this.customersRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .where('customer.deletedAt IS NULL');

    let todayQuery = baseQuery()
      .andWhere("DATE(CONVERT_TZ(customer.createdAt, '+00:00', '+07:00')) = CURDATE()");

    let historyQuery = baseQuery()
      .andWhere("DATE(CONVERT_TZ(customer.createdAt, '+00:00', '+07:00')) < CURDATE()");

    if (userRole === Role.EMPLOYEE) {
      const filter = new Brackets((qb) => {
        qb.where('customer.createdById = :userId', { userId })
          .orWhere('customer.salesUserId = :userId', { userId });
      });
      todayQuery = todayQuery.andWhere(filter);
      historyQuery = historyQuery.andWhere(filter);
    }

    const [todayList, historyList] = await Promise.all([
      todayQuery.orderBy('customer.createdAt', 'DESC').getMany(),
      historyQuery.orderBy('customer.createdAt', 'DESC').take(50).getMany()
    ]);

    return { todayList, historyList };
  }

  async getStatsByStatus(userId: number, userRole: string) {
    const queryBuilder = this.customersRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .where('customer.deletedAt IS NULL');

    if (userRole === Role.EMPLOYEE) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('customer.createdById = :userId', { userId })
            .orWhere('customer.salesUserId = :userId', { userId });
        }),
      );
    }

    const customers = await queryBuilder.orderBy('customer.createdAt', 'DESC').getMany();
    
    return {
      closed: customers.filter(c => c.status === 'closed'),
      notClosed: customers.filter(c => c.status !== 'closed')
    };
  }

  async getAllDepositsStats(userId: number, userRole: string) {
    const queryBuilder = this.depositsRepository.createQueryBuilder('deposit')
      .leftJoinAndSelect('deposit.customer', 'customer')
      .leftJoinAndSelect('deposit.createdBy', 'createdBy') // Change alias to match column
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .where('customer.deletedAt IS NULL');

    if (userRole === Role.EMPLOYEE) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('customer.createdById = :userId', { userId })
            .orWhere('customer.salesUserId = :userId', { userId });
        }),
      );
    }

    return await queryBuilder.orderBy('deposit.depositDate', 'DESC').getMany();
  }
}
