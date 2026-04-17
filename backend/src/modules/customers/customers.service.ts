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
import { CustomerAssignment, AssignmentStatus } from '../../database/entities/customer-assignment.entity';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CustomerAccessHelper } from './helpers/customer-access.helper';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    @InjectRepository(CustomerNote)
    private readonly notesRepository: Repository<CustomerNote>,
    @InjectRepository(Deposit)
    private readonly depositsRepository: Repository<Deposit>,
    @InjectRepository(CustomerAssignment)
    private readonly assignmentRepository: Repository<CustomerAssignment>,
    private readonly auditService: AuditService,
  ) {}

  private getTodayVn(): Date {
    const now = new Date();
    // Offset for UTC+7 (Vietnam time)
    const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return vnTime;
  }

  async create(createCustomerDto: CreateCustomerDto, userId: number) {
    const userRepo = this.customersRepository.manager.getRepository(User);

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
        phone: createCustomerDto.phone?.trim() === '' ? null : createCustomerDto.phone,
        createdById: userId,
        createdBy_OLD: userId, // ← Populate legacy NOT NULL column
        inputDate: createCustomerDto.inputDate ? new Date(createCustomerDto.inputDate) : today,
        assignedDate: createCustomerDto.assignedDate 
          ? new Date(createCustomerDto.assignedDate) 
          : (createCustomerDto.salesUserId ? today : null),
        closedDate: createCustomerDto.closedDate ? new Date(createCustomerDto.closedDate) : null,
      } as any);
      const saved = await this.customersRepository.save(customer);

      await this.auditService.logAction(
        userId,
        'CREATE_CUSTOMER',
        'customer',
        (saved as any).id,
        null,
        saved,
      );

      return saved;
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new DuplicatePhoneException();
      }
      throw error;
    }
  }

  async findAll(filters: CustomerFiltersDto, userId: number, userRole: string) {
    const { 
      page = 1, 
      limit = 20, 
      sortField = 'createdAt', 
      sortOrder = 'DESC',
      search,
      source,
      status,
      salesUserId,
      departmentId,
      dateFrom,
      dateTo
    } = filters;

    const queryBuilder = this.customersRepository.createQueryBuilder('customer');

    queryBuilder.leftJoinAndSelect('customer.salesUser', 'salesUser');
    queryBuilder.leftJoinAndSelect('customer.department', 'department');
    queryBuilder.leftJoinAndSelect('customer.createdBy', 'createdBy');
    queryBuilder.leftJoinAndSelect('customer.updatedBy', 'updatedBy');

    queryBuilder.where('customer.deletedAt IS NULL');

    // RBAC
    CustomerAccessHelper.applyExtendedAccessFilter(queryBuilder, userId, userRole);

    // Search
    if (search) {
      const searchLower = search.trim().toLowerCase();
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(customer.name) LIKE :search', { search: `%${searchLower}%` })
            .orWhere('customer.phone LIKE :search', { search: `%${searchLower}%` })
            .orWhere('LOWER(customer.email) LIKE :search', { search: `%${searchLower}%` })
            .orWhere('LOWER(customer.campaign) LIKE :search', { search: `%${searchLower}%` });
        }),
      );
    }

    // Basic Filters
    if (source) {
      queryBuilder.andWhere('customer.source = :source', { source });
    }
    if (status) {
      queryBuilder.andWhere('customer.status = :status', { status });
    }
    if (salesUserId) {
      queryBuilder.andWhere('customer.salesUserId = :salesUserId', { salesUserId });
    }
    if (departmentId) {
      queryBuilder.andWhere('customer.departmentId = :departmentId', { departmentId });
    }
    
    // Date Filters
    if (dateFrom) {
      queryBuilder.andWhere('customer.createdAt >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      queryBuilder.andWhere('customer.createdAt <= :dateTo', { dateTo });
    }

    // Calculate and alias the deposit sum based on date range (or default 30 days)
    const depositSubQuery = this.depositsRepository.createQueryBuilder('deposit')
      .select('SUM(deposit.amount)')
      .where('deposit.customerId = customer.id');

    if (dateFrom) {
      depositSubQuery.andWhere('deposit.depositDate >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      depositSubQuery.andWhere('deposit.depositDate <= :dateTo', { dateTo });
    } else if (!dateFrom) {
      // Default: 30 days
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() - 30);
      const thirtyDaysAgo = thirtyDays.toISOString().split('T')[0];
      depositSubQuery.andWhere('deposit.depositDate >= :thirtyDaysAgo', { thirtyDaysAgo });
    }

    queryBuilder.addSelect(`(${depositSubQuery.getQuery()})`, 'totalDepositSum');
    queryBuilder.setParameters(depositSubQuery.getParameters());

    // Sorting
    if (sortField === 'name') {
      queryBuilder.orderBy('customer.name', sortOrder);
    } else if (sortField === 'status') {
      queryBuilder.orderBy('customer.status', sortOrder);
    } else if (sortField === 'phone') {
      queryBuilder.orderBy('customer.phone', sortOrder);
    } else if (sortField === 'totalDeposit30Days') {
      // Sort by the calculated sum
      queryBuilder.orderBy('totalDepositSum', sortOrder);
    } else if (sortField === 'inputDate') {
      queryBuilder.orderBy('customer.inputDate', sortOrder);
    } else if (sortField === 'closedDate') {
      queryBuilder.orderBy('customer.closedDate', sortOrder);
    } else {
      queryBuilder.orderBy('customer.createdAt', sortOrder);
    }

    // Pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // Use getRawAndEntities to get both the entity objects and the calculated virtual column
    const { entities, raw } = await queryBuilder.getRawAndEntities();
    const count = await queryBuilder.getCount();

    // Map the raw sum back to each entity
    entities.forEach((customer) => {
      const rawRow = raw.find(r => (r.customer_id || r.id) === customer.id);
      if (rawRow) {
        (customer as any).totalDeposit30Days = parseFloat(rawRow.totalDepositSum || '0');
      } else {
        (customer as any).totalDeposit30Days = 0;
      }
    });

    // Populate activeAssignees for 1:N feature
    if (entities.length > 0) {
      const activeAssignments = await this.assignmentRepository.find({
        where: {
          customerId: Brackets ? undefined : undefined, 
        },
        relations: ['assignedTo'],
      });
      // Workaround because Typeorm Brackets isn't accepted directly in where clause like this usually, let's use QueryBuilder
      const activeAssignmentsQuery = await this.assignmentRepository
        .createQueryBuilder('assignment')
        .leftJoinAndSelect('assignment.assignedTo', 'assignedTo')
        .where('assignment.status = :status', { status: 'active' })
        .andWhere('assignment.customer_id IN (:...ids)', { ids: entities.map(e => e.id) })
        .getMany();

      entities.forEach((customer) => {
        const assignmentsForCustomer = activeAssignmentsQuery.filter(a => a.customerId === customer.id);
        (customer as any).activeAssignees = assignmentsForCustomer.map(a => a.assignedTo);
      });
    }

    return {
      data: entities,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async getStats(userId: number, userRole: string) {
    const queryBuilder = this.customersRepository.createQueryBuilder('customer')
      .where('customer.deletedAt IS NULL');

    // RBAC
    CustomerAccessHelper.applyExtendedAccessFilter(queryBuilder, userId, userRole);

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

    CustomerAccessHelper.applyExtendedAccessFilter(depositsQuery, userId, userRole);

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
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .leftJoinAndSelect('customer.updatedBy', 'updatedBy');
    
    queryBuilder.where('customer.id = :id', { id });
    queryBuilder.andWhere('customer.deletedAt IS NULL');

    CustomerAccessHelper.applyExtendedAccessFilter(queryBuilder, userId, userRole);

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

    const activeAssignments = await this.assignmentRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.assignedTo', 'assignedTo')
      .where('assignment.status = :status', { status: 'active' })
      .andWhere('assignment.customer_id = :id', { id })
      .getMany();

    (customer as any).activeAssignees = activeAssignments.map((a) => a.assignedTo);

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

    await this.auditService.logAction(
      userId,
      'CREATE_NOTE',
      'customer_note',
      (savedNote as any).id,
      null,
      savedNote,
    );

    return this.notesRepository.findOne({
      where: { id: (savedNote as any).id },
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

    const savedDeposit = await this.depositsRepository.save(deposit);

    await this.auditService.logAction(
      userId,
      'CREATE_DEPOSIT',
      'deposit',
      (savedDeposit as any).id,
      null,
      savedDeposit,
    );

    return savedDeposit;
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
    
    if (!CustomerAccessHelper.canUpdate(customer, userId, userRole)) {
      throw new UnauthorizedCustomerAccessException('Bạn chỉ có quyền cập nhật khách hàng mà bạn sở hữu hoặc được giao.');
    }

    const today = this.getTodayVn();
    const todayStr = today.toISOString().split('T')[0];
    
    // Step 1: Handle salesUserId assignment explicitly (Case B)
    if (updateCustomerDto.salesUserId === null) {
      customer.salesUser = null;
      customer.salesUserId = null;
    } else if (updateCustomerDto.salesUserId !== undefined && updateCustomerDto.salesUserId !== customer.salesUserId) {
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

    // Step 2: Handle departmentId assignment explicitly
    if (updateCustomerDto.departmentId === null) {
      customer.department = null;
      customer.departmentId = null;
    } else if (updateCustomerDto.departmentId !== undefined) {
      customer.departmentId = updateCustomerDto.departmentId;
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
        phone: updateCustomerDto.phone?.trim() === '' ? null : updateCustomerDto.phone,
        updatedById: userId,
        updatedBy_OLD: userId, // ← Populate legacy nullable or NOT NULL column
      } as any);
      
      // FIX For TypeORM relation precedence: Ensure the actual relation is updated
      customer.updatedBy = { id: userId } as User;
      
      const saved = await this.customersRepository.save(customer);
      await this.auditService.logAction(
        userId,
        'UPDATE_CUSTOMER',
        'customer',
        (saved as any).id,
        null,
        saved,
      );
      return saved;
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new DuplicatePhoneException();
      }
      throw error;
    }
  }

  async remove(id: number, userId: number, userRole: string) {
    const customer = await this.findOne(id, userId, userRole);
    if (!customer) {
      throw new CustomerNotFoundException();
    }

    if (!CustomerAccessHelper.canDelete(customer, userId, userRole)) {
      throw new UnauthorizedCustomerAccessException('Chỉ người tạo bản ghi hoặc Admin mới có quyền xóa khách hàng này.');
    }

    await this.customersRepository.softDelete(id);
    await this.auditService.logAction(
      userId,
      'DELETE_CUSTOMER',
      'customer',
      id,
    );
    return { message: 'Xóa khách hàng thành công' };
  }

  async bulkAssign(
    customerIds: number[],
    salesUserIds: number[],
    callerId: number,
    callerRole: string,
    reason?: string,
  ) {
    const userRepo = this.customersRepository.manager.getRepository(User);
    
    // Validate target users exist and are active
    const targetUsers = await userRepo.find({
      where: salesUserIds.map(id => ({ id, isActive: true }))
    });
    
    if (targetUsers.length !== salesUserIds.length) {
      const foundIds = targetUsers.map(u => u.id);
      const missing = salesUserIds.filter(id => !foundIds.includes(id));
      throw new BadRequestException(`Cảnh báo: Một số Sales User không tồn tại hoặc bị khóa: ${missing.join(', ')}`);
    }

    // Removed department check for bulk assign as visibility is strictly owned
    // Managers and Assistants can assign customers they own to anyone.

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const today = this.getTodayVn();

    for (const customerId of customerIds) {
      try {
        const customer = await this.customersRepository.findOne({
          where: { id: customerId, deletedAt: IsNull() }
        });
        
        if (!customer) {
          results.errors.push(`Khách hàng ID ${customerId} không tồn tại`);
          results.failed++;
          continue;
        }

        // Authorization check: Must be Admin/Manager OR Primary Sales OR Creator of unassigned data
        if (callerRole !== Role.ADMIN && callerRole !== Role.MANAGER) {
          const isUnassignedCreator = (customer.salesUserId === null && customer.createdById === callerId);
          const isPrimarySales = (customer.salesUserId === callerId);

          if (!isUnassignedCreator && !isPrimarySales) {
            throw new ForbiddenException(`Bạn không có quyền chia khách hàng ID ${customerId} không thuộc quản lý của bạn.`);
          }
        }

        // 1:N Assignment Logic
        for (const targetUserId of salesUserIds) {
          const existing = await this.assignmentRepository.findOneBy({
            customerId: customer.id,
            assignedToId: targetUserId,
            status: AssignmentStatus.ACTIVE,
          });

          if (!existing) {
            await this.assignmentRepository.save(
              this.assignmentRepository.create({
                customerId: customer.id,
                assignedById: callerId,
                assignedToId: targetUserId,
                previousAssigneeId: customer.salesUserId || null,
                status: AssignmentStatus.ACTIVE,
                reason: reason || 'Bulk assign',
              })
            );
          }
        }

        // Backward compatibility: Set primary owner if none exists
        if (!customer.salesUserId && salesUserIds.length > 0) {
          customer.salesUserId = salesUserIds[0];
          if (!customer.assignedDate) {
            customer.assignedDate = today;
          }
          customer.updatedById = callerId;
          await this.customersRepository.save(customer);
        }

        await this.auditService.logAction(
          callerId,
          'ASSIGN_CUSTOMER',
          'customer',
          customerId,
          null,
          { assignedToIds: salesUserIds },
        );

        results.success++;
      } catch (err: any) {
        results.errors.push(`Khách hàng ID ${customerId}: ${err.message}`);
        results.failed++;
      }
    }

    return {
      ...results,
      message: `Đã xử lý xong gán data. Thành công: ${results.success}, Thất bại: ${results.failed}`
    };
  }

  /** Lấy danh sách khách chưa assign (salesUserId IS NULL) */
  async getUnassigned(
    filters: CustomerFiltersDto,
    userId: number,
    userRole: string,
  ) {
    const { page = 1, limit = 20, search, source, creatorId } = filters;

    const qb = this.customersRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .leftJoinAndSelect('customer.updatedBy', 'updatedBy')
      .where('customer.deletedAt IS NULL');

    // Khách hàng chưa có Primary HOẶC người dùng đang là Primary Sales
    qb.andWhere(new Brackets(q => {
      q.where('customer.salesUserId IS NULL')
       .orWhere('customer.salesUserId = :userId', { userId });
    }));

    if (userRole !== Role.ADMIN && userRole !== Role.MANAGER) {
      // User thường chỉ thấy KH chưa Primary NẾU họ tạo ra, HOẶC KH họ là Primary
      qb.andWhere(new Brackets(q => {
        q.where('customer.salesUserId IS NULL AND customer.createdById = :userId', { userId })
         .orWhere('customer.salesUserId = :userId', { userId });
      }));
    }

    // Optional: filter by data owner (creator)
    if (creatorId) {
      qb.andWhere('customer.createdById = :creatorId', { creatorId });
    }

    if (source) {
      qb.andWhere('customer.source = :source', { source });
    }

    if (search) {
      const s = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets(q =>
          q.where('LOWER(customer.name) LIKE :s', { s })
           .orWhere('customer.phone LIKE :s', { s }),
        ),
      );
    }

    qb.orderBy('customer.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [customers, total] = await qb.getManyAndCount();
    return { 
      customers, 
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /** Lịch sử gán data của 1 khách hàng */
  async getAssigned(params: {
    page: number;
    limit: number;
    salesUserId?: number | null;
    sourceUserId?: number | null;
    search?: string;
  }) {
    const { page, limit, salesUserId, sourceUserId, search } = params;
    const skip = (page - 1) * limit;

    const query = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .where('customer.deletedAt IS NULL')
      .andWhere('customer.salesUserId IS NOT NULL'); // Đã assign

    if (salesUserId) {
      query.andWhere('customer.salesUserId = :salesUserId', { salesUserId });
    }

    if (sourceUserId) {
      query.andWhere('customer.createdById = :sourceUserId', { sourceUserId });
    }

    if (search?.trim()) {
      const s = `%${search.trim().toLowerCase()}%`;
      query.andWhere(
        new Brackets((qb) => {
          qb.where('LOWER(customer.name) LIKE :s', { s })
            .orWhere('customer.phone LIKE :s', { s });
        }),
      );
    }

    const [customers, total] = await query
      .orderBy('customer.updatedAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Lịch sử gán data của 1 khách hàng */
  async getAssignmentHistory(customerId: number) {
    return this.assignmentRepository.find({
      where: { customerId },
      relations: ['assignedBy', 'assignedTo', 'previousAssignee', 'reclaimedBy'],
      order: { assignedAt: 'DESC' },
    });
  }

  async getStatsToday(userId: number, userRole: string) {
    const baseQuery = () => this.customersRepository.createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .leftJoinAndSelect('customer.updatedBy', 'updatedBy')
      .where('customer.deletedAt IS NULL');

    let todayQuery = baseQuery()
      .andWhere("DATE(CONVERT_TZ(customer.createdAt, '+00:00', '+07:00')) = CURDATE()");

    let historyQuery = baseQuery()
      .andWhere("DATE(CONVERT_TZ(customer.createdAt, '+00:00', '+07:00')) < CURDATE()");

    CustomerAccessHelper.applyExtendedAccessFilter(todayQuery, userId, userRole);
    CustomerAccessHelper.applyExtendedAccessFilter(historyQuery, userId, userRole);

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

    CustomerAccessHelper.applyExtendedAccessFilter(queryBuilder, userId, userRole);

    const customers = await queryBuilder.orderBy('customer.createdAt', 'DESC').getMany();
    
    return {
      closed: customers.filter(c => c.status === 'closed'),
      notClosed: customers.filter(c => c.status !== 'closed')
    };
  }

  async getAllDepositsStats(
    userId: number, 
    userRole: string, 
    startDate?: string, 
    endDate?: string,
    sortBy: string = 'depositDate',
    sortOrder: 'ASC' | 'DESC' = 'DESC'
  ) {
    const queryBuilder = this.depositsRepository.createQueryBuilder('deposit')
      .leftJoinAndSelect('deposit.customer', 'customer')
      .leftJoinAndSelect('deposit.createdBy', 'createdBy')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .where('customer.deletedAt IS NULL');

    CustomerAccessHelper.applyExtendedAccessFilter(queryBuilder, userId, userRole);

    // Date range filtering on depositDate
    if (startDate) {
      queryBuilder.andWhere('deposit.depositDate >= :startDate', { startDate });
    }
    if (endDate) {
      queryBuilder.andWhere('deposit.depositDate <= :endDate', { endDate });
    }

    // Dynamic sorting
    const sortField = sortBy === 'amount' ? 'deposit.amount' : 'deposit.depositDate';
    queryBuilder.orderBy(sortField, sortOrder);

    return await queryBuilder.getMany();
  }
}
