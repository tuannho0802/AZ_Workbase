# NestJS Backend Development Skill - AZWorkbase

## Skill Purpose
Guide development of NestJS backend for AZWorkbase project following strict architectural patterns, security best practices, and maintainability standards.

## When to Use This Skill
- Creating any NestJS module, controller, service, or entity
- Writing API endpoints for AZWorkbase
- Implementing authentication or authorization logic
- Database operations using TypeORM
- Error handling and validation

## Core Principles

### 1. Project Structure (MANDATORY)
```
backend/
├── src/
│   ├── common/               # Shared utilities
│   │   ├── decorators/       # Custom decorators
│   │   ├── filters/          # Exception filters
│   │   ├── guards/           # Auth guards
│   │   ├── interceptors/     # Response interceptors
│   │   └── pipes/            # Validation pipes
│   ├── config/               # Configuration modules
│   │   ├── database.config.ts
│   │   └── jwt.config.ts
│   ├── modules/              # Feature modules
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.module.ts
│   │   │   ├── dto/
│   │   │   ├── guards/
│   │   │   └── strategies/
│   │   ├── customers/
│   │   ├── deposits/
│   │   ├── users/
│   │   └── data-sharing/
│   ├── database/             # Database entities
│   │   ├── entities/
│   │   └── migrations/
│   ├── main.ts
│   └── app.module.ts
├── test/
├── .env.example
├── .env.development
├── .env.production
├── ecosystem.config.js
├── package.json
├── tsconfig.json
└── README.md
```

### 2. Module Development Pattern

**Always follow this sequence:**
1. Create Entity (TypeORM)
2. Create DTOs (Data Transfer Objects)
3. Create Service (Business logic)
4. Create Controller (HTTP layer)
5. Create Module (Dependency injection)
6. Write Unit Tests

**Example - Customer Module:**

