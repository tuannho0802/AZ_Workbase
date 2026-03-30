import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerFiltersDto } from './dto/customer-filters.dto';
import { Role } from '../../common/enums/role.enum';
import {
  DuplicatePhoneException,
  CustomerNotFoundException,
  UnauthorizedCustomerAccessException,
} from './exceptions/customer.exceptions';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
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

  async findOne(id: number, userId: number, userRole: string) {
    const queryBuilder = this.customersRepository.createQueryBuilder('customer');
    queryBuilder.leftJoinAndSelect('customer.salesUser', 'salesUser');
    queryBuilder.leftJoinAndSelect('customer.department', 'department');
    queryBuilder.leftJoinAndSelect('customer.deposits', 'deposits');
    
    queryBuilder.where('customer.id = :id', { id });
    queryBuilder.andWhere('customer.deletedAt IS NULL');

    if (userRole === Role.EMPLOYEE) {
      queryBuilder.andWhere('customer.createdBy = :userId', { userId });
    }

    const customer = await queryBuilder.getOne();

    if (!customer) {
      throw new CustomerNotFoundException();
    }

    return customer;
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
}
