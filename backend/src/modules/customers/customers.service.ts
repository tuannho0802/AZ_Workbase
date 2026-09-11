import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, IsNull, In } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerFiltersDto } from './dto/customer-filters.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import {
  DuplicatePhoneException,
  CustomerNotFoundException,
  UnauthorizedCustomerAccessException,
} from './exceptions/customer.exceptions';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { Deposit } from '../../database/entities/deposit.entity';
import {
  CustomerAssignment,
  AssignmentStatus,
} from '../../database/entities/customer-assignment.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { CreateCustomerNoteDto } from './dto/create-customer-note.dto';
import { UpdateCustomerNoteDto } from './dto/update-customer-note.dto';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CustomerAccessHelper } from './helpers/customer-access.helper';
import { AuditService } from '../audit/audit.service';
import { todayVnStr } from '../../common/utils/date-vn.util';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';

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
    @InjectRepository(CustomerGroupMembership)
    private readonly customerGroupMembershipRepository: Repository<CustomerGroupMembership>,
    // ⚠️ MỚI (Setup dynamic Customer Status - CreateCustomerStatuses1781400000000):
    // dùng để validate `dto.status` khi create()/update() đối chiếu với bảng
    // `customer_statuses` thay vì ENUM cứng cũ - mirror đúng cách
    // `salesUserId`/`marketingUserId` được validate tồn tại ở 2 hàm đó.
    @InjectRepository(CustomerStatus)
    private readonly customerStatusRepository: Repository<CustomerStatus>,
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
    // ⚠️ Trục "UI Visibility" (field ẨN/HIỆN) - ĐỘC LẬP với PermissionsService
    // (action permission). Chỉ strip field ở findAll()/findOne() - đây là 2
    // nơi DUY NHẤT trả object Customer đầy đủ ra ngoài response (xem PLAN
    // mục 2.5, JSDoc `UiVisibilityService.stripHiddenCustomerFields()`).
    private readonly uiVisibilityService: UiVisibilityService,
  ) {}

  private getTodayVn(): Date {
    const now = new Date();
    // Offset for UTC+7 (Vietnam time)
    const vnTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return vnTime;
  }

  /**
   * Đối chiếu `status` với bảng `customer_statuses` (nguồn sự thật động,
   * thay ENUM cứng cũ - xem CreateCustomerStatuses1781400000000). Chỉ gọi
   * khi `status` THẬT SỰ có trong DTO (undefined = không đổi/dùng default
   * DB 'pending', không cần query) - mirror đúng cách `salesUserId`/
   * `marketingUserId` được validate tồn tại ở create()/update().
   */
  private async assertValidStatus(code: string | undefined): Promise<void> {
    if (code === undefined) return;
    const exists = await this.customerStatusRepository.findOne({ where: { code } });
    if (!exists) {
      throw new BadRequestException(
        `Trạng thái "${code}" không tồn tại. Vui lòng kiểm tra lại ở Quản lý status Khách.`,
      );
    }
  }

  async create(createCustomerDto: CreateCustomerDto, userId: number) {
    const userRepo = this.customersRepository.manager.getRepository(User);

    if (createCustomerDto.salesUserId) {
      const salesUser = await userRepo.findOneBy({
        id: createCustomerDto.salesUserId,
        isActive: true,
      });
      if (!salesUser) {
        throw new BadRequestException(
          `Nhân viên ID ${createCustomerDto.salesUserId} không tồn tại hoặc đã bị khóa`,
        );
      }
    }

    if (createCustomerDto.marketingUserId) {
      const marketingUser = await userRepo.findOneBy({
        id: createCustomerDto.marketingUserId,
        isActive: true,
      });
      if (!marketingUser) {
        throw new BadRequestException(
          `Nhân viên ID ${createCustomerDto.marketingUserId} không tồn tại hoặc đã bị khóa`,
        );
      }
    }

    await this.assertValidStatus(createCustomerDto.status);

    try {
      const today = this.getTodayVn();
      const customer = this.customersRepository.create({
        ...createCustomerDto,
        phone:
          createCustomerDto.phone?.trim() === ''
            ? null
            : createCustomerDto.phone,
        createdById: userId,
        createdBy_OLD: userId, // ← Populate legacy NOT NULL column
        inputDate: createCustomerDto.inputDate
          ? new Date(createCustomerDto.inputDate)
          : today,
        assignedDate: createCustomerDto.assignedDate
          ? new Date(createCustomerDto.assignedDate)
          : createCustomerDto.salesUserId
            ? today
            : null,
        closedDate: createCustomerDto.closedDate
          ? new Date(createCustomerDto.closedDate)
          : null,
      } as any);
      const saved = await this.customersRepository.save(customer);

      this.auditService.logActionAsync(
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

  /**
   * ⚠️ TỐI ƯU TÌM KIẾM (thay thế cho LIKE '%x%'):
   * Trước đây search dùng `LOWER(customer.name) LIKE '%x%'` (và tương tự cho
   * email/campaign) — có % ở ĐẦU chuỗi nên MySQL không thể dùng bất kỳ index
   * nào, luôn phải full table scan. Càng nhiều khách hàng, search càng chậm.
   *
   * Sửa: dùng FULLTEXT index (parser `ngram`, đã tạo qua migration
   * AddFulltextSearchToCustomers) cho name/email/campaign — ngram cho phép
   * khớp cả theo từ lẫn giữa từ, gần với hành vi cũ nhất trong khi vẫn dùng
   * được index thật. Riêng SĐT đổi sang "bắt đầu bằng" (không còn % ở đầu)
   * để tận dụng index B-tree có sẵn trên cột phone.
   *
   * Đánh đổi đã thống nhất với người dùng: không còn tìm SĐT theo số ở giữa
   * hay 4 số cuối, chỉ tìm theo đầu số.
   */
  private applyCustomerSearch(
    queryBuilder: ReturnType<Repository<Customer>['createQueryBuilder']>,
    search: string,
  ) {
    const trimmed = search.trim();
    if (!trimmed) return;

    // ⚠️ QUAN TRỌNG: dùng BOOLEAN MODE, KHÔNG dùng NATURAL LANGUAGE MODE.
    // NATURAL LANGUAGE MODE tách chuỗi thành từ và khớp kiểu OR có trọng số
    // (relevance) — chỉ cần khớp 1 từ trong chuỗi là ra kết quả, không lọc
    // theo đúng cụm người dùng gõ. Với cụm nhiều từ như "Nguyễn Văn Haha",
    // hành vi này khiến kết quả trông như gần như không lọc (bất kỳ dòng nào
    // chứa "Nguyễn" HOẶC "Văn" HOẶC mảnh trùng khác đều lọt vào). Ngoài ra
    // còn dính luật ngưỡng 50% (đã kiểm chứng qua tài liệu MySQL chính thức).
    // BOOLEAN MODE + ép phrase (bọc "...") buộc khớp đúng cụm liên tục, né
    // được cả 2 vấn đề trên.
    const safeSearch = trimmed.replace(/"/g, '');
    const searchPhrase = `"${safeSearch}"`;

    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where(
          'MATCH(customer.name, customer.email, customer.campaign) AGAINST(:searchPhrase IN BOOLEAN MODE)',
          { searchPhrase },
        ).orWhere('customer.phone LIKE :phonePrefix', {
          phonePrefix: `${trimmed}%`,
        });
      }),
    );
  }

  /**
   * Áp dụng các điều kiện lọc (search/source/status/salesUser/department/date)
   * dùng chung cho cả query lấy dữ liệu và query đếm số lượng (COUNT).
   * Tách riêng để tránh lặp code và đảm bảo 2 query luôn đồng bộ điều kiện.
   */
  private applyCustomerListFilters(
    queryBuilder: ReturnType<Repository<Customer>['createQueryBuilder']>,
    filters: Pick<
      CustomerFiltersDto,
      | 'search'
      | 'source'
      | 'status'
      | 'salesUserId'
      | 'marketingUserId'
      | 'creatorId'
      | 'departmentId'
      | 'dateFrom'
      | 'dateTo'
      | 'joinedGroups'
    >,
  ) {
    const {
      search,
      source,
      status,
      salesUserId,
      marketingUserId,
      creatorId,
      departmentId,
      dateFrom,
      dateTo,
      joinedGroups,
    } = filters;

    // Search
    if (search) {
      this.applyCustomerSearch(queryBuilder, search);
    }

    // Basic Filters
    if (source) {
      queryBuilder.andWhere('customer.source = :source', { source });
    }
    if (status) {
      queryBuilder.andWhere('customer.status = :status', { status });
    }
    if (salesUserId) {
      queryBuilder.andWhere('customer.salesUserId = :salesUserId', {
        salesUserId,
      });
    }
    if (marketingUserId) {
      queryBuilder.andWhere('customer.marketingUserId = :marketingUserId', {
        marketingUserId,
      });
    }
    // "Người nhập Data" - tách riêng khỏi marketingUserId, lọc theo người
    // THỰC SỰ tạo bản ghi (createdById), vì người nhập data có thể ở
    // phòng ban khác Marketing.
    if (creatorId) {
      queryBuilder.andWhere('customer.createdById = :creatorId', {
        creatorId,
      });
    }
    if (departmentId) {
      queryBuilder.andWhere('customer.departmentId = :departmentId', {
        departmentId,
      });
    }

    // Date Filters
    // ⚠️ FIX BUG THẬT: trước đây lọc theo `customer.createdAt` (thời điểm
    // RECORD được ghi vào DB) trong khi cột hiển thị trên bảng + label bộ
    // lọc là "Ngày nhập" (`inputDate`) - 2 giá trị lệch nhau khi Import
    // Excel hàng loạt (createdAt = lúc import hôm nay, inputDate = ngày
    // nhập liệu thật, có thể là quá khứ xa). Kết quả: chọn "8/9 → 9/9" vẫn
    // trả về cả khách có "Ngày nhập" hiển thị là tháng trước, miễn createdAt
    // rơi đúng khoảng đó - đúng hiện tượng "lố ra ngày trước đó" đã báo.
    // `inputDate` là cột kiểu DATE thuần (không có giờ - xem
    // customer.entity.ts), nên so sánh trực tiếp chuỗi 'YYYY-MM-DD' là
    // CHÍNH XÁC và ĐÃ inclusive ở cả 2 đầu, không cần cộng thêm 23:59:59.
    // Đồng thời đã có sẵn index @Index(['inputDate']) nên không tốn thêm
    // chi phí quét bảng so với trước.
    if (dateFrom) {
      queryBuilder.andWhere('customer.inputDate >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      queryBuilder.andWhere('customer.inputDate <= :dateTo', { dateTo });
    }

    // "Đã joined nhóm liên kết" - dùng EXISTS/NOT EXISTS thay vì JOIN để
    // không nhân bản dòng customer (1 customer có thể join nhiều nhóm cùng
    // lúc - nếu JOIN thẳng vào customer_group_memberships, 1 customer sẽ
    // xuất hiện lặp lại N lần theo N nhóm đã join, làm sai cả phân trang
    // lẫn COUNT). EXISTS chỉ trả về true/false, không nhân dòng.
    if (joinedGroups === 'joined') {
      queryBuilder.andWhere(
        'EXISTS (SELECT 1 FROM customer_group_memberships cgm ' +
        'WHERE cgm.customer_id = customer.id AND cgm.joined = true)',
      );
    } else if (joinedGroups === 'not_joined') {
      queryBuilder.andWhere(
        'NOT EXISTS (SELECT 1 FROM customer_group_memberships cgm ' +
        'WHERE cgm.customer_id = customer.id AND cgm.joined = true)',
      );
    }
  }

  /**
   * Danh sách user dùng cho dropdown filter "Người nhập Data" (tách riêng
   * khỏi "Marketing" - người nhập data thực tế có thể ở phòng ban khác,
   * không nhất thiết thuộc Phòng Marketing). CHỈ trả về user nào đã từng
   * tạo ÍT NHẤT 1 khách hàng còn tồn tại (chưa bị soft-delete) - tránh
   * dropdown dài vô ích với những người chưa từng nhập data nào.
   */
  async getCreatorsList(): Promise<{ id: number; name: string }[]> {
    const rows = await this.customersRepository
      .createQueryBuilder('customer')
      .innerJoin('customer.createdBy', 'creator')
      .select('creator.id', 'id')
      .addSelect('creator.name', 'name')
      .where('customer.deletedAt IS NULL')
      .groupBy('creator.id')
      .addGroupBy('creator.name')
      .orderBy('creator.name', 'ASC')
      .getRawMany();

    return rows.map((r) => ({ id: Number(r.id), name: r.name }));
  }

  async findAll(
    filters: CustomerFiltersDto,
    userId: number,
    userRole: string,
    scope?: string | null,
    // ⚠️ MỚI (UI Visibility Phase 3) - optional để KHÔNG phá các lời gọi cũ
    // (test/service khác gọi findAll() chưa truyền 2 tham số này) - thiếu
    // thì coi như không có override Phòng ban/Vị trí, dùng đúng rule Global.
    // Đặt tên `callerDepartmentId`/`callerPositionId` (không phải
    // `departmentId`) vì `departmentId` đã bị `filters` destructure bên dưới
    // dùng cho mục đích KHÁC (lọc DANH SÁCH theo phòng ban của KHÁCH HÀNG,
    // không phải phòng ban của NGƯỜI GỌI).
    callerDepartmentId?: number | null,
    callerPositionId?: number | null,
    // ⚠️ MỚI (isRootAdmin) - optional để KHÔNG phá lời gọi cũ, xem
    // JSDoc `UiVisibilityService.getHiddenElementKeys()`. Thiếu -> coi như
    // KHÔNG phải Root Admin (an toàn hơn: có thể bị strip field nhầm chứ
    // không lộ field lẽ ra phải ẩn).
    callerIsRootAdmin?: boolean,
  ) {
    const {
      page = 1,
      limit = 20,
      // ⚠️ Khớp default ở FE (customers/page.tsx) - "Ngày nhập" (inputDate)
      // là cột hiển thị mặc định trên bảng, không phải `createdAt` (thời
      // điểm ghi DB, có thể lệch xa so với ngày nhập liệu thật khi Import
      // Excel hàng loạt dữ liệu cũ). Đổi default ở đây để phòng trường hợp
      // 1 nơi gọi API khác (Postman, integration khác) không tự truyền
      // sortField vẫn nhận đúng hành vi mong đợi.
      sortField = 'inputDate',
      sortOrder = 'DESC',
      search,
      source,
      status,
      salesUserId,
      marketingUserId,
      creatorId,
      departmentId,
      dateFrom,
      dateTo,
      joinedGroups,
    } = filters;

    // ===== Query chính: lấy dữ liệu (có joins + subquery deposit) =====
    const queryBuilder =
      this.customersRepository.createQueryBuilder('customer');

    queryBuilder.leftJoinAndSelect('customer.salesUser', 'salesUser');
    // ⚠️ MỚI - rà soát Vị trí 2026-09-10: FE (CustomerInfoTab.tsx) hiện Tag
    // Role cho "Sales phụ trách chính" nhưng chưa từng có Vị trí vì quan hệ
    // `salesUser.position`/`marketingUser.position` chưa bao giờ được JOIN
    // ở đây - object `salesUser`/`marketingUser` trả ra luôn thiếu field
    // `position` dù DB có dữ liệu đúng.
    queryBuilder.leftJoinAndSelect('salesUser.position', 'salesUserPosition');
    queryBuilder.leftJoinAndSelect('customer.marketingUser', 'marketingUser');
    queryBuilder.leftJoinAndSelect('marketingUser.position', 'marketingUserPosition');
    queryBuilder.leftJoinAndSelect('customer.department', 'department');
    queryBuilder.leftJoinAndSelect('customer.createdBy', 'createdBy');
    queryBuilder.leftJoinAndSelect('customer.updatedBy', 'updatedBy');

    queryBuilder.where('customer.deletedAt IS NULL');

    // RBAC
    CustomerAccessHelper.applyViewFilter(
      queryBuilder,
      userId,
      userRole,
      scope,
    );

    this.applyCustomerListFilters(queryBuilder, {
      search,
      source,
      status,
      salesUserId,
      marketingUserId,
      creatorId,
      departmentId,
      dateFrom,
      dateTo,
      joinedGroups,
    });

    // Calculate and alias the deposit sum based on date range (or default 30 days)
    const depositSubQuery = this.depositsRepository
      .createQueryBuilder('deposit')
      .select('SUM(deposit.amount)')
      .where('deposit.customerId = customer.id');

    if (dateFrom) {
      depositSubQuery.andWhere('deposit.depositDate >= :dateFrom', {
        dateFrom,
      });
    }
    if (dateTo) {
      depositSubQuery.andWhere('deposit.depositDate <= :dateTo', { dateTo });
    } else if (!dateFrom) {
      // Default: 30 days
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() - 30);
      const thirtyDaysAgo = thirtyDays.toISOString().split('T')[0];
      depositSubQuery.andWhere('deposit.depositDate >= :thirtyDaysAgo', {
        thirtyDaysAgo,
      });
    }

    queryBuilder.addSelect(
      `(${depositSubQuery.getQuery()})`,
      'totalDepositSum',
    );
    queryBuilder.setParameters(depositSubQuery.getParameters());

    // Sorting
    // ⚠️ FIX BUG THẬT: MySQL KHÔNG đảm bảo thứ tự ổn định cho các dòng
    // TRÙNG giá trị cột sort khi dùng LIMIT/OFFSET (đặc biệt `inputDate` -
    // kiểu DATE, không có giờ - rất nhiều khách hàng nhập cùng 1 ngày sẽ
    // trùng tuyệt đối). Không có tiêu chí phụ để phá vỡ trùng lặp
    // (tie-break), thứ tự các dòng trùng ngày có thể đảo lộn ngẫu nhiên
    // giữa các lần gọi/F5/chuyển trang - đúng hiện tượng "ngày hiển thị
    // lung tung" đã báo. Luôn thêm `customer.id DESC` làm tiêu chí phụ SAU
    // CÙNG (id là khoá duy nhất, tăng dần theo thời gian tạo) để đảm bảo
    // thứ tự luôn nhất quán, deterministic - mới nhất theo id lên trước khi
    // 2 dòng trùng giá trị cột sort chính.
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
    queryBuilder.addOrderBy('customer.id', 'DESC');

    // Pagination
    queryBuilder.skip((page - 1) * limit).take(limit);

    // ===== Query đếm: KHÔNG joins, KHÔNG subquery deposit =====
    // Trước đây COUNT chạy trên cùng queryBuilder có 4 leftJoinAndSelect + subquery
    // deposit, khiến MySQL phải join/scan nhiều bảng chỉ để đếm số dòng.
    // Tách riêng giúp câu COUNT nhẹ hơn đáng kể khi dữ liệu lớn dần.
    const countQueryBuilder = this.customersRepository
      .createQueryBuilder('customer')
      .where('customer.deletedAt IS NULL');

    CustomerAccessHelper.applyViewFilter(
      countQueryBuilder,
      userId,
      userRole,
      scope,
    );
    this.applyCustomerListFilters(countQueryBuilder, {
      search,
      source,
      status,
      salesUserId,
      marketingUserId,
      creatorId,
      departmentId,
      dateFrom,
      dateTo,
      joinedGroups,
    });

    // Chạy song song 2 query độc lập thay vì tuần tự -> giảm tổng thời gian chờ
    const [{ entities, raw }, count] = await Promise.all([
      queryBuilder.getRawAndEntities(),
      countQueryBuilder.getCount(),
    ]);

    // Map the raw sum back to each entity
    entities.forEach((customer) => {
      const rawRow = raw.find((r) => (r.customer_id || r.id) === customer.id);
      if (rawRow) {
        (customer as any).totalDeposit30Days = parseFloat(
          rawRow.totalDepositSum || '0',
        );
      } else {
        (customer as any).totalDeposit30Days = 0;
      }
    });

    // Populate activeAssignees for 1:N feature
    // (Đã xoá 1 query thừa ở đây: trước đây có 1 lần gọi assignmentRepository.find()
    // với where customerId = undefined -> load TOÀN BỘ bảng customer_assignments
    // vào RAM mỗi lần gọi API nhưng không hề dùng kết quả đó ở đâu cả.)
    if (entities.length > 0) {
      const activeAssignments = await this.assignmentRepository
        .createQueryBuilder('assignment')
        .leftJoinAndSelect('assignment.assignedTo', 'assignedTo')
        // ⚠️ MỚI - đối xứng salesUser/marketingUser ở trên: "Sales được
        // chia" (CustomerInfoTab.tsx) cũng hiện Tag Role, cần thêm Vị trí.
        .leftJoinAndSelect('assignedTo.position', 'assignedToPosition')
        .where('assignment.status = :status', { status: 'active' })
        .andWhere('assignment.customer_id IN (:...ids)', {
          ids: entities.map((e) => e.id),
        })
        .getMany();

      entities.forEach((customer) => {
        const assignmentsForCustomer = activeAssignments.filter(
          (a) => a.customerId === customer.id,
        );
        (customer as any).activeAssignees = assignmentsForCustomer.map(
          (a) => a.assignedTo,
        );
      });

      // "Đã joined nhóm" cho cột hiển thị trên bảng danh sách - 1 query
      // JOIN duy nhất cho CẢ TRANG (không phải N query/khách hàng), cùng
      // nguyên tắc với activeAssignees ở trên. Lấy kèm TÊN nhóm (không chỉ
      // đếm số lượng) để FE hiển thị theo đúng pattern "Sales chính/phụ"
      // (tên nhóm đầu tiên + "+N" cho các nhóm còn lại, hover xem chi tiết).
      const joinedGroupsRaw = await this.customerGroupMembershipRepository
        .createQueryBuilder('cgm')
        .innerJoin('cgm.group', 'grp')
        .select('cgm.customer_id', 'customerId')
        .addSelect('grp.id', 'groupId')
        .addSelect('grp.name', 'groupName')
        .where('cgm.customer_id IN (:...ids)', {
          ids: entities.map((e) => e.id),
        })
        .andWhere('cgm.joined = true')
        .orderBy('grp.name', 'ASC')
        .getRawMany();

      const joinedGroupsByCustomerId = new Map<number, Array<{ id: number; name: string }>>();
      for (const row of joinedGroupsRaw) {
        const customerId = Number(row.customerId);
        if (!joinedGroupsByCustomerId.has(customerId)) {
          joinedGroupsByCustomerId.set(customerId, []);
        }
        joinedGroupsByCustomerId.get(customerId)!.push({ id: Number(row.groupId), name: row.groupName });
      }

      entities.forEach((customer) => {
        const groups = joinedGroupsByCustomerId.get(customer.id) ?? [];
        (customer as any).joinedGroups = groups;
        (customer as any).joinedGroupsCount = groups.length;
      });

      // "Ghi chú gần nhất" cho cột mới trên bảng danh sách - 1 query duy
      // nhất cho CẢ TRANG (cùng nguyên tắc activeAssignees/joinedGroups ở
      // trên, KHÔNG gọi riêng lẻ theo từng dòng). Lấy TẤT CẢ note của các
      // customer trong trang, sắp theo customer + ngày tạo giảm dần, rồi
      // chỉ giữ lại tối đa 5 note đầu/customer khi gom nhóm ở JS bên dưới -
      // đủ dùng ở quy mô CRM nội bộ (1 customer thường chỉ vài chục note),
      // tránh phải phụ thuộc window function (ROW_NUMBER) của riêng MySQL
      // 8+ để lấy "top N mỗi nhóm" ngay trong SQL.
      const MAX_RECENT_NOTES = 5;
      const noteRows = await this.notesRepository
        .createQueryBuilder('note')
        .leftJoinAndSelect('note.createdByUser', 'noteCreator')
        .where('note.customer_id IN (:...ids)', {
          ids: entities.map((e) => e.id),
        })
        .orderBy('note.customer_id', 'ASC')
        .addOrderBy('note.created_at', 'DESC')
        .getMany();

      const recentNotesByCustomerId = new Map<
        number,
        Array<{ id: number; note: string; createdAt: Date; createdByName: string | null }>
      >();
      for (const noteRow of noteRows) {
        const list = recentNotesByCustomerId.get(noteRow.customerId) ?? [];
        if (list.length < MAX_RECENT_NOTES) {
          list.push({
            id: noteRow.id,
            note: noteRow.note,
            createdAt: noteRow.createdAt,
            createdByName: noteRow.createdByUser?.name ?? null,
          });
        }
        recentNotesByCustomerId.set(noteRow.customerId, list);
      }

      entities.forEach((customer) => {
        (customer as any).recentNotes = recentNotesByCustomerId.get(customer.id) ?? [];
      });
    }

    // ⚠️ UI Visibility (Phase 3) - xoá field bị ẩn KHỎI từng customer trước
    // khi trả về, KHÔNG set null (xem `UiVisibilityService` JSDoc). Tính 1
    // LẦN cho cả trang (`hiddenKeys` giống nhau cho mọi customer vì phụ
    // thuộc role/phòng ban/vị trí của NGƯỜI GỌI, không phải của customer).
    const hiddenKeys = await this.uiVisibilityService.getHiddenElementKeys(
      userRole,
      'customers',
      callerDepartmentId,
      callerPositionId,
      callerIsRootAdmin,
    );
    if (hiddenKeys.size > 0) {
      entities.forEach((customer) =>
        this.uiVisibilityService.stripHiddenCustomerFields(customer as any, hiddenKeys),
      );
    }

    return {
      data: entities,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async getStats(userId: number, userRole: string, scope?: string | null) {
    const queryBuilder = this.customersRepository
      .createQueryBuilder('customer')
      .where('customer.deletedAt IS NULL');

    // RBAC
    CustomerAccessHelper.applyViewFilter(
      queryBuilder,
      userId,
      userRole,
      scope,
    );

    const [total, newToday, closedTotal] = await Promise.all([
      queryBuilder.clone().getCount(),
      queryBuilder
        .clone()
        .andWhere(
          "DATE(CONVERT_TZ(customer.createdAt, '+00:00', '+07:00')) = CURDATE()",
        )
        .getCount(),
      queryBuilder
        .clone()
        .andWhere('customer.status = :status', { status: 'closed' })
        .getCount(),
    ]);

    // Pending and Potential for completeness (matching promt)
    const [pendingTotal, potentialTotal] = await Promise.all([
      queryBuilder
        .clone()
        .andWhere('customer.status = :status', { status: 'pending' })
        .getCount(),
      queryBuilder
        .clone()
        .andWhere('customer.status = :status', { status: 'potential' })
        .getCount(),
    ]);

    const depositsQuery = this.depositsRepository
      .createQueryBuilder('deposit')
      .leftJoin('deposit.customer', 'customer')
      .where('customer.deletedAt IS NULL');

    CustomerAccessHelper.applyViewFilter(
      depositsQuery,
      userId,
      userRole,
      scope,
    );

    // ⚠️ FIX BUG THẬT (mismatch "Tổng nạp" ở Dashboard vs cột "Nạp tiền" trên
    // bảng danh sách - ảnh chụp màn hình đã báo): trước đây "Tổng nạp" cộng
    // dồn TOÀN BỘ deposit từ trước tới giờ (không giới hạn ngày) của các
    // customer trong phạm vi Xem, trong khi cột "Nạp tiền (30 ngày gần đây)"
    // trên bảng CHỈ tính 30 ngày gần nhất (xem findAll()/getAllDepositsStats())
    // - 2 con số vì vậy không khớp nhau (vd Employee thấy $40 ở thẻ tổng
    // nhưng cộng tay các dòng trên bảng chỉ ra $10), khiến người dùng tưởng
    // nhầm là lỗi rò rỉ dữ liệu ngoài phạm vi RBAC trong khi thực chất chỉ
    // lệch khung thời gian tính toán. `getStats()` hiện KHÔNG nhận filter gì
    // từ Frontend (xem `customersApi.getStats()` - gọi trơn không kèm query
    // param), nên áp thẳng mặc định "30 ngày gần đây" giống hệt cách
    // findAll()/getAllDepositsStats() tự fallback khi thiếu dateFrom, để 2
    // con số luôn khớp nhau.
    const thirtyDaysAgoDate = new Date();
    thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
    const thirtyDaysAgo = thirtyDaysAgoDate.toISOString().split('T')[0];
    depositsQuery.andWhere('deposit.depositDate >= :thirtyDaysAgo', { thirtyDaysAgo });

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

  /**
   * Cổng gác quyền dùng CHUNG cho các sub-resource (note, deposit,
   * assignment-history, group-memberships) - đảm bảo dùng ĐÚNG 1 nguồn
   * filter với findOne()/findAll() (gọi thẳng CustomerAccessHelper.
   * applyViewFilter(), không viết điều kiện phân quyền riêng dễ lệch nhau)
   * theo PERMISSIONS.md mục 1, quy tắc kỹ thuật #2. Chỉ SELECT id (không
   * load quan hệ) để nhẹ - ném CustomerNotFoundException nếu customer
   * không tồn tại HOẶC không thuộc phạm vi Xem của người gọi (403/404 gộp
   * làm 1, không lộ thông tin "có tồn tại nhưng không có quyền" - đúng
   * pattern findOne() đang dùng).
   */
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

  async findOne(
    id: number,
    userId: number,
    userRole: string,
    scope?: string | null,
    // ⚠️ MỚI (UI Visibility Phase 3) - xem chú thích trong findAll().
    callerDepartmentId?: number | null,
    callerPositionId?: number | null,
    // ⚠️ MỚI (isRootAdmin) - xem chú thích trong findAll().
    callerIsRootAdmin?: boolean,
  ) {
    const queryBuilder = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      // ⚠️ MỚI - đối xứng findAll() (xem chú thích tương ứng ở đó).
      .leftJoinAndSelect('salesUser.position', 'salesUserPosition')
      .leftJoinAndSelect('customer.marketingUser', 'marketingUser')
      .leftJoinAndSelect('marketingUser.position', 'marketingUserPosition')
      .leftJoinAndSelect('customer.department', 'department')
      .leftJoinAndSelect('customer.deposits', 'deposits')
      .leftJoinAndSelect('customer.notes', 'notes')
      .leftJoinAndSelect('notes.createdByUser', 'noteCreator')
      .leftJoinAndSelect('notes.updatedByUser', 'noteUpdater')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .leftJoinAndSelect('customer.updatedBy', 'updatedBy');

    queryBuilder.where('customer.id = :id', { id });
    queryBuilder.andWhere('customer.deletedAt IS NULL');

    CustomerAccessHelper.applyViewFilter(
      queryBuilder,
      userId,
      userRole,
      scope,
    );

    const customer = await queryBuilder.getOne();

    if (!customer) {
      throw new CustomerNotFoundException();
    }

    // Sort relations in memory as TB queryBuilder complex sorting for sub-entities is tricky
    if (customer.deposits) {
      customer.deposits.sort(
        (a, b) =>
          new Date(b.depositDate).getTime() - new Date(a.depositDate).getTime(),
      );
    }
    if (customer.notes) {
      customer.notes.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }

    const activeAssignments = await this.assignmentRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.assignedTo', 'assignedTo')
      .leftJoinAndSelect('assignedTo.position', 'assignedToPosition')
      .where('assignment.status = :status', { status: 'active' })
      .andWhere('assignment.customer_id = :id', { id })
      .getMany();

    (customer as any).activeAssignees = activeAssignments.map(
      (a) => a.assignedTo,
    );

    // ⚠️ UI Visibility (Phase 3) - GIỐNG HỆT findAll(), phải xoá SAU khi gán
    // `activeAssignees` ở trên (field:sales_assignment strip luôn cả
    // activeAssignees - xem `stripHiddenCustomerFields()`), nếu xoá trước sẽ
    // bị gán đè lại field vừa xoá.
    const hiddenKeys = await this.uiVisibilityService.getHiddenElementKeys(
      userRole,
      'customers',
      callerDepartmentId,
      callerPositionId,
      callerIsRootAdmin,
    );
    if (hiddenKeys.size > 0) {
      this.uiVisibilityService.stripHiddenCustomerFields(customer as any, hiddenKeys);
    }

    return customer;
  }

  async createNote(
    customerId: number,
    dto: CreateCustomerNoteDto,
    userId: number,
    userRole: string,
    scope?: string | null,
  ) {
    // ⚠️ FIX PERMISSIONS.md mục 2.1/4.0b: trước đây chỉ query đơn giản
    // (không qua CustomerAccessHelper) - BẤT KỲ role nào đăng nhập cũng
    // ghi note được vào customer bất kỳ, không riêng phạm vi của mình.
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);

    const note = this.notesRepository.create({
      ...dto,
      customerId,
      createdBy: userId,
    });

    const savedNote = await this.notesRepository.save(note);

    this.auditService.logActionAsync(
      userId,
      'CREATE_NOTE',
      'customer_note',
      (savedNote as any).id,
      null,
      savedNote,
    );

    return this.notesRepository.findOne({
      where: { id: (savedNote as any).id },
      relations: ['createdByUser'],
    });
  }

  /**
   * Cổng gác DUY NHẤT cho sửa/xoá 1 ghi chú khách hàng (customer_notes.edit
   * / customer_notes.delete) - thay thế hoàn toàn bypass cứng cũ "ghi chú
   * của chính mình luôn sửa/xoá được bất kể permission". Giờ đây HOÀN TOÀN
   * Dynamic theo `role_permissions` (Admin tự bật/tắt qua trang "Phân
   * quyền" - KHÔNG cần migration để thêm/bớt cho role nào):
   *
   *  - KHÔNG có dòng permission nào cho role này -> luôn bị chặn, KỂ CẢ với
   *    ghi chú do chính mình tạo (khác hẳn thiết kế cũ). Admin có thể chủ
   *    động tắt hẳn quyền sửa/xoá ghi chú của 1 Role qua UI nếu muốn.
   *  - scope='own': chỉ sửa/xoá được ghi chú CHÍNH MÌNH tạo
   *    (`note.createdBy === userId`).
   *  - scope='department': sửa/xoá được ghi chú của KHÁCH HÀNG thuộc phòng
   *    ban mình quản lý (`department.manager_user_id = mình`), bất kể ai
   *    tạo ra ghi chú đó.
   *  - scope='all': sửa/xoá được MỌI ghi chú.
   *
   * Admin luôn bypass tuyệt đối (đúng nguyên tắc 3 lối thoát hiểm bắt buộc
   * của dự án: PermissionGuard, RolesService.getMyPermissions(), và mọi
   * helper tự check quyền như hàm này).
   */
  private async assertNoteManageable(
    note: CustomerNote,
    customerId: number,
    userId: number,
    userRole: string,
    departmentId: number | null,
    permissionKey: 'customer_notes.edit' | 'customer_notes.delete',
    forbiddenMessage: string,
  ): Promise<void> {
    if (userRole === Role.ADMIN) {
      await this.assertCustomerAccessible(customerId, userId, userRole, PermissionScope.ALL);
      return;
    }

    const { allowed, scope } = await this.permissionsService.hasPermission(
      userRole,
      permissionKey,
      departmentId,
    );

    if (!allowed) {
      throw new ForbiddenException(forbiddenMessage);
    }

    if (scope === PermissionScope.OWN) {
      if (note.createdBy !== userId) {
        throw new ForbiddenException(forbiddenMessage);
      }
      // ⚠️ FIX BUG THẬT (báo cáo 2026-09-08: Employee được cấp
      // `customer_notes.edit` scope='own' bị 404 "Không tìm thấy khách hàng
      // này" khi Lưu sửa ĐÚNG ghi chú do chính mình tạo):
      //
      // Nguyên nhân gốc: trước đây dòng dưới đây gọi cứng
      // `assertCustomerAccessible(customerId, userId, userRole, null)` -
      // `null` rơi vào nhánh mặc định của `CustomerAccessHelper.
      // applyViewFilter()`, tức là bắt buộc user phải là NGƯỜI TẠO/SALES
      // CHÍNH/đang được GÁN CHIA SẺ của chính khách hàng đó thì mới qua
      // được. Nhưng `customer_notes.create` (permission dùng để TẠO ra ghi
      // chú ban đầu) hoàn toàn có thể có scope RỘNG HƠN (vd 'department'/
      // 'all') - Admin cấp cho Employee được viết note trên MỌI khách hàng
      // trong phòng ban, không chỉ khách của riêng mình. Hệ quả: Employee
      // tạo note thành công trên 1 khách hàng KHÔNG PHẢI của mình (do
      // scope tạo note rộng), nhưng khi quay lại SỬA đúng note đó (scope
      // sửa note = 'own', đã tự kiểm tra `note.createdBy === userId` ở
      // trên - ĐÚNG rồi) thì bị chặn nhầm bởi recheck khách hàng quá hẹp
      // (own-only) - không nhất quán với quyền họ thực sự có.
      //
      // Sửa: recheck khách hàng bằng CHÍNH scope thật của `customers.view`
      // (tra động qua PermissionsService, KHÔNG hardcode 'own'/null nữa) -
      // đây mới là nguồn chân lý đúng cho câu hỏi "user này có được đụng
      // vào khách hàng này không", nhất quán với cách `findOne()`/
      // `createNote()` đang xác định phạm vi truy cập khách hàng.
      const { scope: viewScope } = await this.permissionsService.hasPermission(
        userRole,
        'customers.view',
        departmentId,
      );
      await this.assertCustomerAccessible(customerId, userId, userRole, viewScope);
      return;
    }

    // 'department' hoặc 'all' - áp ĐÚNG scope này vào việc xác nhận truy
    // cập khách hàng chứa ghi chú (tái dùng CustomerAccessHelper sẵn có
    // qua assertCustomerAccessible, cùng 1 nguồn chân lý với view/manage
    // khách hàng).
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);
  }

  async updateNote(
    customerId: number,
    noteId: number,
    dto: UpdateCustomerNoteDto,
    userId: number,
    userRole: string,
    departmentId: number | null,
  ) {
    const note = await this.notesRepository.findOne({ where: { id: noteId, customerId } });
    if (!note) throw new NotFoundException('Không tìm thấy ghi chú');

    await this.assertNoteManageable(
      note,
      customerId,
      userId,
      userRole,
      departmentId,
      'customer_notes.edit',
      'Bạn không có quyền sửa ghi chú này',
    );

    const oldData = { ...note };
    this.notesRepository.merge(note, dto);
    // ⚠️ MỚI: luôn ghi nhận người SỬA CUỐI (kể cả khi người này chính là
    // người tạo - vẫn set để nhất quán, FE chỉ hiển thị TÊN người sửa khi
    // `updatedBy !== createdBy`, xem CustomerNotesTab.tsx) - phục vụ yêu
    // cầu "khi A tạo, B sửa thì phải có dòng ghi chú nhỏ hệ thống tự tạo
    // báo ai là người sửa cuối cùng".
    note.updatedBy = userId;
    // Đếm số lần đã sửa - tăng mỗi lần PATCH thành công, bất kể ai sửa
    // (kể cả tự sửa ghi chú của chính mình) - phục vụ yêu cầu hiển thị
    // "Đã sửa N lần" trên UI.
    note.editCount = (note.editCount ?? 0) + 1;
    const savedNote = await this.notesRepository.save(note);

    this.auditService.logActionAsync(
      userId,
      'UPDATE_NOTE',
      'customer_note',
      savedNote.id,
      oldData,
      savedNote,
    );

    return this.notesRepository.findOne({
      where: { id: savedNote.id },
      relations: ['createdByUser', 'updatedByUser'],
    });
  }

  async deleteNote(
    customerId: number,
    noteId: number,
    userId: number,
    userRole: string,
    departmentId: number | null,
  ) {
    const note = await this.notesRepository.findOne({ where: { id: noteId, customerId } });
    if (!note) throw new NotFoundException('Không tìm thấy ghi chú');

    await this.assertNoteManageable(
      note,
      customerId,
      userId,
      userRole,
      departmentId,
      'customer_notes.delete',
      'Bạn không có quyền xoá ghi chú này',
    );

    const oldData = { ...note };
    await this.notesRepository.remove(note);

    this.auditService.logActionAsync(
      userId,
      'DELETE_NOTE',
      'customer_note',
      noteId,
      oldData,
      null,
    );

    return { message: 'Đã xoá ghi chú' };
  }

  async createDeposit(
    customerId: number,
    dto: CreateDepositDto,
    userId: number,
    userRole: string,
    scope?: string | null,
  ) {
    // ⚠️ FIX PERMISSIONS.md mục 2.1/4.0b: trước đây chỉ check tồn tại,
    // KHÔNG check phạm vi -> Manager tạo được deposit cho customer NGOÀI
    // phòng ban mình quản lý. Dùng chung cổng gác với findOne(), đồng thời
    // giờ cho phép Employee gọi endpoint này (trước đây bị loại hẳn khỏi
    // @Roles dù có thể đang là sales chính của customer đó) - phạm vi thực
    // tế vẫn bị giới hạn đúng bởi assertCustomerAccessible ngay dưới đây.
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);

    const customer = await this.customersRepository.findOne({
      where: { id: customerId, deletedAt: IsNull() },
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

    this.auditService.logActionAsync(
      userId,
      'CREATE_DEPOSIT',
      'deposit',
      (savedDeposit as any).id,
      null,
      savedDeposit,
    );

    return savedDeposit;
  }

  async getDeposits(customerId: number, userId: number, userRole: string, scope?: string | null) {
    // ⚠️ FIX PERMISSIONS.md mục 2.1/4.0b: trước đây KHÔNG check phạm vi -
    // bất kỳ role nào cũng xem được lịch sử nạp tiền (dữ liệu tài chính)
    // của customer bất kỳ. Mức độ nghiêm trọng: Cao.
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);

    return this.depositsRepository
      .createQueryBuilder('deposit')
      .where('deposit.customerId = :customerId', { customerId })
      .leftJoinAndSelect('deposit.createdBy', 'createdBy')
      .orderBy('deposit.depositDate', 'DESC')
      .addOrderBy('deposit.createdAt', 'DESC')
      .take(5)
      .getMany();
  }

  async deleteDeposit(id: number, userId?: number) {
    const deposit = await this.depositsRepository.findOne({ where: { id } });
    if (!deposit) {
      throw new NotFoundException('Không tìm thấy bản ghi nạp tiền');
    }
    const result = await this.depositsRepository.remove(deposit);

    if (userId) {
      this.auditService.logActionAsync(
        userId,
        'DELETE_DEPOSIT',
        'deposit',
        id,
        deposit,
        null,
      );
    }
    return result;
  }

  async update(
    id: number,
    updateCustomerDto: UpdateCustomerDto,
    userId: number,
    userRole: string,
    scope?: string | null,
  ) {
    const customer = await this.findOne(id, userId, userRole, scope);

    // Không cần check quyền sửa riêng ở đây: findOne() ở trên đã áp dụng
    // CustomerAccessHelper.applyViewFilter() - nếu user không có quyền
    // XEM khách hàng này, findOne() đã ném CustomerNotFoundException rồi,
    // code sẽ không chạy tới được dòng này. Với app này, phạm vi Xem và
    // phạm vi Sửa là một (xem chú thích đầu file customer-access.helper.ts).

    const today = this.getTodayVn();
    const todayStr = today.toISOString().split('T')[0];

    // Step 1: Handle salesUserId assignment explicitly (Case B)
    if (updateCustomerDto.salesUserId === null) {
      customer.salesUser = null;
      customer.salesUserId = null;
    } else if (
      updateCustomerDto.salesUserId !== undefined &&
      updateCustomerDto.salesUserId !== customer.salesUserId
    ) {
      const userRepo = this.customersRepository.manager.getRepository(User);
      const salesUser = await userRepo.findOneBy({
        id: updateCustomerDto.salesUserId,
        isActive: true,
      });
      if (!salesUser) {
        throw new BadRequestException(
          `Nhân viên ID ${updateCustomerDto.salesUserId} không tồn tại hoặc đã bị khóa`,
        );
      }
      customer.salesUser = salesUser;
      customer.salesUserId = salesUser.id;
    }

    // Step 1b: Handle marketingUserId assignment explicitly (giống Step 1,
    // nhưng độc lập với Sales — Marketing phụ trách là 1 quan hệ riêng)
    if (updateCustomerDto.marketingUserId === null) {
      customer.marketingUser = null;
      customer.marketingUserId = null;
    } else if (
      updateCustomerDto.marketingUserId !== undefined &&
      updateCustomerDto.marketingUserId !== customer.marketingUserId
    ) {
      const userRepo = this.customersRepository.manager.getRepository(User);
      const marketingUser = await userRepo.findOneBy({
        id: updateCustomerDto.marketingUserId,
        isActive: true,
      });
      if (!marketingUser) {
        throw new BadRequestException(
          `Nhân viên ID ${updateCustomerDto.marketingUserId} không tồn tại hoặc đã bị khóa`,
        );
      }
      customer.marketingUser = marketingUser;
      customer.marketingUserId = marketingUser.id;
    }

    // Step 2: Handle departmentId assignment explicitly
    if (updateCustomerDto.departmentId === null) {
      customer.department = null;
      customer.departmentId = null;
    } else if (updateCustomerDto.departmentId !== undefined) {
      customer.departmentId = updateCustomerDto.departmentId;
    }

    // Logic cho assignedDate: Tự động set khi salesUserId được gán lần đầu
    if (
      updateCustomerDto.salesUserId &&
      !customer.assignedDate &&
      !updateCustomerDto.assignedDate
    ) {
      (updateCustomerDto as any).assignedDate = todayStr;
    }

    // Logic cho closedDate: Tự động set khi status chuyển sang 'closed' lần đầu
    if (
      updateCustomerDto.status === 'closed' &&
      !customer.closedDate &&
      !updateCustomerDto.closedDate
    ) {
      (updateCustomerDto as any).closedDate = todayStr;
    }

    await this.assertValidStatus(updateCustomerDto.status);

    const oldData = { ...customer };

    try {
      this.customersRepository.merge(customer, {
        ...updateCustomerDto,
        phone:
          updateCustomerDto.phone?.trim() === ''
            ? null
            : updateCustomerDto.phone,
        updatedById: userId,
        updatedBy_OLD: userId, // ← Populate legacy nullable or NOT NULL column
      } as any);

      // FIX For TypeORM relation precedence: Ensure the actual relation is updated
      customer.updatedBy = { id: userId } as User;

      const saved = await this.customersRepository.save(customer);
      this.auditService.logActionAsync(
        userId,
        'UPDATE_CUSTOMER',
        'customer',
        (saved as any).id,
        oldData,
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

  async remove(id: number, userId: number, userRole: string, scope?: string | null) {
    const customer = await this.findOne(id, userId, userRole, scope);
    if (!customer) {
      throw new CustomerNotFoundException();
    }

    if (!CustomerAccessHelper.canDelete(customer, userId, userRole)) {
      throw new UnauthorizedCustomerAccessException(
        'Chỉ Admin mới có quyền xóa khách hàng.',
      );
    }

    await this.customersRepository.softDelete(id);
    this.auditService.logActionAsync(
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
    scope?: string | null,
  ) {
    const userRepo = this.customersRepository.manager.getRepository(User);

    // Validate target users exist and are active
    const targetUsers = await userRepo.find({
      where: salesUserIds.map((id) => ({ id, isActive: true })),
    });

    if (targetUsers.length !== salesUserIds.length) {
      const foundIds = targetUsers.map((u) => u.id);
      const missing = salesUserIds.filter((id) => !foundIds.includes(id));
      throw new BadRequestException(
        `Cảnh báo: Một số Sales User không tồn tại hoặc bị khóa: ${missing.join(', ')}`,
      );
    }

    // Removed department check for bulk assign as visibility is strictly owned
    // Managers and Assistants can assign customers they own to anyone.

    // Thuần theo `scope` PermissionGuard đã tra từ role_permissions - KHÔNG
    // còn fallback cứng theo Role.MANAGER/ASSISTANT. Ngoại lệ duy nhất là
    // Role.ADMIN (đã tính trong isAllScope bên dưới, đồng bộ pattern với
    // các nơi khác giữ Admin làm lối thoát hiểm tường minh).
    const isDepartmentScope = scope === PermissionScope.DEPARTMENT;
    const isAllScope = scope === PermissionScope.ALL || callerRole === Role.ADMIN;

    let callerManagedDepartmentIds: number[] = [];
    if (isDepartmentScope) {
      const departmentRepo = this.customersRepository.manager.getRepository(Department);
      const managed = await departmentRepo.find({
        where: { managerUserId: callerId },
        select: ['id'],
      });
      callerManagedDepartmentIds = managed.map((d) => d.id);
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const today = this.getTodayVn();

    // ============================================================
    // ⚠️ TỐI ƯU PERFORMANCE (không đổi logic nghiệp vụ):
    // Code cũ chạy 1 vòng lặp `for (customerId of customerIds)` và bên trong
    // lại có 1 vòng lặp `for (targetUserId of salesUserIds)`, mỗi vòng đều
    // `await` 1 query riêng lẻ (findOne, findOneBy, save...). Với N khách
    // hàng và M sales, tổng cộng có thể lên tới N*M*3 round-trip DB TUẦN TỰ
    // -> chọn vài trăm khách hàng để "Chia Data" có thể mất hàng chục giây
    // hoặc timeout.
    // Cách sửa: gom các bước thành các query hàng loạt (batch), giữ nguyên
    // 100% quy tắc phân quyền, thông điệp lỗi, và cách đếm success/failed
    // như bản gốc.
    // ============================================================

    // Bước 1: Lấy TẤT CẢ customer liên quan trong 1 query duy nhất
    // (thay vì N query findOne riêng lẻ)
    const customers = await this.customersRepository.find({
      where: { id: In(customerIds), deletedAt: IsNull() },
    });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    // Bước 2: Duyệt qua từng customerId để check tồn tại + phân quyền
    // (thuần in-memory, không còn query trong vòng lặp này)
    const authorizedCustomers: Customer[] = [];

    for (const customerId of customerIds) {
      const customer = customerMap.get(customerId);

      if (!customer) {
        results.errors.push(`Khách hàng ID ${customerId} không tồn tại`);
        results.failed++;
        continue;
      }

      // Authorization check theo đúng bảng phân quyền (xem
      // CustomerAccessHelper): Admin/Assistant được gán mọi khách hàng;
      // Manager chỉ được gán khách hàng thuộc phòng ban mình quản lý.
      // Employee: GIỮ NGUYÊN quy tắc gốc chặt hơn 1 chút so với phạm vi
      // xem/sửa thông thường - chỉ được khởi tạo gán khi khách hàng CHƯA
      // có ai (customer.salesUserId === null) và chính họ là người tạo,
      // HOẶC khi chính họ đang là sales chính hiện tại (re-delegate lead
      // của mình cho đồng nghiệp) - KHÔNG cho phép "giật" 1 khách hàng đã
      // thuộc về người khác chỉ vì họ là người tạo ra data ban đầu.
      if (isAllScope) {
        // Được phép, không cần kiểm tra thêm.
      } else if (isDepartmentScope) {
        if (
          customer.departmentId == null ||
          !callerManagedDepartmentIds.includes(customer.departmentId)
        ) {
          results.errors.push(
            `Khách hàng ID ${customerId}: Bạn không có quyền chia khách hàng ID ${customerId} không thuộc quản lý của bạn.`,
          );
          results.failed++;
          continue;
        }
      } else {
        const isUnassignedCreator =
          customer.salesUserId === null && customer.createdById === callerId;
        const isPrimarySales = customer.salesUserId === callerId;

        if (!isUnassignedCreator && !isPrimarySales) {
          // Giữ nguyên format message y hệt bản gốc (ForbiddenException bị
          // catch rồi ghép thêm prefix "Khách hàng ID X: " phía trước)
          results.errors.push(
            `Khách hàng ID ${customerId}: Bạn không có quyền chia khách hàng ID ${customerId} không thuộc quản lý của bạn.`,
          );
          results.failed++;
          continue;
        }
      }

      authorizedCustomers.push(customer);
    }

    if (authorizedCustomers.length > 0) {
      const authorizedIds = authorizedCustomers.map((c) => c.id);

      // Bước 3: Lấy TẤT CẢ assignment "active" đã tồn tại cho các cặp
      // (customer, sales) liên quan trong 1 query duy nhất (thay vì
      // N*M query findOneBy riêng lẻ)
      const existingAssignments = await this.assignmentRepository.find({
        where: {
          customerId: In(authorizedIds),
          assignedToId: In(salesUserIds),
          status: AssignmentStatus.ACTIVE,
        },
      });
      const existingSet = new Set(
        existingAssignments.map((a) => `${a.customerId}-${a.assignedToId}`),
      );

      // Bước 4: Gom toàn bộ assignment mới cần tạo, insert 1 lần (bulk insert)
      // thay vì N*M lệnh save() riêng lẻ. Điều kiện "chỉ tạo nếu chưa tồn
      // tại" giữ nguyên y hệt bản gốc (kiểm tra qua existingSet).
      const newAssignments: Partial<CustomerAssignment>[] = [];
      for (const customer of authorizedCustomers) {
        for (const targetUserId of salesUserIds) {
          const key = `${customer.id}-${targetUserId}`;
          if (!existingSet.has(key)) {
            newAssignments.push({
              customerId: customer.id,
              assignedById: callerId,
              assignedToId: targetUserId,
              previousAssigneeId: customer.salesUserId || null,
              status: AssignmentStatus.ACTIVE,
              reason: reason || 'Bulk assign',
            });
          }
        }
      }

      if (newAssignments.length > 0) {
        await this.assignmentRepository.insert(newAssignments);
      }

      // Bước 5: Backward compatibility - set primary owner nếu customer
      // chưa có salesUserId. Logic y hệt bản gốc: chỉ set assignedDate nếu
      // customer CHƯA có assignedDate. Tách thành 2 nhóm để batch UPDATE
      // thay vì N lệnh save() riêng lẻ.
      if (salesUserIds.length > 0) {
        const primaryUserId = salesUserIds[0];
        const needPrimary = authorizedCustomers.filter(
          (c) => !c.salesUserId,
        );

        const idsNeedAssignedDate = needPrimary
          .filter((c) => !c.assignedDate)
          .map((c) => c.id);
        const idsKeepAssignedDate = needPrimary
          .filter((c) => c.assignedDate)
          .map((c) => c.id);

        if (idsNeedAssignedDate.length > 0) {
          await this.customersRepository
            .createQueryBuilder()
            .update(Customer)
            .set({
              salesUserId: primaryUserId,
              assignedDate: today,
              updatedById: callerId,
            })
            .whereInIds(idsNeedAssignedDate)
            .execute();
        }

        if (idsKeepAssignedDate.length > 0) {
          await this.customersRepository
            .createQueryBuilder()
            .update(Customer)
            .set({
              salesUserId: primaryUserId,
              updatedById: callerId,
            })
            .whereInIds(idsKeepAssignedDate)
            .execute();
        }
      }

      // Bước 6: Ghi audit log cho từng customer thành công - vẫn 1 dòng log
      // / customer y hệt bản gốc. Dùng logActionAsync() (fire-and-forget qua
      // waitUntil()) thay vì await Promise.all(...) — response không còn
      // phải chờ ghi xong audit log cho toàn bộ customer trong batch.
      authorizedCustomers.forEach((customer) => {
        this.auditService.logActionAsync(
          callerId,
          'ASSIGN_CUSTOMER',
          'customer',
          customer.id,
          null,
          { assignedToIds: salesUserIds },
        );
      });

      results.success += authorizedCustomers.length;
    }

    return {
      ...results,
      message: `Đã xử lý xong gán data. Thành công: ${results.success}, Thất bại: ${results.failed}`,
    };
  }

  /** Lấy danh sách khách chưa assign (salesUserId IS NULL) */
  async getUnassigned(
    filters: CustomerFiltersDto,
    userId: number,
    userRole: string,
    scope?: string | null,
  ) {
    const { page = 1, limit = 20, search, source, creatorId } = filters;

    const qb = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .leftJoinAndSelect('customer.updatedBy', 'updatedBy')
      .where('customer.deletedAt IS NULL');

    // Khách hàng chưa có Primary HOẶC người dùng đang là Primary Sales
    qb.andWhere(
      new Brackets((q) => {
        q.where('customer.salesUserId IS NULL').orWhere(
          'customer.salesUserId = :userId',
          { userId },
        );
      }),
    );

    // Thuần theo `scope` PermissionGuard đã tra từ role_permissions - KHÔNG
    // còn fallback cứng theo Role.ASSISTANT/MANAGER. Ngoại lệ duy nhất là
    // Role.ADMIN.
    if (scope === PermissionScope.ALL || userRole === Role.ADMIN) {
      // Xem toàn bộ pool chưa gán - không lọc gì thêm.
    } else if (scope === PermissionScope.DEPARTMENT) {
      // Chỉ thấy KH chưa Primary trong phạm vi phòng ban mình quản lý,
      // HOẶC KH mà chính mình đang là Primary (không phân biệt phòng ban -
      // họ đã là chủ sở hữu chính thì luôn thấy được, giống mọi role khác).
      qb.andWhere(
        new Brackets((q) => {
          q.where(
            'customer.salesUserId IS NULL AND customer.department_id IN ' +
            '(SELECT d.id FROM departments d WHERE d.manager_user_id = :userId)',
            { userId },
          ).orWhere('customer.salesUserId = :userId', { userId });
        }),
      );
    } else {
    // own (Employee và role lạ khác không có scope rộng hơn): chỉ thấy KH
    // chưa Primary NẾU họ tạo ra, HOẶC KH họ là Primary.
      qb.andWhere(
        new Brackets((q) => {
          q.where(
            'customer.salesUserId IS NULL AND customer.createdById = :userId',
            { userId },
          ).orWhere('customer.salesUserId = :userId', { userId });
        }),
      );
    }

    // Optional: filter by data owner (creator)
    if (creatorId) {
      qb.andWhere('customer.createdById = :creatorId', { creatorId });
    }

    if (source) {
      qb.andWhere('customer.source = :source', { source });
    }

    if (search) {
      this.applyCustomerSearch(qb, search);
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
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Danh sách khách hàng ĐÃ assign (tab "Đã assign" ở trang Chia Data) */
  async getAssigned(params: {
    page: number;
    limit: number;
    salesUserId?: number | null;
    sourceUserId?: number | null;
    search?: string;
    userId: number;
    userRole: string;
    scope?: string | null;
  }) {
    const { page, limit, salesUserId, sourceUserId, search, userId, userRole, scope } = params;
    const skip = (page - 1) * limit;

    const query = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .where('customer.deletedAt IS NULL')
      .andWhere('customer.salesUserId IS NOT NULL'); // Đã assign

    // ⚠️ Trước đây hàm này KHÔNG nhận userId/userRole và KHÔNG áp bất kỳ
    // bộ lọc phân quyền nào - mọi role (kể cả Employee) đều thấy TOÀN BỘ
    // khách hàng đã assign của TẤT CẢ mọi người, bất kể phòng ban/chủ sở
    // hữu. Đây đúng là nguyên nhân bug trong ảnh: 1 Employee đăng nhập
    // nhưng thấy cả data của Sales User khác, Manager, Admin. Thêm dòng
    // dưới để áp đúng CustomerAccessHelper.applyViewFilter() giống mọi
    // endpoint list khách hàng khác (findAll, getStats...).
    //
    // ⚠️ FIX BUG THẬT #2 (rà soát dynamic RBAC): dòng gọi applyViewFilter()
    // ở trên vẫn THIẾU tham số `scope` suốt từ đầu - dù helper đã hỗ trợ
    // sẵn (xem customer-access.helper.ts), không ai truyền vào nên luôn
    // fallback về hardcode role, khiến Admin đổi scope qua trang Phân
    // quyền không có tác dụng thật - CHÍNH XÁC bug trong ảnh chụp màn hình
    // (Employee scope='all' vẫn chỉ thấy 3 khách của mình).
    CustomerAccessHelper.applyViewFilter(query, userId, userRole, scope);

    if (salesUserId) {
      query.andWhere('customer.salesUserId = :salesUserId', { salesUserId });
    }

    if (sourceUserId) {
      query.andWhere('customer.createdById = :sourceUserId', { sourceUserId });
    }

    if (search?.trim()) {
      this.applyCustomerSearch(query, search);
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
  async getAssignmentHistory(customerId: number, userId: number, userRole: string, scope?: string | null) {
    // ⚠️ FIX PERMISSIONS.md mục 2.1/4.0b: trước đây KHÔNG check phạm vi -
    // ai cũng xem được lịch sử gán/thu hồi sales của customer bất kỳ.
    await this.assertCustomerAccessible(customerId, userId, userRole, scope);

    return this.assignmentRepository.find({
      where: { customerId },
      relations: [
        'assignedBy',
        'assignedTo',
        'previousAssignee',
        'reclaimedBy',
      ],
      order: { assignedAt: 'DESC' },
    });
  }

  /**
   * Kiểm tra quyền sửa/thu hồi 1 assignment theo đúng bảng phân quyền:
   * - Admin: luôn được (lối thoát hiểm cứng, không phụ thuộc DB - đồng bộ
   *   với `PermissionGuard`/`RolesService.getMyPermissions()`).
   * - scope='all' (Assistant hệ thống, HOẶC bất kỳ role tuỳ chỉnh nào Admin
   *   cấp quyền `customers.assign` phạm vi 'all' qua trang Phân quyền):
   *   luôn được, không giới hạn.
   * - scope='department' (Manager hệ thống hoặc role tuỳ chỉnh tương ứng):
   *   CHỈ được nếu khách hàng của assignment này thuộc phòng ban mình quản
   *   lý.
   * - scope='own' hoặc thiếu/null (Employee hoặc role tuỳ chỉnh tương ứng):
   *   chỉ khi chính họ là người tạo ra assignment đó (assignedById).
   *
   * ⚠️ SỬA BUG (phát hiện khi rà soát dynamic RBAC): bản trước tự so sánh
   * cứng `callerRole === Role.ADMIN || callerRole === Role.ASSISTANT` ngay
   * trong hàm này - dù ĐÃ đủ 2 role hệ thống, vẫn hoàn toàn "mù" trước role
   * TUỲ CHỈNH Admin tự tạo qua trang Phân quyền (dù được cấp
   * `customers.assign` scope='all', role đó vẫn bị coi như Employee ở đây).
   * Đổi sang đọc `permissionScope` mà `PermissionGuard` đã tra cứu sẵn từ
   * `role_permissions` (truyền qua tham số, xem `GetPermissionScope`
   * decorator) - generalize đúng cho MỌI role, không cần sửa gì thêm khi có
   * role mới.
   */
  private async canModifyAssignment(
    assignment: CustomerAssignment,
    callerId: number,
    callerRole: string,
    permissionScope: string | null | undefined,
  ): Promise<boolean> {
    if (callerRole === Role.ADMIN) return true;
    if (permissionScope === PermissionScope.ALL) return true;

    if (permissionScope === PermissionScope.DEPARTMENT) {
      const deptId = assignment.customer?.departmentId;
      if (deptId == null) return false;
      const departmentRepo = this.customersRepository.manager.getRepository(Department);
      const managed = await departmentRepo.exists({
        where: { id: deptId, managerUserId: callerId },
      });
      return managed;
    }

    return assignment.assignedById === callerId;
  }

  /**
   * Sửa 1 lượt gán data đang ACTIVE: đổi người nhận (assignedToId) và/hoặc
   * lý do (reason) NGAY TRÊN dòng assignment hiện có - không tạo dòng mới,
   * không cần thu hồi trước.
   *
   * Khi đổi người nhận: ghi lại người cũ vào previousAssigneeId (như 1 lượt
   * chuyển giao), và nếu assignment này đang là chủ sở hữu chính của khách
   * hàng (customer.salesUserId), cập nhật luôn customer.salesUserId theo
   * người mới để giữ đồng bộ.
   */
  async updateAssignment(
    assignmentId: number,
    dto: UpdateAssignmentDto,
    callerId: number,
    callerRole: string,
    permissionScope: string | null | undefined,
  ) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id: assignmentId },
      relations: ['customer'],
    });
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy lượt gán data');
    }
    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new BadRequestException(
        'Chỉ có thể sửa lượt gán đang ở trạng thái active (chưa bị thu hồi/chuyển giao)',
      );
    }
    if (!(await this.canModifyAssignment(assignment, callerId, callerRole, permissionScope))) {
      throw new UnauthorizedCustomerAccessException(
        'Bạn không có quyền sửa lượt gán data này - chỉ Admin/Manager hoặc chính người đã tạo lượt gán mới được sửa.',
      );
    }

    const oldData = { ...assignment };

    if (dto.reason !== undefined) {
      assignment.reason = dto.reason;
    }

    if (
      dto.assignedToId !== undefined &&
      dto.assignedToId !== assignment.assignedToId
    ) {
      const userRepo = this.customersRepository.manager.getRepository(User);
      const newUser = await userRepo.findOneBy({
        id: dto.assignedToId,
        isActive: true,
      });
      if (!newUser) {
        throw new BadRequestException(
          `Nhân viên ID ${dto.assignedToId} không tồn tại hoặc đã bị khóa`,
        );
      }

      // Không cho đổi sang người ĐÃ có 1 lượt gán active KHÁC cho CHÍNH
      // khách hàng này (tránh 2 dòng active trùng cặp customer/assignedTo).
      const duplicate = await this.assignmentRepository.findOne({
        where: {
          customerId: assignment.customerId,
          assignedToId: dto.assignedToId,
          status: AssignmentStatus.ACTIVE,
        },
      });
      if (duplicate) {
        throw new BadRequestException(
          `Nhân viên ID ${dto.assignedToId} đã có 1 lượt gán active khác cho khách hàng này rồi`,
        );
      }

      const oldAssignedToId = assignment.assignedToId;
      assignment.previousAssigneeId = oldAssignedToId;
      assignment.assignedToId = dto.assignedToId;
      assignment.assignedTo = newUser;

      const customer = assignment.customer;
      if (customer.salesUserId === oldAssignedToId) {
        customer.salesUserId = dto.assignedToId;
        customer.updatedById = callerId;
        await this.customersRepository.save(customer);
      }
    }

    const saved = await this.assignmentRepository.save(assignment);

    this.auditService.logActionAsync(
      callerId,
      'UPDATE_ASSIGNMENT',
      'customer_assignment',
      assignment.id,
      oldData,
      saved,
    );

    return saved;
  }

  /**
   * Thu hồi (reclaim) 1 lượt gán data đang ACTIVE - chuyển status sang
   * RECLAIMED, ghi lại reclaimedAt/reclaimedById (giữ nguyên dòng làm lịch
   * sử/audit trail, KHÔNG xoá cứng).
   *
   * Xử lý customer.salesUserId (chủ sở hữu chính) sau khi thu hồi:
   * - Nếu người vừa bị thu hồi KHÔNG phải chủ sở hữu chính hiện tại -> không
   *   đổi gì (khách hàng vẫn có người khác đang là chủ sở hữu chính).
   * - Nếu người vừa bị thu hồi ĐÚNG là chủ sở hữu chính, và khách hàng còn
   *   assignee active khác -> chuyển chủ sở hữu chính sang assignee active
   *   được gán SỚM NHẤT còn lại (để salesUserId luôn phản ánh đúng 1 người
   *   đang thực sự phụ trách, không bị "treo" vào người đã bị thu hồi).
   * - Nếu đây là assignee active DUY NHẤT -> set salesUserId = NULL (khách
   *   hàng quay lại trạng thái "chưa gán").
   */
  async reclaimAssignment(
    assignmentId: number,
    callerId: number,
    callerRole: string,
    permissionScope: string | null | undefined,
  ) {
    const assignment = await this.assignmentRepository.findOne({
      where: { id: assignmentId },
      relations: ['customer'],
    });
    if (!assignment) {
      throw new NotFoundException('Không tìm thấy lượt gán data');
    }
    if (assignment.status !== AssignmentStatus.ACTIVE) {
      throw new BadRequestException(
        'Lượt gán này đã được thu hồi hoặc chuyển giao trước đó rồi',
      );
    }
    if (!(await this.canModifyAssignment(assignment, callerId, callerRole, permissionScope))) {
      throw new UnauthorizedCustomerAccessException(
        'Bạn không có quyền thu hồi lượt gán data này - chỉ Admin/Manager hoặc chính người đã tạo lượt gán mới được thu hồi.',
      );
    }

    assignment.status = AssignmentStatus.RECLAIMED;
    assignment.reclaimedAt = new Date();
    assignment.reclaimedById = callerId;
    await this.assignmentRepository.save(assignment);

    const customer = assignment.customer;
    if (customer.salesUserId === assignment.assignedToId) {
      const remainingActive = await this.assignmentRepository.find({
        where: {
          customerId: assignment.customerId,
          status: AssignmentStatus.ACTIVE,
        },
        order: { assignedAt: 'ASC' },
      });
      customer.salesUserId =
        remainingActive.length > 0 ? remainingActive[0].assignedToId : null;
      customer.updatedById = callerId;
      await this.customersRepository.save(customer);
    }

    this.auditService.logActionAsync(
      callerId,
      'RECLAIM_ASSIGNMENT',
      'customer_assignment',
      assignment.id,
      { status: AssignmentStatus.ACTIVE },
      { status: AssignmentStatus.RECLAIMED },
    );

    return { message: 'Đã thu hồi lượt gán data thành công' };
  }

  async getStatsToday(userId: number, userRole: string, scope?: string | null) {
    const baseQuery = () =>
      this.customersRepository
        .createQueryBuilder('customer')
        .leftJoinAndSelect('customer.salesUser', 'salesUser')
        .leftJoinAndSelect('customer.createdBy', 'createdBy')
        .leftJoinAndSelect('customer.updatedBy', 'updatedBy')
        .where('customer.deletedAt IS NULL');

    let todayQuery = baseQuery().andWhere(
      "DATE(CONVERT_TZ(customer.createdAt, '+00:00', '+07:00')) = CURDATE()",
    );

    let historyQuery = baseQuery().andWhere(
      "DATE(CONVERT_TZ(customer.createdAt, '+00:00', '+07:00')) < CURDATE()",
    );

    CustomerAccessHelper.applyViewFilter(
      todayQuery,
      userId,
      userRole,
      scope,
    );
    CustomerAccessHelper.applyViewFilter(
      historyQuery,
      userId,
      userRole,
      scope,
    );

    // ⚠️ Giới hạn (take) để tránh load toàn bộ bảng vào RAM khi 1 ngày có
    // quá nhiều khách hàng mới (ví dụ sau khi import hàng loạt). Trước đây
    // todayList không có take() nào, sẽ phình to dần theo lượng data nhập vào.
    const [todayList, historyList] = await Promise.all([
      todayQuery.orderBy('customer.createdAt', 'DESC').take(500).getMany(),
      historyQuery.orderBy('customer.createdAt', 'DESC').take(50).getMany(),
    ]);

    return { todayList, historyList };
  }

  async getStatsByStatus(userId: number, userRole: string, scope?: string | null) {
    // ⚠️ Trước đây hàm này load TOÀN BỘ customer (mọi status) + join salesUser
    // + createdBy vào RAM rồi mới .filter() bằng JS để tách closed/notClosed.
    // Càng nhiều khách hàng, query này càng chậm tuyến tính vì phải kéo hết
    // dữ liệu về app server dù chỉ cần 2 danh sách.
    // Sửa: lọc status ngay trong SQL (tận dụng idx_status đã có sẵn) + giới
    // hạn số dòng trả về (take) để tránh phình to vô hạn theo thời gian,
    // đồng thời chạy song song 2 query thay vì 1 query lớn rồi tách đôi.
    const baseQuery = () =>
      this.customersRepository
        .createQueryBuilder('customer')
        .leftJoinAndSelect('customer.salesUser', 'salesUser')
        .leftJoinAndSelect('customer.createdBy', 'createdBy')
        .where('customer.deletedAt IS NULL');

    const closedQuery = baseQuery().andWhere('customer.status = :status', {
      status: 'closed',
    });
    const notClosedQuery = baseQuery().andWhere('customer.status != :status', {
      status: 'closed',
    });

    // FIX BUG THẬT (rà soát dynamic RBAC): thiếu tham số `scope` suốt từ
    // đầu - dù helper đã hỗ trợ từ trước, khiến scope cấu hình động ở trang
    // Phân quyền cho `customers.view` hoàn toàn không có tác dụng ở đây,
    // luôn fallback về hardcode role hệ thống cũ.
    CustomerAccessHelper.applyViewFilter(
      closedQuery,
      userId,
      userRole,
      scope,
    );
    CustomerAccessHelper.applyViewFilter(
      notClosedQuery,
      userId,
      userRole,
      scope,
    );

    const STATS_ROW_CAP = 1000;
    const [closed, notClosed] = await Promise.all([
      closedQuery
        .orderBy('customer.createdAt', 'DESC')
        .take(STATS_ROW_CAP)
        .getMany(),
      notClosedQuery
        .orderBy('customer.createdAt', 'DESC')
        .take(STATS_ROW_CAP)
        .getMany(),
    ]);

    return { closed, notClosed };
  }

  async getAllDepositsStats(
    userId: number,
    userRole: string,
    startDate?: string,
    endDate?: string,
    sortBy: string = 'depositDate',
    sortOrder: 'ASC' | 'DESC' = 'DESC',
    scope?: string | null,
  ) {
    const queryBuilder = this.depositsRepository
      .createQueryBuilder('deposit')
      .leftJoinAndSelect('deposit.customer', 'customer')
      .leftJoinAndSelect('deposit.createdBy', 'createdBy')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .where('customer.deletedAt IS NULL');

    // FIX BUG THẬT (rà soát dynamic RBAC): thiếu tham số `scope`, xem giải
    // thích đầy đủ ở getStatsByStatus() phía trên.
    CustomerAccessHelper.applyViewFilter(
      queryBuilder,
      userId,
      userRole,
      scope,
    );

    // Date range filtering on depositDate
    if (startDate) {
      queryBuilder.andWhere('deposit.depositDate >= :startDate', { startDate });
    }
    if (endDate) {
      queryBuilder.andWhere('deposit.depositDate <= :endDate', { endDate });
    }

    // Dynamic sorting
    const sortField =
      sortBy === 'amount' ? 'deposit.amount' : 'deposit.depositDate';
    queryBuilder.orderBy(sortField, sortOrder);

    // ⚠️ Giới hạn số dòng trả về: trước đây .getMany() không có take(), nên
    // khi bảng deposits lớn dần (không lọc theo ngày), API Dashboard này sẽ
    // load toàn bộ deposits + join customer/createdBy/salesUser vào RAM mỗi
    // lần gọi. Cap lại để tránh phình to vô hạn; nếu cần xem hết, nên lọc
    // theo startDate/endDate thay vì bỏ trống.
    const DEPOSITS_ROW_CAP = 1000;
    return await queryBuilder.take(DEPOSITS_ROW_CAP).getMany();
  }

  async getTrash(filters: CustomerFiltersDto) {
    const { page = 1, limit = 20, search } = filters;

    const qb = this.customersRepository
      .createQueryBuilder('customer')
      .withDeleted() // ← include soft-deleted rows
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .where('customer.deletedAt IS NOT NULL'); // ← chỉ lấy đã xóa

    if (search?.trim()) {
      this.applyCustomerSearch(qb, search);
    }

    const [data, total] = await qb
      .orderBy('customer.deletedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async restore(id: number, adminId: number) {
    const customer = await this.customersRepository.findOne({
      where: { id } as any,
      withDeleted: true,
    });

    if (!customer)
      throw new NotFoundException('Không tìm thấy khách hàng trong trash');
    if (!customer.deletedAt)
      throw new BadRequestException('Khách hàng này chưa bị xóa');

    await this.customersRepository.restore(id);

    this.auditService.logActionAsync(
      adminId,
      'RESTORE_CUSTOMER',
      'customer',
      id,
      null,
      { restored: true },
    );

    return { message: 'Khôi phục khách hàng thành công' };
  }

  async hardDelete(id: number, adminId: number) {
    const customer = await this.customersRepository.findOne({
      where: { id } as any,
      withDeleted: true,
    });

    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    if (!customer.deletedAt)
      throw new BadRequestException(
        'Chỉ có thể hard delete khách hàng đã soft delete trước',
      );

    const snapshot = { ...customer };
    await this.customersRepository.delete(id); // hard delete

    this.auditService.logActionAsync(
      adminId,
      'HARD_DELETE_CUSTOMER',
      'customer',
      id,
      snapshot,
      null,
    );

    return { message: 'Đã xóa vĩnh viễn khách hàng' };
  }

  /**
   * Report: liệt kê các khách hàng có "Ngày nhập data" (inputDate) đang VI
   * PHẠM quy tắc "không được ở tương lai" — tức là data cũ được nhập TRƯỚC
   * khi có validation này (hoặc nhập qua đường khác không qua DTO), nên
   * đang tồn tại inputDate > ngày hiện tại (giờ VN).
   *
   * Tận dụng index sẵn có `@Index(['inputDate'])` trên customer.entity.ts
   * -> so sánh trực tiếp trong SQL (customer.inputDate > CURDATE dạng VN),
   * không load toàn bộ bảng vào RAM rồi filter bằng JS.
   */
  async getInvalidDataReport(
    userId: number,
    userRole: string,
    invalidType: string = 'future_date',
    page = 1,
    limit = 20,
    scope?: string | null,
  ) {
    const todayStr = todayVnStr();

    const qb = this.customersRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.salesUser', 'salesUser')
      .leftJoinAndSelect('customer.createdBy', 'createdBy')
      .where('customer.deletedAt IS NULL');

    if (invalidType === 'future_date') {
      qb.andWhere('customer.inputDate > :todayStr', { todayStr });
    } else if (invalidType === 'missing_phone') {
      qb.andWhere('(customer.phone IS NULL OR customer.phone = \'\')');
    } else if (invalidType === 'missing_email') {
      qb.andWhere('(customer.email IS NULL OR customer.email = \'\')');
    } else {
      qb.andWhere('customer.inputDate > :todayStr', { todayStr });
    }

    // FIX BUG THẬT (rà soát dynamic RBAC): thiếu tham số `scope`, xem giải
    // thích đầy đủ ở getStatsByStatus() phía trên.
    CustomerAccessHelper.applyViewFilter(qb, userId, userRole, scope);

    const [data, total] = await qb
      .orderBy('customer.inputDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      checkedAgainst: todayStr,
      invalidType,
    };
  }
}