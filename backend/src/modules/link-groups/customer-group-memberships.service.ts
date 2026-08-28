import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';

export interface GroupMembershipRow {
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  groupId: number;
  groupName: string;
  groupUrl: string;
  joined: boolean;
  joinedAt: Date | null;
}

@Injectable()
export class CustomerGroupMembershipsService {
  constructor(
    @InjectRepository(CustomerGroupMembership)
    private readonly membershipRepo: Repository<CustomerGroupMembership>,
    @InjectRepository(LinkGroup)
    private readonly groupRepo: Repository<LinkGroup>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  /**
   * Cổng gác quyền - dùng CHUNG `CustomerAccessHelper.applyViewFilter()` với
   * module Customers (theo PERMISSIONS.md mục 1, quy tắc #2: "1 nguồn áp
   * filter duy nhất"). ⚠️ FIX PERMISSIONS.md mục 2.1/4.0b: trước đây 2
   * endpoint của controller này chỉ có `JwtAuthGuard`, KHÔNG check sở hữu -
   * ai đăng nhập cũng xem/sửa được checklist "đã join nhóm" của customer
   * bất kỳ, không riêng phạm vi của mình.
   */
  private async assertCustomerAccessible(
    customerId: number,
    userId: number,
    userRole: string,
  ): Promise<void> {
    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .select('customer.id')
      .where('customer.id = :id', { id: customerId })
      .andWhere('customer.deletedAt IS NULL');

    CustomerAccessHelper.applyViewFilter(qb, userId, userRole);

    const found = await qb.getOne();
    if (!found) {
      throw new NotFoundException('Không tìm thấy khách hàng');
    }
  }

  /**
   * Trả về TOÀN BỘ group đang active (kèm category), ghép với trạng thái
   * "đã join" của 1 customer cụ thể - dùng LEFT JOIN nên group nào customer
   * CHƯA có row membership vẫn hiện ra với joined=false (thay vì bị thiếu
   * khỏi danh sách) - đúng ý UI "checklist đầy đủ mọi nhóm, tick được ngay".
   */
  async getMembershipsForCustomer(
    customerId: number,
    userId: number,
    userRole: string,
  ): Promise<GroupMembershipRow[]> {
    await this.assertCustomerAccessible(customerId, userId, userRole);

    const customer = await this.customerRepo.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('Không tìm thấy khách hàng');
    }

    const rows = await this.groupRepo
      .createQueryBuilder('g')
      .innerJoin('g.category', 'c')
      .leftJoin(
        CustomerGroupMembership,
        'm',
        'm.group_id = g.id AND m.customer_id = :customerId',
        { customerId },
      )
      .where('g.isActive = true')
      .select([
        'c.id AS categoryId',
        'c.name AS categoryName',
        'c.color AS categoryColor',
        'g.id AS groupId',
        'g.name AS groupName',
        'g.url AS groupUrl',
        'COALESCE(m.joined, false) AS joined',
        'm.joined_at AS joinedAt',
      ])
      .orderBy('c.sort_order', 'ASC')
      .addOrderBy('g.sort_order', 'ASC')
      .getRawMany();

    // MySQL trả boolean dạng 0/1 và cột JOIN từ raw query, ép kiểu lại cho
    // đúng type khai báo (getRawMany không tự áp transformer của entity).
    return rows.map((r) => ({
      categoryId: Number(r.categoryId),
      categoryName: r.categoryName,
      categoryColor: r.categoryColor,
      groupId: Number(r.groupId),
      groupName: r.groupName,
      groupUrl: r.groupUrl,
      joined: !!Number(r.joined),
      joinedAt: r.joinedAt ? new Date(r.joinedAt) : null,
    }));
  }

  /**
   * Bật/tắt trạng thái "đã join" của 1 customer với 1 group - upsert (tạo
   * mới nếu chưa có row, cập nhật nếu đã có).
   */
  async setMembership(
    customerId: number,
    groupId: number,
    joined: boolean,
    userId: number,
    userRole: string,
  ): Promise<CustomerGroupMembership> {
    await this.assertCustomerAccessible(customerId, userId, userRole);

    const [customer, group] = await Promise.all([
      this.customerRepo.findOne({ where: { id: customerId } }),
      this.groupRepo.findOne({ where: { id: groupId } }),
    ]);
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    if (!group) throw new NotFoundException('Không tìm thấy nhóm này');

    let membership = await this.membershipRepo.findOne({ where: { customerId, groupId } });

    if (!membership) {
      membership = this.membershipRepo.create({ customerId, groupId });
    }

    membership.joined = joined;
    membership.joinedAt = joined ? new Date() : null;
    membership.updatedBy = userId;

    return this.membershipRepo.save(membership);
  }
}