```typescript
// 1. Entity (database/entities/customer.entity.ts)
import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, OneToMany, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { User } from './user.entity';
import { Department } from './department.entity';
import { Deposit } from './deposit.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 20 })
  phone: string;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({
    type: 'enum',
    enum: ['Facebook', 'TikTok', 'Google', 'Instagram', 'Other'],
  })
  source: string;

  @Column({ length: 100, nullable: true })
  campaign: string;

  @ManyToOne(() => User, { nullable: false })
  salesUser: User;

  @Column({ name: 'sales_user_id' })
  salesUserId: number;

  @Column({
    type: 'enum',
    enum: ['closed', 'pending', 'potential', 'lost'],
    default: 'pending',
  })
  status: string;

  @Column({ length: 100, nullable: true })
  broker: string;

  @Column({ type: 'date', nullable: true })
  closedDate: Date;

  @ManyToOne(() => Department, { nullable: false })
  department: Department;

  @Column({ name: 'department_id' })
  departmentId: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  @ManyToOne(() => User, { nullable: false })
  createdByUser: User;

  @Column({ name: 'created_by' })
  createdBy: number;

  @ManyToOne(() => User, { nullable: true })
  updatedByUser: User;

  @Column({ name: 'updated_by', nullable: true })
  updatedBy: number;

  @OneToMany(() => Deposit, deposit => deposit.customer)
  deposits: Deposit[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;
}

// 2. DTOs (modules/customers/dto/create-customer.dto.ts)
import { IsString, IsEmail, IsEnum, IsOptional, IsInt, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ example: '0901234567' })
  @IsString()
  @Matches(/^(09|08|07|03|05)[0-9]{8}$/, {
    message: 'Phone must be valid Vietnamese phone number',
  })
  phone: string;

  @ApiProperty({ example: 'customer@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: ['Facebook', 'TikTok', 'Google', 'Instagram', 'Other'] })
  @IsEnum(['Facebook', 'TikTok', 'Google', 'Instagram', 'Other'])
  source: string;

  @ApiProperty({ example: 'Q4 Campaign 2024', required: false })
  @IsOptional()
  @IsString()
  campaign?: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  salesUserId: number;

  @ApiProperty({ enum: ['closed', 'pending', 'potential', 'lost'], default: 'pending' })
  @IsOptional()
  @IsEnum(['closed', 'pending', 'potential', 'lost'])
  status?: string;

  @ApiProperty({ example: 'XM Global', required: false })
  @IsOptional()
  @IsString()
  broker?: string;

  @ApiProperty({ example: '2024-01-15', required: false })
  @IsOptional()
  closedDate?: Date;

  @ApiProperty({ example: 1 })
  @IsInt()
  departmentId: number;

  @ApiProperty({ example: 'VIP customer', required: false })
  @IsOptional()
  @IsString()
  note?: string;
}

// 3. Service (modules/customers/customers.service.ts)
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customersRepository: Repository<Customer>,
  ) {}

  async create(createDto: CreateCustomerDto, userId: number): Promise<Customer> {
    const customer = this.customersRepository.create({
      ...createDto,
      createdBy: userId,
    });
    return await this.customersRepository.save(customer);
  }

  async findAll(userId: number, userRole: string, page = 1, limit = 20, filters: any) {
    const queryBuilder = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.department', 'department')
      .where('customer.deletedAt IS NULL');

    // RBAC: Employee sees only own + shared
    if (userRole === 'employee') {
      queryBuilder.andWhere(
        '(customer.createdBy = :userId OR customer.id IN (SELECT customer_id FROM data_sharing WHERE shared_with_user_id = :userId))',
        { userId }
      );
    }

    // Apply filters
    if (filters.departmentId) {
      queryBuilder.andWhere('customer.departmentId = :departmentId', {
        departmentId: filters.departmentId,
      });
    }

    if (filters.salesUserId) {
      queryBuilder.andWhere('customer.salesUserId = :salesUserId', {
        salesUserId: filters.salesUserId,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('customer.status = :status', { status: filters.status });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(customer.name LIKE :search OR customer.phone LIKE :search OR customer.email LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number, userId: number, userRole: string): Promise<Customer> {
    const customer = await this.customersRepository.findOne({
      where: { id },
      relations: ['salesUser', 'department', 'deposits'],
    });

    if (!customer) {
      throw new NotFoundException(`Customer #${id} not found`);
    }

    // RBAC check
    if (userRole === 'employee') {
      const hasAccess = await this.checkAccess(id, userId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this customer');
      }
    }

    return customer;
  }

  async update(id: number, updateDto: UpdateCustomerDto, userId: number, userRole: string): Promise<Customer> {
    const customer = await this.findOne(id, userId, userRole);

    // Check edit permission for shared data
    if (userRole === 'employee' && customer.createdBy !== userId) {
      const permission = await this.getPermission(id, userId);
      if (permission !== 'edit') {
        throw new ForbiddenException('You only have view permission for this customer');
      }
    }

    Object.assign(customer, updateDto);
    customer.updatedBy = userId;

    return await this.customersRepository.save(customer);
  }

  async remove(id: number, userId: number, userRole: string): Promise<void> {
    const customer = await this.findOne(id, userId, userRole);

    if (userRole === 'employee' && customer.createdBy !== userId) {
      throw new ForbiddenException('You can only delete your own customers');
    }

    await this.customersRepository.softDelete(id);
  }

  private async checkAccess(customerId: number, userId: number): Promise<boolean> {
    const customer = await this.customersRepository.findOne({
      where: { id: customerId },
    });

    if (customer.createdBy === userId) {
      return true;
    }

    // Check if shared
    const shared = await this.customersRepository.query(
      'SELECT 1 FROM data_sharing WHERE customer_id = ? AND shared_with_user_id = ?',
      [customerId, userId]
    );

    return shared.length > 0;
  }

  private async getPermission(customerId: number, userId: number): Promise<string> {
    const result = await this.customersRepository.query(
      'SELECT permission FROM data_sharing WHERE customer_id = ? AND shared_with_user_id = ?',
      [customerId, userId]
    );

    return result[0]?.permission || 'none';
  }
}

// 4. Controller (modules/customers/customers.controller.ts)
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Create new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  create(@Body() createDto: CreateCustomerDto, @Request() req) {
    return this.customersService.create(createDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all customers with filters' })
  @ApiResponse({ status: 200, description: 'List of customers' })
  findAll(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('departmentId') departmentId?: number,
    @Query('salesUserId') salesUserId?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.customersService.findAll(
      req.user.id,
      req.user.role,
      page,
      limit,
      { departmentId, salesUserId, status, search }
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.customersService.findOne(+id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200, description: 'Customer updated' })
  update(@Param('id') id: string, @Body() updateDto: UpdateCustomerDto, @Request() req) {
    return this.customersService.update(+id, updateDto, req.user.id, req.user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete customer (soft delete)' })
  @ApiResponse({ status: 200, description: 'Customer deleted' })
  @Roles('admin', 'manager')
  remove(@Param('id') id: string, @Request() req) {
    return this.customersService.remove(+id, req.user.id, req.user.role);
  }
}

// 5. Module (modules/customers/customers.module.ts)
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { Customer } from '../../database/entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Customer])],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
```

### 3. Authentication & Authorization (CRITICAL)

**JWT Strategy Setup:**

```typescript
// modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
```

**Role Guard:**

```typescript
// common/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.includes(user.role);
  }
}

// common/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
```

### 4. Error Handling (MANDATORY)

**Global Exception Filter:**

```typescript
// common/filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: message,
    };

    // Log error for debugging
    console.error('Exception caught:', {
      ...errorResponse,
      stack: exception instanceof Error ? exception.stack : null,
    });

    response.status(status).json(errorResponse);
  }
}
```

**Register in main.ts:**

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('AZWorkbase API')
    .setDescription('Marketing data management system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT || 3001);
  console.log(`🚀 Server running on port ${process.env.PORT || 3001}`);
}
bootstrap();
```

