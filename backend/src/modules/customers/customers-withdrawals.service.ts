import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { Withdrawal } from '../../database/entities/withdrawal.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import { AuditService } from '../audit/audit.service';
import { CustomerNotFoundException } from './exceptions/customer.exceptions';
import { CustomerAccessHelper } from './helpers/customer-access.helper';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { UpdateWithdrawalNoteDto } from './dto/update-withdrawal-note.dto';

/** Số phiếu rút trả về tối đa cho 1 khách (mới nhất trước). */
export const WITHDRAWALS_LIST_LIMIT = 50;

/**
 * Phiếu RÚT tiền của khách hàng (PLAN_WITHDRAWAL_LEAVE_EXPORT, Phase W2). Song song với luồng nạp tiền trong
 * `CustomersService` nhưng tách service riêng cho đỡ phình file. Mọi thao tác đi qua cùng cổng phạm vi
 * `CustomerAccessHelper.applyViewFilter()` (nguồn chân lý duy nhất của phạm vi khách hàng); ngoài phạm vi -> 404.
 */
@Injectable()
export class CustomersWithdrawalsService {
  constructor(
    @InjectRepository(Withdrawal)
    private readonly withdrawalsRepository: Repository<Withdrawal>,
    @InjectRepository(Customer)
    private readonly customersRepository: Repository<Customer>,
    private readonly auditService: AuditService,
    @InjectRepository(Deposit)
    private readonly depositsRepository: Repository<Deposit>,
  ) {}

  private async assertCustomerAccessible(
    customerId: number,
    userId: number,
    userRole: string,
    scope?: string | null,
  ): Promise<void> {
    const qb = this.customersRepository
      .createQueryBuilder('customer')
      .select('customer.id')
      .where('customer.id = :id', { id: customerId })
      .andWhere('customer.deletedAt IS NULL');
    CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);
    const found = await qb.getOne();
    if (!found) {
      throw new CustomerNotFoundException();
    }
  }

  /** Ảnh chụp ghi audit: chỉ field có nghĩa khi xem lịch sử (createdBy luôn trùng "Người thực hiện"). */
  private buildSnapshot(w: Withdrawal): Record<string, unknown> {
    return { amount: w.amount, withdrawalDate: w.withdrawalDate, broker: w.broker, note: w.note };
  }

  private loadWithCreator(id: number) {
    return this.withdrawalsRepository
      .createQueryBuilder('withdrawal')
      .leftJoin('withdrawal.createdBy', 'createdBy')
      .addSelect(['createdBy.id', 'createdBy.name'])
      .where('withdrawal.id = :id', { id })
      .getOne();
  }

  async create(customerId: number, dto: CreateWithdrawalDto, userId: number, userRole: string, scope?: string | null) {
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);

    const note = (dto.note ?? '').trim();
    const broker = (dto.broker ?? '').trim();
    const saved = await this.withdrawalsRepository.save(
      this.withdrawalsRepository.create({
        customerId,
        amount: dto.amount,
        // Cột `date`: chỉ lấy YYYY-MM-DD (IsDateString cho phép cả chuỗi ISO có giờ) - tránh lệch múi giờ.
        withdrawalDate: dto.withdrawalDate.slice(0, 10),
        broker: broker === '' ? null : broker,
        note: note === '' ? null : note,
        createdById: userId,
      }),
    );

    this.auditService.logActionAsync(userId, 'CREATE_WITHDRAWAL', 'withdrawal', saved.id, null, this.buildSnapshot(saved));
    return this.loadWithCreator(saved.id);
  }

  async list(customerId: number, userId: number, userRole: string, scope?: string | null) {
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);
    return this.withdrawalsRepository
      .createQueryBuilder('withdrawal')
      .leftJoin('withdrawal.createdBy', 'createdBy')
      .addSelect(['createdBy.id', 'createdBy.name'])
      .where('withdrawal.customerId = :customerId', { customerId })
      .orderBy('withdrawal.withdrawalDate', 'DESC')
      .addOrderBy('withdrawal.id', 'DESC')
      .limit(WITHDRAWALS_LIST_LIMIT)
      .getMany();
  }

  /** Sửa GHI CHÚ phiếu rút. "Ai sửa" nằm ở audit log (`UPDATE_WITHDRAWAL_NOTE`, kèm note cũ/mới). */
  async updateNote(
    withdrawalId: number,
    dto: UpdateWithdrawalNoteDto,
    userId: number,
    userRole: string,
    scope?: string | null,
  ) {
    const withdrawal = await this.withdrawalsRepository.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) {
      throw new NotFoundException('Không tìm thấy bản ghi rút tiền');
    }
    await this.assertCustomerAccessible(withdrawal.customerId, userId, userRole, scope);

    const before = this.buildSnapshot(withdrawal);
    const newNote = (dto.note ?? '').trim();
    withdrawal.note = newNote === '' ? null : newNote;
    await this.withdrawalsRepository.save(withdrawal);

    this.auditService.logActionAsync(
      userId,
      'UPDATE_WITHDRAWAL_NOTE',
      'withdrawal',
      withdrawalId,
      before,
      this.buildSnapshot(withdrawal),
    );
    return this.loadWithCreator(withdrawalId);
  }

  async remove(withdrawalId: number, userId: number, userRole: string, scope?: string | null) {
    const withdrawal = await this.withdrawalsRepository.findOne({ where: { id: withdrawalId } });
    if (!withdrawal) {
      throw new NotFoundException('Không tìm thấy bản ghi rút tiền');
    }
    await this.assertCustomerAccessible(withdrawal.customerId, userId, userRole, scope);

    const snapshot = this.buildSnapshot(withdrawal);
    await this.withdrawalsRepository.remove(withdrawal);

    this.auditService.logActionAsync(userId, 'DELETE_WITHDRAWAL', 'withdrawal', withdrawalId, snapshot, null);
    return { message: 'Đã xoá bản ghi rút tiền' };
  }

  /**
   * 3 chỉ số TOÀN THỜI GIAN của 1 khách (Drawer chi tiết): Tổng nạp (không tính rút) · Đã rút (chỉ tính rút) ·
   * Nạp thực (= nạp - rút, có thể ÂM). Khác thẻ ở danh sách (theo khung ngày) - đây là tổng đời khách.
   * Không dùng danh sách tối đa 50 phiếu để cộng (sẽ sai khi >50 phiếu): SUM thẳng trong DB.
   */
  async getFinanceSummary(customerId: number, userId: number, userRole: string, scope?: string | null) {
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);
    const [dep, wd] = await Promise.all([
      this.depositsRepository
        .createQueryBuilder('deposit')
        .select('COALESCE(SUM(deposit.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'cnt')
        .where('deposit.customerId = :customerId', { customerId })
        .getRawOne(),
      this.withdrawalsRepository
        .createQueryBuilder('withdrawal')
        .select('COALESCE(SUM(withdrawal.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'cnt')
        .where('withdrawal.customerId = :customerId', { customerId })
        .getRawOne(),
    ]);
    const totalDeposit = parseFloat(dep?.total || '0');
    const totalWithdrawal = parseFloat(wd?.total || '0');
    return {
      totalDeposit,
      totalWithdrawal,
      netDeposit: Math.round((totalDeposit - totalWithdrawal) * 100) / 100,
      depositCount: Number(dep?.cnt ?? 0),
      withdrawalCount: Number(wd?.cnt ?? 0),
    };
  }
}
