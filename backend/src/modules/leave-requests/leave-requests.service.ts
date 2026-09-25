import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
import {
  LeaveRequest,
  LeaveStatus,
  LeaveDuration,
} from '../../database/entities/leave-request.entity';
import { LeaveRequestAttachment } from '../../database/entities/leave-request-attachment.entity';
import { User } from '../../database/entities/user.entity';
import { Department } from '../../database/entities/department.entity';
import { DepartmentManager } from '../../database/entities/department-manager.entity';
import { DepartmentManagerHelper } from '../departments/helpers/department-manager.helper';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { UploadsService } from '../uploads/uploads.service';
import { LeaveTypesService } from '../leave-types/leave-types.service';
import { AuditService } from '../audit/audit.service';
import { paginateByWeek, weekStartColumnRef } from '../../common/utils/week-window.util';
import { QueryLeaveRequestsDto } from './dto/query-leave-requests.dto';

/**
 * PERMISSIONS.md mục 2.6 - ĐÃ ĐƯỢC GENERALIZE sang scope-based:
 *
 * Trước đây dùng bảng ELIGIBLE_APPROVER_ROLES cứng (4 role hệ thống). Giờ:
 * - Ai có permission `leave_requests.approve` với scope='all' -> duyệt được mọi đơn.
 * - Ai có permission `leave_requests.approve` với scope='department' -> chỉ duyệt
 *   đơn của nhân viên trong phòng ban mà họ là manager_user_id.
 * - Không có permission hoặc scope=null -> không duyệt được.
 *
 * Lối thoát hiểm: Role.ADMIN luôn bypass tuyệt đối (khớp với PermissionGuard).
 */
