import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { LinkGroup } from '../../database/entities/link-group.entity';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { PermissionsService } from '../permissions/permissions.service';
import { Role } from '../../common/enums/role.enum';

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

export interface GroupMembershipsResult {
  items: GroupMembershipRow[];
  /**
   * ⚠️ MỚI (2026-09-08, theo yêu cầu chủ dự án): FE trước đây tự quyết định
   * hiện Switch hay Tag read-only dựa vào 1 permission check DUY NHẤT của
   * TOÀN BỘ role (`can('customer_group_memberships.set')`) - đúng cho biết
   * "role này CÓ quyền set hay không" nhưng KHÔNG biết "CÓ quyền set ĐÚNG
   * KHÁCH HÀNG ĐANG XEM hay không" khi scope='own'/'department' - hậu quả:
   * Employee scope='own' vẫn thấy Switch (nút bấm được) ở data KHÔNG PHẢI
   * của mình, bấm vào mới bị 403 (dù có rollback đúng, nhưng UI hiện sai
   * ngay từ đầu - không "render dynamic theo scope" như yêu cầu).
   *
   * Sửa đúng kiến trúc "BE luôn là nơi chặn thật sự, FE chỉ ẩn UI cho gọn
   * mắt" - trả kèm field `canManage` đã tính SẴN, ĐÚNG cho CHÍNH khách hàng
   * này (không chỉ đúng cho role nói chung), dùng LẠI ĐÚNG 1 nguồn filter
   * `CustomerAccessHelper.applyViewFilter()` với scope của
   * `customer_group_memberships.set` (không phải scope của `customers.view`
   * dùng để xem checklist) - xem `canManageMembership()` bên dưới. FE giờ
   * CHỈ cần đọc field này, không tự suy luận gì thêm.
   */
  canManage: boolean;
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
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Cổng gác quyền - dùng CHUNG `CustomerAccessHelper.applyViewFilter()` với
   * module Customers (theo PERMISSIONS.md mục 1, quy tắc #2: "1 nguồn áp
   * filter duy nhất"). ⚠️ FIX PERMISSIONS.md mục 2.1/4.0b: trước đây 2
   * endpoint của controller này chỉ có `JwtAuthGuard`, KHÔNG check sở hữu -
   * ai đăng nhập cũng xem/sửa được checklist "đã join nhóm" của customer
   * bất kỳ, không riêng phạm vi của mình.
   *
   * ⚠️ FIX BUG THẬT #2 (rà soát dynamic RBAC): bản trước gọi
   * `applyViewFilter(qb, userId, userRole)` - THIẾU tham số `scope` thứ 4,
   * trong khi TOÀN BỘ 13 chỗ gọi khác trong `customers.service.ts` đều
   * truyền đủ. `applyViewFilter()` chỉ tự suy scope từ `userRole` khi
   * `scope` là falsy (fallback dành riêng cho 2 role tĩnh Assistant/Manager
   * - xem JSDoc `CustomerAccessHelper`) - fallback đó KHÔNG áp dụng cho bất
   * kỳ role tuỳ chỉnh nào Admin tự tạo qua trang Phân quyền, khiến role tuỳ
   * chỉnh được cấp `customers.view` scope='all' vẫn bị lọc như thể chỉ có
   * quyền 'own' (giống Employee) ở riêng module này - lệch hẳn với các
   * module khác đã đọc đúng `permissionScope`.
   */
  private async assertCustomerAccessible(
    customerId: number,
    userId: number,
    userRole: string,
    scope: string | null | undefined,
  ): Promise<void> {
    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .select('customer.id')
      .where('customer.id = :id', { id: customerId })
      .andWhere('customer.deletedAt IS NULL');

    CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);

    const found = await qb.getOne();
    if (!found) {
      throw new NotFoundException('Không tìm thấy khách hàng');
    }
  }

  /**
   * Kiểm tra "CÓ được TICK checklist của ĐÚNG khách hàng này không" - khác
   * `assertCustomerAccessible()` (kiểm tra quyền XEM, dùng scope của
   * `customers.view`) - hàm này tự tra riêng permission
   * `customer_group_memberships.set` (không nhận scope qua tham số như
   * `assertCustomerAccessible`, vì route GET chỉ gắn `@RequirePermission
   * ('customers.view')` - `PermissionGuard` KHÔNG tính sẵn scope của 1
   * permission khác chưa được yêu cầu ở route đó).
   */
  private async canManageMembership(
    customerId: number,
    userId: number,
    userRole: string,
    departmentId: number | null | undefined,
  ): Promise<boolean> {
    // Lối thoát hiểm cứng - đồng bộ với PermissionGuard: admin luôn có mọi
    // quyền, bất kể role_permissions đang lưu gì.
    if (userRole === Role.ADMIN) return true;

    const { allowed, scope } = await this.permissionsService.hasPermission(
      userRole,
      'customer_group_memberships.set',
      departmentId,
    );
    if (!allowed) return false;

    const qb = this.customerRepo
      .createQueryBuilder('customer')
      .select('customer.id')
      .where('customer.id = :id', { id: customerId })
      .andWhere('customer.deletedAt IS NULL');
    CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);

    return !!(await qb.getOne());
  }

  /**
   * Trả về TOÀN BỘ group đang active (kèm category), ghép với trạng thái
   * "đã join" của 1 customer cụ thể - dùng LEFT JOIN nên group nào customer
   * CHƯA có row membership vẫn hiện ra với joined=false (thay vì bị thiếu
   * khỏi danh sách) - đúng ý UI "checklist đầy đủ mọi nhóm, tick được ngay".
   *
   * Trả về kèm `canManage` (xem JSDoc `GroupMembershipsResult`) - tính riêng
   * theo `customer_group_memberships.set`, KHÔNG dùng lại `scope` (của
   * `customers.view`) truyền vào tham số thứ 4.
   */
  async getMembershipsForCustomer(
    customerId: number,
    userId: number,
    userRole: string,
    scope: string | null | undefined,
    departmentId?: number | null,
  ): Promise<GroupMembershipsResult> {
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);

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
    const items = rows.map((r) => ({
      categoryId: Number(r.categoryId),
      categoryName: r.categoryName,
      categoryColor: r.categoryColor,
      groupId: Number(r.groupId),
      groupName: r.groupName,
      groupUrl: r.groupUrl,
      joined: !!Number(r.joined),
      joinedAt: r.joinedAt ? new Date(r.joinedAt) : null,
    }));

    const canManage = await this.canManageMembership(customerId, userId, userRole, departmentId);

    return { items, canManage };
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
    scope: string | null | undefined,
  ): Promise<CustomerGroupMembership> {
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);

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