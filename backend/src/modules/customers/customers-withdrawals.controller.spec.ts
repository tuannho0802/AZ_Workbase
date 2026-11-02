import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomersImportService } from './customers.import.service';
import { CustomersExportService } from './customers-export.service';
import { CustomersInvalidStatsService } from './customers-invalid-stats.service';
import { CustomersPeriodStatsService } from './customers-period-stats.service';
import { CustomersBulkService } from './customers-bulk.service';
import { CustomersWithdrawalsService } from './customers-withdrawals.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PERMISSION_KEY } from '../../common/decorators/require-permission.decorator';

/**
 * Khoá thứ tự route + quyền của 4 endpoint rút tiền: `PATCH/DELETE withdrawals/:id` (2 đoạn) phải tới đúng
 * service rút tiền, KHÔNG bị `@Patch(':id')`/`@Delete(':id')` của khách hàng nuốt; quyền dùng lại key có sẵn.
 */
describe('CustomersController - routes rút tiền', () => {
  let app: INestApplication;
  const customers = { update: jest.fn(), remove: jest.fn() };
  const withdrawals = {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    list: jest.fn().mockResolvedValue([]),
    updateNote: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
    getFinanceSummary: jest.fn().mockResolvedValue({}),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        { provide: CustomersService, useValue: customers },
        { provide: CustomersImportService, useValue: {} },
        { provide: CustomersExportService, useValue: {} },
        { provide: CustomersInvalidStatsService, useValue: {} },
        { provide: CustomersPeriodStatsService, useValue: {} },
        { provide: CustomersBulkService, useValue: {} },
        { provide: CustomersWithdrawalsService, useValue: withdrawals },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.use((req: any, _res: any, next: any) => { req.user = { id: 7, role: 'employee' }; req.permissionScope = 'own'; next(); });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('POST :id/withdrawals -> service.create(+id, dto, userId, role, scope)', async () => {
    await request(app.getHttpServer()).post('/customers/5/withdrawals').send({ amount: 10, withdrawalDate: '2026-11-02' }).expect(201);
    expect(withdrawals.create).toHaveBeenCalledWith(5, expect.objectContaining({ amount: 10 }), 7, 'employee', 'own');
  });

  it('POST với dữ liệu sai -> 400, không gọi service', async () => {
    await request(app.getHttpServer()).post('/customers/5/withdrawals').send({ amount: 0, withdrawalDate: '2026-11-02' }).expect(400);
    expect(withdrawals.create).not.toHaveBeenCalled();
  });

  it('GET :id/withdrawals -> service.list', async () => {
    await request(app.getHttpServer()).get('/customers/5/withdrawals').expect(200);
    expect(withdrawals.list).toHaveBeenCalledWith(5, 7, 'employee', 'own');
  });

  it('PATCH withdrawals/:id -> service rút tiền, KHÔNG phải customers.update', async () => {
    await request(app.getHttpServer()).patch('/customers/withdrawals/3').send({ note: 'x' }).expect(200);
    expect(withdrawals.updateNote).toHaveBeenCalledWith(3, { note: 'x' }, 7, 'employee', 'own');
    expect(customers.update).not.toHaveBeenCalled();
  });

  it('DELETE withdrawals/:id -> service rút tiền, KHÔNG phải customers.remove', async () => {
    await request(app.getHttpServer()).delete('/customers/withdrawals/3').expect(200);
    expect(withdrawals.remove).toHaveBeenCalledWith(3, 7, 'employee', 'own');
    expect(customers.remove).not.toHaveBeenCalled();
  });

  it('GET :id/finance-summary -> service.getFinanceSummary (không bị GET :id nuốt)', async () => {
    await request(app.getHttpServer()).get('/customers/5/finance-summary').expect(200);
    expect(withdrawals.getFinanceSummary).toHaveBeenCalledWith(5, 7, 'employee', 'own');
  });

  it('quyền dùng lại key có sẵn: edit / view / edit / delete (không key mới)', () => {
    const proto = CustomersController.prototype as any;
    const key = (fn: string) => Reflect.getMetadata(PERMISSION_KEY, proto[fn]);
    expect(key('createWithdrawal')).toBe('customers.edit');
    expect(key('getWithdrawals')).toBe('customers.view');
    expect(key('updateWithdrawalNote')).toBe('customers.edit');
    expect(key('deleteWithdrawal')).toBe('customers.delete');
    expect(key('getFinanceSummary')).toBe('customers.view');
  });
});