@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

  constructor(
    @InjectRepository(LeaveRequest)
    private leaveRequestRepo: Repository<LeaveRequest>,

    @InjectRepository(User)
    private userRepo: Repository<User>,

    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,

    @InjectRepository(LeaveRequestAttachment)
    private attachmentRepo: Repository<LeaveRequestAttachment>,

    private readonly uploadsService: UploadsService,
    // Đọc động isPaid/deductsAnnualBalance theo leaveType.code - thay hoàn
    // toàn so sánh cứng `leaveType === LeaveType.ANNUAL/SICK` cũ (giờ
    // leave_type là VARCHAR tự do, xem CreateLeaveTypes1781500000000).
    private readonly leaveTypesService: LeaveTypesService,
    // ⚠️ MỚI: trước đây module này KHÔNG ghi audit log chung (audit_logs) -
    // toàn bộ vòng đời đơn nghỉ phép (tạo/duyệt/từ chối/huỷ) hoàn toàn không
    // để lại dấu vết ở trang /audit-logs. AuditModule là @Global() nên chỉ
    // cần inject thẳng, không cần khai báo import ở leave-requests.module.ts.
    private readonly auditService: AuditService,
  ) {}

  /**
   * Kiểm tra `approverId` (role `approverRole`, scope `scope`) có được phép
   * duyệt/từ chối đơn của người thuộc `requesterDepartmentId` hay không.
   * Dùng chung cho cả approve() lẫn reject() (1 nguồn duy nhất).
   *
   * Thay thế hoàn toàn ELIGIBLE_APPROVER_ROLES cứng cũ:
   * - scope='all' hoặc Role.ADMIN -> duyệt mọi đơn.
   * - scope='department' -> duyệt được nếu THOẢ 1 TRONG 2:
   *     (a) approver là 1 trong các Manager/Assistant được gán quản lý phòng
   *         ban mà người xin nghỉ thuộc về (bảng `department_managers`, xem
   *         `DepartmentManagerHelper` - đã thay cho cột đơn
   *         `department.managerUserId` cũ, giờ 1 phòng ban có thể có NHIỀU
   *         người quản lý) - rule mặc định, ÁP DỤNG CHO MỌI ROLE người xin
   *         nghỉ kể cả Assistant nếu cùng phòng ban;
   *     (b) approver chính là `requesterLeaveApproverId` - NGOẠI LỆ gán tay
   *         (xem migration AddLeaveApproverOverrideToUsers1781700000000),
   *         dùng cho case người xin nghỉ KHÔNG cùng phòng ban với Manager
   *         nhưng về tổ chức vẫn phải báo cáo Manager đó.
   * - scope khác (null/own/undefined) -> không được duyệt.
   */
  private async isEligibleApprover(
    requesterDepartmentId: number | null,
    approverId: number,
    approverRole: string,
    scope?: string | null,
    requesterLeaveApproverId?: number | null,
  ): Promise<boolean> {
    // Lối thoát hiểm tuyệt đối cho admin - không bao giờ bị khoá dù cấu hình sai
    if (approverRole === Role.ADMIN || scope === PermissionScope.ALL) {
      return true;
    }

    // scope='department' → approver phải là 1 trong các Manager/Assistant
    // được gán quản lý đúng phòng ban người xin nghỉ (bảng
    // department_managers), HOẶC ngoại lệ leave_approver_id gán riêng cho
    // người xin nghỉ đó.
    if (scope === PermissionScope.DEPARTMENT) {
      if (
        requesterLeaveApproverId != null &&
        requesterLeaveApproverId === approverId
      ) {
        return true;
      }
      if (requesterDepartmentId == null) return false;
      const departmentManagerRepo =
        this.departmentRepo.manager.getRepository(DepartmentManager);
      return DepartmentManagerHelper.isManagerOfDepartment(
        departmentManagerRepo,
        requesterDepartmentId,
        approverId,
      );
    }

    // scope=null/own hoặc bất kỳ giá trị khác → không được duyệt
    return false;
  }

  /**
   * Danh sách id phòng ban mà `managerId` đang được gán làm Manager/Assistant
   * quản lý (bảng `department_managers`, có thể nhiều hơn 1 phòng ban) - dùng
   * để lọc findPending()/findHistory() khi viewer là Manager.
   */
  private async getManagedDepartmentIds(managerId: number): Promise<number[]> {
    const departmentManagerRepo =
      this.departmentRepo.manager.getRepository(DepartmentManager);
    return DepartmentManagerHelper.getManagedDepartmentIds(
      departmentManagerRepo,
      managerId,
    );
  }

  /**
   * Áp các filter DÙNG CHUNG cho 4 endpoint danh sách (`findAll`/
   * `findPending`/`findHistory`/`findTrash`) lên 1 QueryBuilder ĐÃ join sẵn
   * `requester` với alias 'requester' - xem `QueryLeaveRequestsDto`. Field
   * nào không có trong `options` thì bỏ qua, không phải endpoint nào cũng
   * dùng hết mọi field (vd `findAll` của riêng mình không cần `departmentId`
   * nhưng có join `requester` sẵn nên không sao nếu FE lỡ truyền).
   */
  private applyListFilters(
    qb: ReturnType<Repository<LeaveRequest>['createQueryBuilder']>,
    alias: string,
    options: QueryLeaveRequestsDto,
  ): void {
    if (options.leaveType) {
      qb.andWhere(`${alias}.leaveType = :leaveType`, { leaveType: options.leaveType });
    }
    if (options.status) {
      qb.andWhere(`${alias}.status = :status`, { status: options.status });
    }
    if (options.departmentId) {
      qb.andWhere('requester.departmentId = :departmentId', { departmentId: options.departmentId });
    }
    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('requester.name LIKE :search', { search })
            .orWhere('requester.email LIKE :search', { search })
            .orWhere(`${alias}.reason LIKE :search`, { search });
        }),
      );
    }
    // Giao khoảng ngày [dateFrom, dateTo] với [startDate, endDate] của đơn -
    // mirror ĐÚNG logic `overlap` FE đang lọc client-side trước đây.
    if (options.dateFrom && options.dateTo) {
      qb.andWhere(`${alias}.startDate <= :dateTo AND ${alias}.endDate >= :dateFrom`, {
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });
    }
  }

  /**
   * Chạy phân trang (item-mode HOẶC week-mode tuỳ `options.weeksPerPage`)
   * trên 1 QueryBuilder ĐÃ áp đủ where/scope/filter - mirror ĐÚNG
   * `AuditService.getLogs()`. Dùng chung cho `findAll`/`findPending`/
   * `findHistory`/`findTrash` để 4 hàm đó không phải chép lại logic này.
   */
  private async paginateList(
    qb: ReturnType<Repository<LeaveRequest>['createQueryBuilder']>,
    alias: string,
    options: QueryLeaveRequestsDto,
    orderByColumn: string,
  ) {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));

    qb.orderBy(`${alias}.${orderByColumn}`, 'DESC');

    if (options.weeksPerPage) {
      const r = await paginateByWeek(qb, {
        weekExpr: weekStartColumnRef(alias),
        page,
        weeksPerPage: options.weeksPerPage,
        weekStart: options.weekStart,
        weekPage: options.weekPage ?? 1,
        weekLimit: options.weekLimit ?? 20,
      });
      return {
        data: r.data,
        total: r.total,
        page,
        limit: options.weeksPerPage,
        totalPages: r.totalPages,
        weeks: r.weeks,
        weekTotal: r.weekTotal,
        ...r.meta,
      };
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  /**
   * Validate cặp Period Hours (Optional) - khung giờ Từ - Đến trong ngày,
   * TÁCH BIỆT với `duration`/`totalDays`. Rule:
   * - Cả 2 đều rỗng/undefined/null -> hợp lệ (không dùng Period Hours).
   * - Chỉ có 1 trong 2 -> lỗi (phải khai đủ cặp).
   * - Có đủ cặp -> phải đúng định dạng HH:mm hoặc HH:mm:ss VÀ start < end.
   * Dùng chung cho cả create() lẫn update() (1 nguồn duy nhất).
   */
  private validatePeriodHours(
    periodStartTime?: string | null,
    periodEndTime?: string | null,
  ): void {
    const hasStart = periodStartTime !== undefined && periodStartTime !== null && periodStartTime !== '';
    const hasEnd = periodEndTime !== undefined && periodEndTime !== null && periodEndTime !== '';

    if (!hasStart && !hasEnd) {
      return;
    }

    if (hasStart !== hasEnd) {
      throw new BadRequestException(
        'Period Hours cần khai đủ cả Giờ bắt đầu và Giờ kết thúc, hoặc để trống cả hai',
      );
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
    if (!timeRegex.test(periodStartTime as string) || !timeRegex.test(periodEndTime as string)) {
      throw new BadRequestException('Period Hours phải theo định dạng HH:mm (hoặc HH:mm:ss)');
    }

    if ((periodStartTime as string) >= (periodEndTime as string)) {
      throw new BadRequestException('Giờ bắt đầu (Period Hours) phải trước Giờ kết thúc');
    }
  }

  /**
   * Đơn bổ sung (Nghỉ phép Bổ sung): startDate (ngày xin nghỉ) SỚM HƠN ngày
   * tạo đơn (hôm nay, so sánh chỉ theo ngày - bỏ giờ phút giây) => người
   * dùng đang tạo bù cho ngày đã qua (quên tạo trước). Chỉ gọi Ở create(),
   * KHÔNG gọi lại ở update() - xem comment ở `LeaveRequest.isSupplementary`.
   */
  private computeIsSupplementary(startDate: Date): boolean {
    const todayOnly = new Date();
    todayOnly.setHours(0, 0, 0, 0);
    const startOnly = new Date(startDate);
    startOnly.setHours(0, 0, 0, 0);
    return startOnly.getTime() < todayOnly.getTime();
  }

  /**
   * Create new leave request
   * Validation: Balance check only (KHÔNG còn conflict/overlap check - xem
   * comment "BYPASS" bên trong)
   */
  async create(dto: any, requesterId: number) {
    // 0. Validate leaveType tồn tại trong `leave_types` - cột leave_type giờ
    // VARCHAR tự do (không còn ENUM tự chặn ở tầng DB như trước), PHẢI
    // validate ở đây trước khi tạo đơn.
    const leaveType = await this.leaveTypesService.assertExists(dto.leaveType);

    // 1. Validate dates
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate > endDate) {
      throw new BadRequestException(
        'Ngày bắt đầu không được sau ngày kết thúc',
      );
    }

    // 2. Calculate total days
    const totalDays = this.calculateDays(startDate, endDate, dto.duration);

    // 2b. Validate Period Hours (Optional) - xem validatePeriodHours() để
    // biết rule đầy đủ. KHÔNG ảnh hưởng totalDays.
    this.validatePeriodHours(dto.periodStartTime, dto.periodEndTime);

    // 3. ⚠️ BYPASS theo yêu cầu chủ dự án (22/9): TRƯỚC ĐÂY chặn "Bạn đã có
    // đơn nghỉ trong khoảng thời gian này" khi đơn mới overlap ngày với BẤT
    // KỲ đơn PENDING/APPROVED nào đã có của cùng người (kể cả khác loại phép
    // - vd đã có đơn "Không lương" cả tháng, không tạo được đơn "Gặp khách"
    // ngày bất kỳ trong tháng đó dù không xung đột thực tế về nghiệp vụ).
    // Chủ dự án xác nhận đây không phải rule mong muốn -> bỏ hẳn việc chặn
    // tạo đơn theo overlap ngày. Không xoá hẳn dữ liệu lịch sử/logic tính
    // ngày (`calculateDays()`) - chỉ bỏ bước validate này. Nếu sau này cần
    // bật lại, xem lịch sử git của khối code này (đã có sẵn logic phân biệt
    // half_day/full_day đúng, chỉ cần gọi lại).

    // 4. Check balance (loại phép có deductsAnnualBalance=true, mặc định
    // đúng 2 code cũ 'annual'/'sick' - xem seed CreateLeaveTypes1781500000000)
    if (leaveType.deductsAnnualBalance) {
      const user = await this.userRepo.findOne({ where: { id: requesterId } });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.annualLeaveBalance < totalDays) {
        throw new BadRequestException(
          `Không đủ phép năm. Còn lại: ${user.annualLeaveBalance} ngày, cần: ${totalDays} ngày`,
        );
      }
    }

    // 5. Validate + lưu ảnh đính kèm (nếu có) - dto.attachmentKeys là mảng
    // object key đã PUT thẳng lên B2 qua POST /leave-requests/attachments/presign
    const attachmentKeys: string[] = Array.isArray(dto.attachmentKeys)
      ? dto.attachmentKeys
      : [];
    if (attachmentKeys.length > 0) {
      const limits = await this.uploadsService.getLimits();
      if (attachmentKeys.length > limits.leaveAttachmentMaxCount) {
        throw new BadRequestException(
          `Tối đa ${limits.leaveAttachmentMaxCount} ảnh đính kèm / đơn`,
        );
      }
      // Kiểm tra dung lượng thật từng ảnh trên B2 - làm TUẦN TỰ (không
      // Promise.all) để dừng ngay + xoá đúng ảnh vi phạm khi gặp lỗi đầu
      // tiên, tránh xoá nhầm/rối trạng thái khi nhiều ảnh cùng lỗi song song.
      for (const key of attachmentKeys) {
        await this.uploadsService.assertUploadedSizeWithinLimit(
          this.uploadsService.leaveAttachmentsBucket,
          key,
          limits.leaveAttachmentMaxSizeKb,
        );
      }
    }

    // 6. Create request
    const leaveRequest = this.leaveRequestRepo.create({
      requesterId,
      leaveType: dto.leaveType,
      startDate,
      endDate,
      duration: dto.duration,
      totalDays,
      reason: dto.reason,
      status: LeaveStatus.PENDING,
      // Period Hours (Optional) - undefined/'' đều chuẩn hoá về null, tránh
      // ghi chuỗi rỗng xuống cột TIME.
      periodStartTime: dto.periodStartTime || null,
      periodEndTime: dto.periodEndTime || null,
      // Đơn bổ sung - xem computeIsSupplementary()
      isSupplementary: this.computeIsSupplementary(startDate),
    });

    const saved = await this.leaveRequestRepo.save(leaveRequest);

    if (attachmentKeys.length > 0) {
      const rows = attachmentKeys.map((objectKey) =>
        this.attachmentRepo.create({ leaveRequestId: saved.id, objectKey }),
      );
      await this.attachmentRepo.save(rows);
    }

    this.auditService.logActionAsync(
      requesterId,
      'CREATE_LEAVE_REQUEST',
      'leave_request',
      saved.id,
      null,
      {
        leaveType: leaveType.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        totalDays: saved.totalDays,
        reason: saved.reason,
        periodStartTime: saved.periodStartTime,
        periodEndTime: saved.periodEndTime,
      },
    );

    return saved;
  }

  /**
   * Sửa 1 đơn nghỉ phép ĐÃ TỒN TẠI (PENDING hoặc APPROVED) - phục vụ trường
   * hợp User báo lỡ set sai ngày sau khi đã gửi (hoặc đã được duyệt rồi).
   * CHỈ người có quyền `leave_requests.edit` (không phải chính requester -
   * đây là hành động QUẢN TRỊ "sửa hộ", khác hẳn `cancel()` vốn do chính chủ
   * tự huỷ đơn của mình) mới gọi được, theo đúng rule role-cặp
   * `isEligibleApprover` (mirror approve()/reject(): admin=all, hoặc
   * Manager/Assistant quản lý đúng phòng ban requester / được gán
   * `leave_approver_id` riêng).
   *
   * Field cho sửa: `leaveType`/`startDate`/`endDate`/`duration`/`reason` -
   * TẤT CẢ optional, chỉ đổi field nào thực sự có mặt trong dto (partial
   * update, giống pattern PATCH thông thường trong repo). Không cho sửa đơn
   * đã CANCELLED/REJECTED (đơn đã đóng - muốn đổi thì tạo đơn mới), chỉ
   * PENDING/APPROVED.
   *
   * ⚠️ KHÔNG check overlap/conflict khi sửa - đối xứng với `create()` đã
   * bypass theo yêu cầu chủ dự án 22/9 (xem comment "BYPASS" ở create()).
   *
   * ⚠️ QUAN TRỌNG - cân bằng lại `annualLeaveBalance` nếu đơn đang
   * APPROVED: `approve()` đã trừ `totalDays` CŨ vào balance rồi (nếu loại
   * phép cũ `deductsAnnualBalance`) - sửa ngày/loại phép ở đây làm
   * `totalDays` đổi, nên phải HOÀN lại đúng số cũ trước, rồi TRỪ lại đúng số
   * MỚI (nếu loại phép mới cũng `deductsAnnualBalance`), tránh lệch số dư
   * phép năm vĩnh viễn. Đơn đang PENDING thì `approve()` chưa từng chạy nên
   * chưa đụng balance - không cần hoàn/trừ gì ở bước này.
   */
  async update(
    requestId: number,
    dto: {
      leaveType?: string;
      startDate?: string;
      endDate?: string;
      duration?: LeaveDuration;
      reason?: string;
      // Period Hours (Optional) - truyền '' hoặc null để xoá cặp giờ đã có.
      periodStartTime?: string | null;
      periodEndTime?: string | null;
    },
    editorId: number,
    editorRole: string,
    scope?: string | null,
  ) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId },
      relations: ['requester'],
    });

    if (!request) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    }

    if (
      request.status !== LeaveStatus.PENDING &&
      request.status !== LeaveStatus.APPROVED
    ) {
      throw new BadRequestException(
        'Chỉ sửa được đơn đang Chờ duyệt hoặc Đã duyệt',
      );
    }

    const allowed = await this.isEligibleApprover(
      request.requester.departmentId,
      editorId,
      editorRole,
      scope,
      request.requester.leaveApproverId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Bạn không có quyền sửa đơn nghỉ phép của người này',
      );
    }

    // Loại phép cũ (trước khi sửa) - cần để hoàn balance đúng nếu đơn đang
    // APPROVED. Đọc động qua LeaveTypesService (không so sánh cứng), đúng
    // pattern approve() - coi như false nếu loại phép đã bị xoá (hiếm).
    const oldLeaveType = await this.leaveTypesService.getByCode(
      request.leaveType,
    );
    const oldTotalDays = request.totalDays;

    let newLeaveTypeCode = request.leaveType;
    let newLeaveTypeRow = oldLeaveType;
    if (dto.leaveType !== undefined && dto.leaveType !== request.leaveType) {
      newLeaveTypeRow = await this.leaveTypesService.assertExists(
        dto.leaveType,
      );
      newLeaveTypeCode = dto.leaveType;
    }

    // ⚠️ new Date(...) LUÔN BỌC CẢ 2 NHÁNH (kể cả khi giữ nguyên giá trị cũ) -
    // request.startDate/endDate lấy từ TypeORM cho cột `date` có thể trả về
    // dạng khác Date instance tuỳ driver, `calculateDays()` bên dưới gọi
    // thẳng `.getTime()` nên phải chuẩn hoá chắc chắn là Date ở cả 2 nhánh.
    const newStartDate = new Date(dto.startDate ?? request.startDate);
    const newEndDate = new Date(dto.endDate ?? request.endDate);
    const newDuration = dto.duration ?? request.duration;

    if (newStartDate > newEndDate) {
      throw new BadRequestException(
        'Ngày bắt đầu không được sau ngày kết thúc',
      );
    }

    const newTotalDays = this.calculateDays(
      newStartDate,
      newEndDate,
      newDuration,
    );

    // Period Hours (Optional) - chỉ field nào THỰC SỰ có mặt trong dto mới
    // đổi (partial update, giống các field khác ở update()); field không có
    // trong dto giữ nguyên giá trị cũ. Chuẩn hoá '' về null (cách để FE xoá
    // cặp giờ đã lưu).
    const newPeriodStartTime =
      dto.periodStartTime !== undefined ? dto.periodStartTime || null : request.periodStartTime;
    const newPeriodEndTime =
      dto.periodEndTime !== undefined ? dto.periodEndTime || null : request.periodEndTime;
    this.validatePeriodHours(newPeriodStartTime, newPeriodEndTime);

    // Cân bằng lại phép năm - CHỈ áp dụng khi đơn đang APPROVED (xem JSDoc).
    if (request.status === LeaveStatus.APPROVED) {
      if (oldLeaveType?.deductsAnnualBalance) {
        await this.userRepo.increment(
          { id: request.requesterId },
          'annualLeaveBalance',
          oldTotalDays,
        );
      }
      if (newLeaveTypeRow?.deductsAnnualBalance) {
        const user = await this.userRepo.findOne({
          where: { id: request.requesterId },
        });
        if (!user) {
          throw new NotFoundException('User not found');
        }
        if (user.annualLeaveBalance < newTotalDays) {
          // Đã lỡ hoàn balance cũ ở trên (nếu có) - trừ lại ĐÚNG bằng đó để
          // không để user "dư" phép khi dừng giữa chừng vì thiếu phép mới.
          if (oldLeaveType?.deductsAnnualBalance) {
            await this.userRepo.decrement(
              { id: request.requesterId },
              'annualLeaveBalance',
              oldTotalDays,
            );
          }
          throw new BadRequestException(
            `Không đủ phép năm để sửa đơn. Còn lại: ${user.annualLeaveBalance} ngày, cần: ${newTotalDays} ngày`,
          );
        }
        await this.userRepo.decrement(
          { id: request.requesterId },
          'annualLeaveBalance',
          newTotalDays,
        );
      }
    }

    const before = {
      leaveType: request.leaveType,
      startDate: request.startDate,
      endDate: request.endDate,
      duration: request.duration,
      totalDays: request.totalDays,
      reason: request.reason,
      periodStartTime: request.periodStartTime,
      periodEndTime: request.periodEndTime,
    };

    request.leaveType = newLeaveTypeCode;
    request.startDate = newStartDate;
    request.endDate = newEndDate;
    request.duration = newDuration;
    request.totalDays = newTotalDays;
    request.periodStartTime = newPeriodStartTime;
    request.periodEndTime = newPeriodEndTime;
    if (dto.reason !== undefined) {
      request.reason = dto.reason;
    }

    const saved = await this.leaveRequestRepo.save(request);

    this.auditService.logActionAsync(
      editorId,
      'EDIT_LEAVE_REQUEST',
      'leave_request',
      saved.id,
      before,
      {
        leaveType: saved.leaveType,
        startDate: saved.startDate,
        endDate: saved.endDate,
        duration: saved.duration,
        totalDays: saved.totalDays,
        reason: saved.reason,
        periodStartTime: saved.periodStartTime,
        periodEndTime: saved.periodEndTime,
      },
    );

    return saved;
  }

  /**
   * Ký Presigned GET URL (TTL 10 phút) cho toàn bộ ảnh đính kèm của 1 đơn -
   * chỉ cho phép CHỦ ĐƠN hoặc người có quyền duyệt/xem đúng scope (giống
   * hệt rule `isEligibleApprover` dùng cho approve/reject, CỘNG THÊM
   * trường hợp chính chủ dù họ không có `leave_requests.view/approve`).
   */
  async getAttachmentViewUrls(
    requestId: number,
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
  ): Promise<{ id: number; key: string; url: string }[]> {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId },
      relations: ['requester', 'attachments'],
    });
    if (!request) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    }

    const isOwner = request.requesterId === viewerId;
    const canApproveOrView =
      viewerRole === Role.ADMIN ||
      scope === PermissionScope.ALL ||
      (await this.isEligibleApprover(
        request.requester.departmentId,
        viewerId,
        viewerRole,
        scope,
        request.requester.leaveApproverId,
      ));

    if (!isOwner && !canApproveOrView) {
      throw new ForbiddenException(
        'Bạn không có quyền xem ảnh đính kèm của đơn này',
      );
    }

    return Promise.all(
      (request.attachments || []).map(async (a) => ({
        id: a.id,
        // objectKey thô trên B2 - trả thêm để FE build cacheKey CHUNG với
        // storage-img (buildImageCacheKey('leave-attachments', key)), tránh
        // cache trùng 2 bản cho cùng 1 ảnh đính kèm (trước đây FE tự cache
        // theo `id` - đúng nhưng KHÔNG khớp key mà storage-img dùng, nên
        // cùng 1 ảnh bị tải + lưu 2 lần khác nhau).
        key: a.objectKey,
        url: await this.uploadsService.signAttachmentGetUrl(a.objectKey),
      })),
    );
  }

  /**
   * Lấy các đơn nghỉ phép ĐÃ DUYỆT có khoảng ngày giao với [from, to].
   * Dùng để dựng bảng "Tổng hợp chấm công" theo tháng (đánh dấu X/2, KL...).
   *
   * KHÔNG lọc theo role/cấp bậc (khác findHistory/findPending): bảng tổng
   * hợp hiển thị TOÀN BỘ nhân viên trả về từ useUsersList() (không lọc role),
   * và getAttendanceSummary() cũng không lọc role. Nếu áp lại logic "chỉ thấy
   * cấp dưới" ở đây (bản cũ dùng getSubordinateRoles), người xem sẽ bị thiếu
   * dấu nghỉ phép (X/2, KL, P) cho chính role của họ và các role cao hơn -
   * vd Admin xem bảng sẽ không thấy đơn nghỉ đã duyệt của chính "Admin" hay
   * của Manager cùng cấp/khác nhánh, dù dòng nhân viên đó vẫn hiện trên bảng.
   */
  async findApprovedInRange(from: string, to: string) {
    return (
      this.leaveRequestRepo
        .createQueryBuilder('leave')
        .leftJoinAndSelect('leave.requester', 'requester')
        .leftJoinAndSelect('requester.department', 'department')
        .where('leave.status = :status', { status: LeaveStatus.APPROVED })
        // Giao khoảng ngày: đơn nghỉ có startDate <= to AND endDate >= from
        .andWhere('leave.startDate <= :to', { to })
        .andWhere('leave.endDate >= :from', { from })
        .orderBy('leave.startDate', 'ASC')
        .getMany()
    );
  }

  /**
   * Get requests for the current user (My Leave Requests)
   *
   * ⚠️ ĐỔI (yêu cầu người dùng: "Phân trang cho nghi-phep ... để data lớn
   * lên không bị Lag"): trước đây trả THẲNG mảng đầy đủ, FE tự lọc/gộp tuần
   * ở RAM (`WeekGroupedRequests` cũ) - giờ filter/pagination chuyển hẳn
   * xuống DB qua `applyListFilters()`/`paginateList()` (mirror
   * `AuditService.getLogs()`), hỗ trợ CẢ item-mode (page/limit) lẫn
   * week-mode (`weeksPerPage`, dùng cho trang "4 tuần"). Trả về
   * `{data, total, page, limit, totalPages, [weeks]}` thay vì mảng trần -
   * xem `useSidebarBadgeCounts.ts` (đã đổi sang đọc `.total`).
   */
  async findAll(userId: number, options: QueryLeaveRequestsDto = {}) {
    const qb = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('leave.approver', 'approver')
      .loadRelationCountAndMap('leave.attachmentCount', 'leave.attachments')
      .where('leave.requesterId = :userId', { userId });

    this.applyListFilters(qb, 'leave', options);

    return this.paginateList(qb, 'leave', options, 'createdAt');
  }

  /**
   * Danh sách đơn đang chờ duyệt MÀ VIEWER CÓ QUYỀN DUYỆT - theo scope.
   *
   * ⚠️ ĐỔI (yêu cầu người dùng, mirror `findAll()` ở trên): filter (search/
   * phòng ban/loại phép) + phân trang (item HOẶC week-mode) giờ chạy Ở DB
   * qua `applyListFilters()`/`paginateList()`, KHÔNG còn trả nguyên mảng để
   * FE tự lọc/gộp tuần client-side như bản cũ.
   */
  async findPending(
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
    options: QueryLeaveRequestsDto = {},
  ) {
    // Thuần theo scope từ role_permissions - không fallback cứng theo Role.
    const isDeptScope = scope === PermissionScope.DEPARTMENT;
    const isAllScope = scope === PermissionScope.ALL;

    if (viewerRole !== Role.ADMIN && !isAllScope && !isDeptScope) {
      return { data: [], total: 0, page: options.page ?? 1, limit: options.limit ?? 20, totalPages: 1 };
    }

    const qb = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      // Đếm số ảnh đính kèm ngay trong list - xem comment ở
      // `LeaveRequest.attachmentCount` (entity) - FE hiện số lượng ở nút
      // "Đính kèm" mà không cần bấm vào từng đơn.
      .loadRelationCountAndMap('leave.attachmentCount', 'leave.attachments')
      .where('leave.status = :status', { status: LeaveStatus.PENDING });

    if (viewerRole !== Role.ADMIN && !isAllScope && isDeptScope) {
      const managedIds = await this.getManagedDepartmentIds(viewerId);
      // Đối xứng với isEligibleApprover(): ngoài phòng ban đang quản lý,
      // cộng thêm những requester gán riêng leave_approver_id = viewerId
      // (ngoại lệ, không cùng phòng ban). Nếu Manager không quản lý phòng
      // ban nào NHƯNG có ngoại lệ gán riêng, vẫn phải thấy - không return
      // [] sớm như trước migration AddLeaveApproverOverrideToUsers nữa.
      if (managedIds.length === 0) {
        qb.andWhere('requester.leaveApproverId = :viewerId', { viewerId });
      } else {
        qb.andWhere(
          new Brackets((sub) => {
            sub.where('requester.departmentId IN (:...deptIds)', {
              deptIds: managedIds,
            }).orWhere('requester.leaveApproverId = :viewerId', { viewerId });
          }),
        );
      }
    }

    this.applyListFilters(qb, 'leave', options);

    return this.paginateList(qb, 'leave', options, 'createdAt');
  }

  /**
   * Lịch sử duyệt (Approved/Rejected) trong phạm vi VIEWER CÓ QUYỀN DUYỆT -
   * cùng bộ lọc scope với findPending().
   *
   * ⚠️ ĐỔI (yêu cầu người dùng, mirror `findPending()`): filter + phân trang
   * (item/week-mode) chuyển xuống DB, KHÔNG còn cap cứng "200 bản ghi gần
   * nhất" của bản trước - week-mode/item-mode đều đã phân trang thật ở DB
   * nên không cần cap nữa (dữ liệu nhiều lên vẫn nhẹ, xem `paginateList()`).
   */
  async findHistory(
    viewerId: number,
    viewerRole: string,
    scope?: string | null,
    options: QueryLeaveRequestsDto = {},
  ) {
    // Thuần theo scope từ role_permissions - không fallback cứng theo Role.
    const isDeptScopeH = scope === PermissionScope.DEPARTMENT;
    const isAllScopeH = scope === PermissionScope.ALL;

    if (viewerRole !== Role.ADMIN && !isAllScopeH && !isDeptScopeH) {
      return { data: [], total: 0, page: options.page ?? 1, limit: options.limit ?? 20, totalPages: 1 };
    }

    const qb = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .leftJoinAndSelect('leave.approver', 'approver')
      // Mirror findPending() - xem comment ở `LeaveRequest.attachmentCount`.
      .loadRelationCountAndMap('leave.attachmentCount', 'leave.attachments')
      .where('leave.status IN (:...statuses)', {
        statuses: [LeaveStatus.APPROVED, LeaveStatus.REJECTED],
      });

    if (viewerRole !== Role.ADMIN && !isAllScopeH && isDeptScopeH) {
      const managedIds = await this.getManagedDepartmentIds(viewerId);
      // Đối xứng với findPending()/isEligibleApprover() - xem comment ở đó.
      if (managedIds.length === 0) {
        qb.andWhere('requester.leaveApproverId = :viewerId', { viewerId });
      } else {
        qb.andWhere(
          new Brackets((sub) => {
            sub.where('requester.departmentId IN (:...deptIds)', {
              deptIds: managedIds,
            }).orWhere('requester.leaveApproverId = :viewerId', { viewerId });
          }),
        );
      }
    }

    this.applyListFilters(qb, 'leave', options);

    // ⚠️ FIX BUG THẬT (2026-09-23, User báo "đơn Sửa bị nhảy lên đầu"): sort
    // theo `createdAt` (không phải `updatedAt`) - mirror đúng findPending(),
    // giữ nguyên qua lần đổi sang phân trang thật này.
    return this.paginateList(qb, 'leave', options, 'createdAt');
  }

  /**
   * Thùng rác (Tab "Thùng rác" ở `duyet-phep`) - đơn nghỉ phép ĐÃ XOÁ MỀM,
   * trong phạm vi VIEWER CÓ QUYỀN XOÁ (`leave_requests.delete`, cùng cơ chế
   * scope với `isEligibleApprover()` - ai xoá được thì xem/khôi phục được
   * đúng phạm vi đó). Gọi `.withDeleted()` để TypeORM không tự ẩn các dòng
   * đã xoá mềm (mặc định `@DeleteDateColumn` khiến MỌI QueryBuilder tự thêm
   * `deletedAt IS NULL` trừ khi gọi hàm này).
   */
  async findTrash(
    viewerId: number,
    viewerRole: string,
    scope: string | null | undefined,
    options: QueryLeaveRequestsDto = {},
  ) {
    const isDeptScope = scope === PermissionScope.DEPARTMENT;
    const isAllScope = scope === PermissionScope.ALL;

    if (viewerRole !== Role.ADMIN && !isAllScope && !isDeptScope) {
      return { data: [], total: 0, page: options.page ?? 1, limit: options.limit ?? 20, totalPages: 1 };
    }

    const qb = this.leaveRequestRepo
      .createQueryBuilder('leave')
      .withDeleted()
      .leftJoinAndSelect('leave.requester', 'requester')
      .leftJoinAndSelect('requester.department', 'department')
      .leftJoinAndSelect('leave.deletedBy', 'deletedBy')
      .loadRelationCountAndMap('leave.attachmentCount', 'leave.attachments')
      .where('leave.deletedAt IS NOT NULL');

    if (viewerRole !== Role.ADMIN && !isAllScope && isDeptScope) {
      const managedIds = await this.getManagedDepartmentIds(viewerId);
      if (managedIds.length === 0) {
        qb.andWhere('requester.leaveApproverId = :viewerId', { viewerId });
      } else {
        qb.andWhere(
          new Brackets((sub) => {
            sub.where('requester.departmentId IN (:...deptIds)', {
              deptIds: managedIds,
            }).orWhere('requester.leaveApproverId = :viewerId', { viewerId });
          }),
        );
      }
    }

    this.applyListFilters(qb, 'leave', options);

    return this.paginateList(qb, 'leave', options, 'deletedAt');
  }

  /**
   * Approve request
   * Permission: bảng role-cặp ở đầu file (isEligibleApprover) - thay hoàn
   * toàn kiểm tra RolePriority cũ.
   */
  async approve(
    requestId: number,
    approverId: number,
    userRole: string,
    scope?: string | null,
  ) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId },
      relations: ['requester'],
    });

    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Can only approve pending requests');
    }

    const allowed = await this.isEligibleApprover(
      request.requester.departmentId,
      approverId,
      userRole,
      scope,
      request.requester.leaveApproverId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Bạn không có quyền phê duyệt đơn của người này',
      );
    }

    // Deduct balance - đọc động deductsAnnualBalance theo leaveType.code
    // (thay so sánh cứng LeaveType.ANNUAL/SICK cũ). Loại phép có thể đã bị
    // xoá sau khi đơn được tạo (hiếm, race condition) - coi như false, không
    // chặn duyệt đơn vì lý do này.
    const leaveTypeRow = await this.leaveTypesService.getByCode(
      request.leaveType,
    );
    if (leaveTypeRow?.deductsAnnualBalance) {
      await this.userRepo.decrement(
        { id: request.requesterId },
        'annualLeaveBalance',
        request.totalDays,
      );
    }

    // Update request
    request.status = LeaveStatus.APPROVED;
    request.approverId = approverId;
    request.approvedAt = new Date();

    const saved = await this.leaveRequestRepo.save(request);

    this.auditService.logActionAsync(
      approverId,
      'APPROVE_LEAVE_REQUEST',
      'leave_request',
      saved.id,
      { status: LeaveStatus.PENDING },
      {
        status: LeaveStatus.APPROVED,
        requester: { id: request.requesterId, name: request.requester.name },
        leaveType: request.leaveType,
        totalDays: request.totalDays,
      },
    );

    return saved;
  }

  /**
   * Reject request - cùng rule role-cặp với approve() (isEligibleApprover).
   */
  async reject(
    requestId: number,
    approverId: number,
    rejectionReason: string,
    userRole: string,
    scope?: string | null,
  ) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId },
      relations: ['requester'],
    });

    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Can only reject pending requests');
    }

    const allowed = await this.isEligibleApprover(
      request.requester.departmentId,
      approverId,
      userRole,
      scope,
      request.requester.leaveApproverId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Bạn không có quyền từ chối đơn của người này',
      );
    }

    if (!rejectionReason || rejectionReason.trim() === '') {
      throw new BadRequestException('Vui lòng nhập lý do từ chối');
    }

    // Update request
    request.status = LeaveStatus.REJECTED;
    request.approverId = approverId;
    request.rejectedAt = new Date();
    request.rejectionReason = rejectionReason;

    const saved = await this.leaveRequestRepo.save(request);

    this.auditService.logActionAsync(
      approverId,
      'REJECT_LEAVE_REQUEST',
      'leave_request',
      saved.id,
      { status: LeaveStatus.PENDING },
      {
        status: LeaveStatus.REJECTED,
        requester: { id: request.requesterId, name: request.requester.name },
        rejectionReason,
      },
    );

    return saved;
  }

  /**
   * Cancel request (by requester)
   *
   * ⚠️ CẬP NHẬT (theo yêu cầu): huỷ đơn giờ dọn luôn ảnh đính kèm (nếu có) -
   * cả object thật trên B2 lẫn dòng `leave_request_attachments` trong DB.
   * Đơn đã huỷ không còn nghiệp vụ nào cần giữ ảnh (thường là giấy khám
   * bệnh - dữ liệu sức khoẻ nhạy cảm), không nên để tồn tại vô thời hạn.
   * Xoá B2 làm BEST-EFFORT (log warn nếu lỗi) - KHÔNG chặn việc huỷ đơn
   * nếu bước xoá ảnh gặp sự cố (giống pattern `deleteAvatar` ở uploads.service.ts).
   */
  async cancel(requestId: number, requesterId: number) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id: requestId, requesterId },
      relations: ['attachments'],
    });

    if (!request) {
      throw new NotFoundException('Leave request not found');
    }

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn đang chờ duyệt');
    }

    request.status = LeaveStatus.CANCELLED;
    request.cancelledAt = new Date();

    const saved = await this.leaveRequestRepo.save(request);

    const attachments = request.attachments || [];
    if (attachments.length > 0) {
      await Promise.all(
        attachments.map((a) =>
          this.uploadsService
            .deleteObject(
              this.uploadsService.leaveAttachmentsBucket,
              a.objectKey,
            )
            .catch((err) =>
              this.logger.warn(
                `Không xoá được ảnh đính kèm khi huỷ đơn: ${a.objectKey}`,
                err,
              ),
            ),
        ),
      );
      await this.attachmentRepo.remove(attachments);
    }

    this.auditService.logActionAsync(
      requesterId,
      'CANCEL_LEAVE_REQUEST',
      'leave_request',
      saved.id,
      { status: LeaveStatus.PENDING },
      { status: LeaveStatus.CANCELLED },
    );

    return saved;
  }

  /**
   * Xoá MỀM (đưa vào Thùng rác) - permission `leave_requests.delete`, dùng
   * LẠI đúng `isEligibleApprover()` (cùng scope với approve/reject/xem
   * pending-history): admin/scope='all' -> mọi đơn, scope='department' ->
   * chỉ đơn của nhân viên phòng ban mình quản lý (hoặc ngoại lệ
   * leaveApproverId gán riêng). Không cho xoá đơn đã xoá mềm trước đó.
   */
  async softDelete(
    id: number,
    actorId: number,
    actorRole: string,
    scope?: string | null,
  ) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id },
      relations: ['requester'],
    });

    if (!request) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    }

    const allowed = await this.isEligibleApprover(
      request.requester.departmentId,
      actorId,
      actorRole,
      scope,
      request.requester.leaveApproverId,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền xoá đơn nghỉ phép này');
    }

    await this.leaveRequestRepo.softDelete(id);
    // softDelete() chỉ tự set `deleted_at` - ghi riêng `deletedById` ngay sau
    // đó để cột "Người xóa" ở Tab Thùng rác có dữ liệu (mirror customers).
    await this.leaveRequestRepo.update(id, { deletedById: actorId });

    this.auditService.logActionAsync(
      actorId,
      'DELETE_LEAVE_REQUEST',
      'leave_request',
      id,
      { deletedAt: null },
      {
        deletedAt: new Date(),
        requester: { id: request.requesterId, name: request.requester.name },
        status: request.status,
      },
    );

    return { message: 'Đã đưa đơn nghỉ phép vào thùng rác' };
  }

  /**
   * Khôi phục từ Thùng rác - cùng permission/scope với `softDelete()` (ai
   * xoá được đơn nào thì khôi phục được đúng đơn đó).
   */
  async restoreFromTrash(
    id: number,
    actorId: number,
    actorRole: string,
    scope?: string | null,
  ) {
    const request = await this.leaveRequestRepo.findOne({
      where: { id },
      withDeleted: true,
      relations: ['requester'],
    });

    if (!request) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép trong thùng rác');
    }
    if (!request.deletedAt) {
      throw new BadRequestException('Đơn nghỉ phép này chưa bị xoá');
    }

    const allowed = await this.isEligibleApprover(
      request.requester.departmentId,
      actorId,
      actorRole,
      scope,
      request.requester.leaveApproverId,
    );
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền khôi phục đơn nghỉ phép này');
    }

    await this.leaveRequestRepo.restore(id);
    // Xoá dấu vết "Người xóa" cũ - đối xứng với customersService.restore().
    await this.leaveRequestRepo.update(id, { deletedById: null });

    this.auditService.logActionAsync(
      actorId,
      'RESTORE_LEAVE_REQUEST',
      'leave_request',
      id,
      null,
      { restored: true },
    );

    return { message: 'Đã khôi phục đơn nghỉ phép' };
  }

  /**
   * Xoá VĨNH VIỄN (irreversible) - permission RIÊNG `leave_requests.hard_delete`,
   * mặc định chỉ Admin. Mirror `CustomersService.hardDelete()` + `cancel()`
   * (dọn ảnh đính kèm trên B2 best-effort). CHỈ chấp nhận scope='all' (không
   * đủ dù được cấp scope='department' qua Phân quyền) - an toàn hơn 1 bậc
   * cho hành động không thể hoàn tác, xem comment ở migration
   * SeedLeaveRequestsDeletePermissions.
   */
  async hardDelete(
    id: number,
    actorId: number,
    actorRole: string,
    scope?: string | null,
  ) {
    if (actorRole !== Role.ADMIN && scope !== PermissionScope.ALL) {
      throw new ForbiddenException(
        'Chỉ Admin (hoặc quyền phạm vi "Toàn bộ") mới được xoá vĩnh viễn đơn nghỉ phép',
      );
    }

    const request = await this.leaveRequestRepo.findOne({
      where: { id },
      withDeleted: true,
      relations: ['requester', 'attachments'],
    });

    if (!request) {
      throw new NotFoundException('Không tìm thấy đơn nghỉ phép');
    }
    if (!request.deletedAt) {
      throw new BadRequestException(
        'Chỉ có thể xoá vĩnh viễn đơn nghỉ phép đã ở trong thùng rác',
      );
    }

    const attachments = request.attachments || [];
    if (attachments.length > 0) {
      await Promise.all(
        attachments.map((a) =>
          this.uploadsService
            .deleteObject(this.uploadsService.leaveAttachmentsBucket, a.objectKey)
            .catch((err) =>
              this.logger.warn(
                `Không xoá được ảnh đính kèm khi hard-delete đơn: ${a.objectKey}`,
                err,
              ),
            ),
        ),
      );
      await this.attachmentRepo.remove(attachments);
    }

    const snapshot = {
      requester: { id: request.requesterId, name: request.requester?.name },
      leaveType: request.leaveType,
      status: request.status,
      startDate: request.startDate,
      endDate: request.endDate,
      totalDays: request.totalDays,
    };

    await this.leaveRequestRepo.delete(id);

    this.auditService.logActionAsync(
      actorId,
      'HARD_DELETE_LEAVE_REQUEST',
      'leave_request',
      id,
      snapshot,
      null,
    );

    return { message: 'Đã xoá vĩnh viễn đơn nghỉ phép' };
  }

  /**
   * Xoá 1 ảnh đính kèm ĐÃ upload thẳng lên B2 (qua presign) nhưng CHƯA
   * (hoặc không còn) gắn vào đơn nghỉ phép thật nào - dùng khi:
   *  - Người dùng bấm xoá ảnh khỏi picker TRƯỚC khi bấm "Tạo đơn".
   *  - Người dùng đóng/huỷ Modal tạo đơn sau khi đã chọn ảnh (chưa bấm
   *    "Tạo đơn") - dọn hết ảnh đã lỡ PUT lên B2 trong phiên đó.
   *
   * 2 lớp an toàn bắt buộc:
   *  1. Key phải đúng namespace `leave-attachments/{userId}/` của CHÍNH
   *     người gọi - không cho xoá object của người khác dù đoán được key.
   *  2. Key KHÔNG được đang gắn với bất kỳ đơn nào trong DB
   *     (`leave_request_attachments`) - nếu đã gắn (đơn đã tạo thật), từ
   *     chối xoá qua đường này (phải qua `cancel()`), tránh 1 request cũ
   *     tự ý xoá "bằng chứng" ảnh của đơn ĐÃ NỘP thành công.
   */
  async discardOrphanAttachments(userId: number, keys: string[]) {
    const uniqueKeys = Array.from(new Set(keys)).slice(0, 20);
    const prefix = `leave-attachments/${userId}/`;

    const linked = uniqueKeys.length
      ? await this.attachmentRepo.find({ where: { objectKey: In(uniqueKeys) } })
      : [];
    const linkedKeys = new Set(linked.map((a) => a.objectKey));

    return Promise.all(
      uniqueKeys.map(async (key) => {
        if (!key.startsWith(prefix)) {
          return { key, deleted: false, reason: 'not_owner' as const };
        }
        if (linkedKeys.has(key)) {
          return { key, deleted: false, reason: 'already_linked' as const };
        }
        try {
          await this.uploadsService.deleteObject(
            this.uploadsService.leaveAttachmentsBucket,
            key,
          );
          return { key, deleted: true as const };
        } catch (err) {
          this.logger.warn(
            `Không xoá được ảnh đính kèm bỏ dở: ${key}`,
            err as Error,
          );
          return { key, deleted: false, reason: 'error' as const };
        }
      }),
    );
  }

  /**
   * Calculate total days (handle half days)
   */
  private calculateDays(
    start: Date,
    end: Date,
    duration: LeaveDuration,
  ): number {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays === 1 && duration !== LeaveDuration.FULL_DAY) {
      return 0.5;
    }

    return diffDays;
  }
}