### 5. Database Migrations (CRITICAL)

**Always use migrations, never sync: true in production**

```typescript
// ormconfig.ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false, // NEVER true in production
  logging: process.env.NODE_ENV === 'development',
};
```

**Create migration:**

```bash
npm run typeorm migration:create -- -n CreateCustomersTable
```

**Run migrations:**

```bash
npm run typeorm migration:run
```

### 6. Validation Rules

**Phone Number:**
- Vietnamese format: `^(09|08|07|03|05)[0-9]{8}$`
- Example: 0901234567

**Email:**
- Use `@IsEmail()` decorator
- Optional field

**Amount (FTD):**
- Positive decimal
- Max 2 decimal places
- Max value: 999,999,999.99

**Date Fields:**
- Use `@IsDateString()` or `@IsDate()`
- Format: YYYY-MM-DD

### 7. Testing Requirements

**Unit Test Template:**

```typescript
// customers.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomersService } from './customers.service';
import { Customer } from '../../database/entities/customer.entity';

describe('CustomersService', () => {
  let service: CustomersService;
  let repository: Repository<Customer>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: getRepositoryToken(Customer),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
    repository = module.get<Repository<Customer>>(getRepositoryToken(Customer));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a customer successfully', async () => {
      const createDto = {
        name: 'Test Customer',
        phone: '0901234567',
        source: 'Facebook',
        salesUserId: 1,
        departmentId: 1,
      };

      const customer = { id: 1, ...createDto };

      mockRepository.create.mockReturnValue(customer);
      mockRepository.save.mockResolvedValue(customer);

      const result = await service.create(createDto, 1);

      expect(result).toEqual(customer);
      expect(mockRepository.create).toHaveBeenCalledWith({
        ...createDto,
        createdBy: 1,
      });
    });
  });
});
```

### 8. Security Checklist

Before any deployment:
- [ ] All passwords hashed with bcrypt (salt rounds: 10)
- [ ] JWT secrets are random and stored in .env
- [ ] SQL injection prevented (using TypeORM parameterized queries)
- [ ] XSS prevented (Helmet middleware)
- [ ] CORS properly configured
- [ ] Rate limiting enabled (10 requests per minute per IP)
- [ ] Input validation on all DTOs
- [ ] Soft delete for sensitive data (no hard deletes)
- [ ] Audit logs for critical actions

**Rate Limiting Setup:**

```typescript
// main.ts
import rateLimit from 'express-rate-limit';

app.use(
  rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
  })
);
```

### 9. Common Mistakes to Avoid

❌ **NEVER:**
- Use `synchronize: true` in production
- Store passwords in plain text
- Skip DTO validation
- Return full error stack traces to client
- Hard delete records (use soft delete)
- Expose internal IDs in URLs without authorization check
- Use `SELECT *` in queries (specify columns)
- Forget to add indexes on foreign keys

✅ **ALWAYS:**
- Use DTOs for all inputs
- Implement proper error handling
- Write unit tests for services
- Use transactions for multi-table operations
- Log errors with context
- Validate user permissions before operations
- Use environment variables for config
- Document API with Swagger

### 10. TypeORM Gotchas & Edge Cases

🚨 **CRITICAL: BooleanTransformer with QueryBuilder**
When using a custom `BooleanTransformer` (e.g. mapping `true/false` to `1/0` for MySQL/SQLite), the Transformer is **NOT** automatically triggered inside `QueryBuilder.where()` bindings.

```typescript
// BAD: This will fail to filter or throw errors because QueryBuilder passes the JS boolean instead of 1/0.
const qb = this.repository.createQueryBuilder('user')
  .where('user.isActive = :active', { active: true }); 

// GOOD: Use Native .find() Object params (Transformers work perfectly here)
const users = await this.repository.find({
  where: { isActive: true } 
});

// ACCEPTABLE (If you MUST use QueryBuilder):
const qb = this.repository.createQueryBuilder('user')
  .where('user.isActive = :active', { active: 1 }); // Manually cast to integer 1 or 0
```

### 11. Performance Optimization

**Query Optimization:**
```typescript
// BAD: N+1 query problem
const customers = await repository.find();
for (const customer of customers) {
  const deposits = await depositsRepository.find({ customerId: customer.id });
}

// GOOD: Single query with JOIN
const customers = await repository.find({
  relations: ['deposits'],
});

// BETTER: Pagination + specific columns
const customers = await repository
  .createQueryBuilder('customer')
  .leftJoinAndSelect('customer.deposits', 'deposits')
  .select(['customer.id', 'customer.name', 'deposits.amount'])
  .skip(0)
  .take(20)
  .getMany();
```

**Caching Strategy:**
```typescript
// For rarely changing data (departments, brokers)
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      ttl: 3600, // 1 hour
      max: 100, // max items in cache
    }),
  ],
})
export class DepartmentsModule {}
```

## Checklist Before Code Commit

- [ ] Code follows NestJS best practices
- [ ] All DTOs have validation decorators
- [ ] Services have error handling
- [ ] Controllers use proper HTTP status codes
- [ ] RBAC checks implemented where needed
- [ ] Unit tests written and passing
- [ ] Swagger documentation added
- [ ] No console.logs (use Logger instead)
- [ ] Environment variables used for config
- [ ] TypeScript types properly defined (no `any`)

## References
- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Best Practices](https://typeorm.io)
- [AZWorkbase Project README](./README_AZWORKBASE_PROJECT.md)

---

### 12. CRM Sales Assignment & Security Logic (MANDATORY)

Follow these patterns when handling customer data sharing and assignment.

### 12.1. Primary vs Shared Ownership
- **Primary Sales:** Stored in `customer.salesUserId`. The one person responsible for the customer.
- **Shared Sales:** Stored in `customer_assignments` table. Multiple people who can assist.
- **Rule:** If a customer has no Primary Sales, the first person gán (assigned) becomes Primary. If they already have one, new persons are always added as Shared.

### 12.2. Secure Data Sharing (RBAC Expansion)
Non-admin users (Employee/Assistant) are allowed to share data **ONLY IF** they own it.
- **Can Share:** 
  1. The user is the `Primary Sales` of the customer.
  2. The user is the `Creator` of the customer record AND it is not yet assigned.
- **Cannot Share:** 
  1. The user is only a `Shared Sales`.
  2. The data belongs to someone else.

**Implementation in Service:**
```typescript
// Authorization check inside bulkAssign
if (callerRole !== Role.ADMIN && callerRole !== Role.MANAGER) {
  const isUnassignedCreator = (customer.salesUserId === null && customer.createdById === callerId);
  const isPrimarySales = (customer.salesUserId === callerId);

  if (!isUnassignedCreator && !isPrimarySales) {
    throw new ForbiddenException(`Access Denied`);
  }
}
```

### 12.3. Querying "Shareable" Data
The `/unassigned` list should include data the user can share to others.
- **Query Logic:** `(customer.salesUserId IS NULL) OR (customer.salesUserId = :userId)`.
- **Note:** Admins see all unassigned data + their own. Managers see all data in their department.

### 13. Audit Logging & Data Attribution (NEW)

🚨 **CRITICAL: TypeORM Relation Precedence in Update**
When updating an entity that has both an ID column (e.g., `updated_by_id`) and a Relation property (e.g., `updatedBy`), TypeORM's `.save()` method may prioritize the loaded relation object over the modified ID property. If the relation was already loaded in memory (e.g., via `findOne`), simply changing the ID might not persist the change.

**Correct Update Pattern:**
```typescript
// service.ts
async update(id: number, dto: any, userId: number) {
  const record = await this.recordRepository.findOne({ where: { id }, relations: ['updatedBy'] });
  
  // 1. Merge DTO (handles raw fields)
  this.recordRepository.merge(record, dto);
  
  // 2. EXPLICITLY set the relation object to ensure persistence
  // Use a partial object with just the ID
  record.updatedBy = { id: userId } as User;
  
  // 3. Save
  return await this.recordRepository.save(record);
}
```

**Standard Audit Logging Instrumentation:**
All critical CRUD operations MUST be logged via `AuditService`.
```typescript
await this.auditService.logAction(
  userId,
  'UPDATE_CUSTOMER', // Action type
  'customer',        // Table/Entity name
  record.id,         // Target record ID
  null,              // Old values (optional)
  record,            // New values
);
```

**Consistent API Aliasing:**
Always use aliases in `leftJoinAndSelect` that match the entity property name to ensure consistent object hydration and avoid frontend mapping errors.
```typescript
// ✅ Good
queryBuilder.leftJoinAndSelect('customer.updatedBy', 'updatedBy');

// ❌ Bad (might cause frontend to look for record.updater instead of record.updatedBy)
queryBuilder.leftJoinAndSelect('customer.updatedBy', 'updater');
```