import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { CustomerGroupMembership } from '../../database/entities/customer-group-membership.entity';
import { Role } from '../../common/enums/role.enum';
import { CustomerAccessHelper } from '../customers/helpers/customer-access.helper';
import { getReportPeriodRange, getNowVn } from '../../common/utils/date-vn.util';
import { QueryReportDto } from './dto/query-report.dto';

interface PersonalBreakdownRow {
  userId: number;
  userName: string;
}

interface DepartmentBreakdownRow {
  departmentId: number;
  departmentName: string;
}

/**
 * PHẦN "Báo cáo doanh số" (Revenue + Customer KPI report).
 *
 * ⚠️ QUYẾT ĐỊNH THIẾT KẾ đã thống nhất với người dùng trước khi viết code:
 * - Tính ON-DEMAND bằng SQL aggregation (SUM/COUNT + GROUP BY) MỖI LẦN gọi
 *   API - KHÔNG cache kết quả xuống DB. Lý do: cache đòi hỏi invalidate ĐÚNG
 *   lúc (khách đổi status, deposit nhập trễ ngày quá khứ, period hiện tại
 *   thay đổi liên tục...) - độ phức tạp/rủi ro sai số của cache cao hơn hẳn
 *   lợi ích tốc độ ở quy mô dữ liệu hiện tại (~8000 khách hàng). Đã thêm
 *   index đúng chỗ thay thế (xem migration AddReportIndexes) để giữ query đủ
 *   nhanh mà không cần cache. FE tự cache ngắn hạn qua React Query
 *   (staleTime) - không cần code invalidation ở BE.
 * - Mốc thời gian LUÔN là khoảng lịch TRỌN VẸN (Thứ Hai->CN, ngày 1->cuối
 *   tháng...) - xem getReportPeriodRange() trong date-vn.util.ts, KHÔNG phải
 *   "N ngày gần đây tính từ hôm nay".
 *
 * PHÂN QUYỀN (áp dụng thống nhất cho cả 2 báo cáo, dùng LẠI
 * CustomerAccessHelper.applyViewFilter() - CÙNG 1 nguồn chân lý RBAC với
 * module Customer, không viết lại điều kiện role riêng ở đây):
 *
 *  Role       | Cá nhân (breakdown)          | Phòng ban (breakdown)   | Tổng tất cả
 *  -----------|-------------------------------|-------------------------|-------------
 *  ADMIN      | Mọi người                     | Mọi phòng ban            | Có
 *  ASSISTANT  | Mọi người                     | Mọi phòng ban            | Có
 *  MANAGER    | Chỉ người trong phòng ban      | Chỉ phòng ban mình quản  | ẨN (null)
 *             | mình quản lý (tự nhiên qua      | lý (tự nhiên qua         |
 *             | applyViewFilter)               | applyViewFilter)         |
 *  EMPLOYEE   | CHỈ SỐ CỦA CHÍNH MÌNH          | ẨN (null)                | ẨN (null)
 *
 * ⚠️ Điểm này CHƯA có xác nhận tường minh bằng văn bản từ chủ dự án khi bắt
 * tay viết code (đã hỏi trước đó, câu trả lời nhận được lại là quyết định
 * caching thay vì trả lời trực tiếp câu hỏi RBAC) - đây là phương án ĐỀ XUẤT
 * mặc định, khớp nhất quán với toàn bộ PERMISSIONS.md đã áp dụng cho module
 * Customer (Manager khoanh vùng phòng ban, Employee chỉ thấy phạm vi của
 * mình). Cần chủ dự án xác nhận lại, dễ đổi nếu sai (chỉ nằm ở khối điều
 * kiện role bên dưới, không ảnh hưởng phần tính toán).
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) { }

  /**
   * Suy ra khoảng ngày [from, to] (dạng chuỗi 'YYYY-MM-DD HH:mm:ss', KHÔNG
   * offset - cùng quy ước "naive giờ VN" với toàn bộ pipeline chấm công đã
   * áp dụng, xem decode-device-time.util.ts) từ DTO query.
   *
   * ⚠️ TRẢ THÊM `fromUtc`/`toUtc` (lùi 7 tiếng) - BẮT BUỘC dùng cho các cột
   * KHÔNG theo quy ước "naive VN" của record_time chấm công, mà là timestamp
   * THẬT (`@CreateDateColumn()`/`new Date()`):
   * - `customer.createdAt`/`deposit.createdAt`: cột `datetime`, giá trị do
   *   MySQL tự sinh qua DEFAULT CURRENT_TIMESTAMP LÚC INSERT - đã xác nhận
   *   TRỰC TIẾP bằng dữ liệu thật trong chính phiên làm việc này (đối chiếu
   *   `attendance_logs.synced_at` = "06:36:55" với log Vercel thật lúc
   *   "13:36:49 giờ VN" = "06:36:49 UTC" - khớp UTC, KHÔNG khớp giờ VN) rằng
   *   session timezone của Aiven là UTC nên CURRENT_TIMESTAMP sinh ra giá
   *   trị UTC, không phải giờ VN.
   * - `customer_group_memberships.joined_at`: cột `timestamp` (khác hẳn
   *   `datetime`) - MySQL TỰ ĐỘNG quy đổi TIMESTAMP theo session timezone cả
   *   lúc ghi lẫn đọc, nên dù code gán `new Date()` (đúng, không lệch) ở
   *   `customer-group-memberships.service.ts`, giá trị lưu trong TIMESTAMP
   *   vẫn bị "dán nhãn" theo session tz = UTC.
   *
   * Ngược lại, `deposit.depositDate`/`customer.closedDate` là cột `date`
   * (KHÔNG có giờ), do NGƯỜI DÙNG tự chọn ngày qua date-picker (không phải
   * DB tự sinh) - không có khái niệm giờ/múi giờ nào để lệch, dùng thẳng
   * `from`/`to` (naive) là đủ, KHÔNG dùng `fromUtc`/`toUtc` cho 2 cột này.
   */
  private resolveRange(query: QueryReportDto) {
    const anchor = query.anchor ? new Date(`${query.anchor}T00:00:00`) : getNowVn();
    const { start, end } = getReportPeriodRange(
      query.period,
      anchor,
      query.customFrom,
      query.customTo,
    );
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
    return {
      from: fmt(start),
      to: fmt(end),
      fromUtc: fmt(new Date(start.getTime() - VN_OFFSET_MS)),
      toUtc: fmt(new Date(end.getTime() - VN_OFFSET_MS)),
    };
  }

  // ═══════════════════════════ DOANH THU (TIỀN) ═══════════════════════════

  async getRevenueReport(query: QueryReportDto, viewerId: number, viewerRole: string) {
    const { from, to } = this.resolveRange(query);

    const baseQb = this.customerRepo
      .createQueryBuilder('customer')
      .innerJoin('customer.deposits', 'deposit')
      .leftJoin('customer.salesUser', 'salesUser')
      .leftJoin('customer.department', 'department')
      .andWhere('deposit.depositDate BETWEEN :from AND :to', { from, to });
    CustomerAccessHelper.applyViewFilter(baseQb, viewerId, viewerRole);

    // ── Cá nhân ──
    const personalQb = baseQb
      .clone()
      .select('customer.salesUserId', 'userId')
      .addSelect('salesUser.name', 'userName')
      .addSelect('SUM(deposit.amount)', 'amount')
      .andWhere('customer.salesUserId IS NOT NULL')
      .groupBy('customer.salesUserId')
      .addGroupBy('salesUser.name')
      .orderBy('amount', 'DESC');

    if (viewerRole === Role.EMPLOYEE) {
      // Nhân viên CHỈ thấy số của CHÍNH MÌNH ở mục "Cá nhân" - dù
      // applyViewFilter có thể cho họ THẤY (view) vài khách hàng được gán
      // qua customer_assignments mà salesUserId không phải họ, báo cáo
      // "Cá nhân" không nên lộ số của người khác qua đường đó.
      personalQb.andWhere('customer.salesUserId = :selfId', { selfId: viewerId });
    }

    const personalRaw = await personalQb.getRawMany<
      PersonalBreakdownRow & { amount: string }
    >();
    const personal = personalRaw.map((r) => ({
      userId: Number(r.userId),
      userName: r.userName ?? '(Không rõ)',
      amount: Number(r.amount) || 0,
    }));

    // ── Phòng ban (Employee KHÔNG có mục này) ──
    let department: { departmentId: number; departmentName: string; amount: number }[] | null =
      null;
    if (viewerRole !== Role.EMPLOYEE) {
      const departmentRaw = await baseQb
        .clone()
        .select('customer.departmentId', 'departmentId')
        .addSelect('department.name', 'departmentName')
        .addSelect('SUM(deposit.amount)', 'amount')
        .andWhere('customer.departmentId IS NOT NULL')
        .groupBy('customer.departmentId')
        .addGroupBy('department.name')
        .orderBy('amount', 'DESC')
        .getRawMany<DepartmentBreakdownRow & { amount: string }>();
      department = departmentRaw.map((r) => ({
        departmentId: Number(r.departmentId),
        departmentName: r.departmentName ?? '(Không rõ)',
        amount: Number(r.amount) || 0,
      }));
    }

    // ── Tổng tất cả (CHỈ Admin/Assistant - xem bảng phân quyền ở đầu file) ──
    let total: number | null = null;
    if (viewerRole === Role.ADMIN || viewerRole === Role.ASSISTANT) {
      const totalRaw = await baseQb.clone().select('SUM(deposit.amount)', 'total').getRawOne();
      total = Number(totalRaw?.total) || 0;
    }

    return { period: { type: query.period, from, to }, personal, department, total };
  }

  // ═══════════════════════════ DOANH SỐ KHÁCH ═══════════════════════════

  /**
   * 3 chỉ số, MỖI chỉ số lọc theo 1 cột ngày KHÁC NHAU trên CHÍNH khách hàng
   * đó (không phải cùng 1 khoảng lọc chung):
   * - totalCustomers: customer.createdAt nằm trong kỳ (data mới nhập)
   * - closedCustomers: customer.status='closed' VÀ customer.closedDate nằm
   *   trong kỳ (chốt trong kỳ - không phải "nhập trong kỳ rồi chốt sau")
   * - joinedGroupCustomers: có >=1 dòng customer_group_memberships với
   *   joined=true VÀ joined_at nằm trong kỳ (COUNT DISTINCT khách hàng, 1
   *   khách join nhiều nhóm trong kỳ chỉ tính 1 lần)
   *
   * Vì 2 chỉ số đầu dùng 2 cột ngày khác nhau trên CÙNG bảng customers (mỗi
   * dòng có thể vừa được tạo trong kỳ, vừa được chốt trong kỳ - độc lập với
   * nhau), gộp chung bằng SUM(CASE WHEN...) 1 query duy nhất, KHÔNG lọc
   * WHERE theo ngày ở tầng ngoài (query trên TOÀN BỘ khách thuộc phạm vi
   * RBAC, chỉ đếm có điều kiện) - tránh 1 khách hàng bị tạo trước kỳ nhưng
   * chốt trong kỳ bị loại nhầm khỏi closedCustomers vì WHERE ngoài lọc theo
   * createdAt.
   */
  async getCustomerReport(query: QueryReportDto, viewerId: number, viewerRole: string) {
    const { from, to, fromUtc, toUtc } = this.resolveRange(query);

    // ── totalCustomers + closedCustomers (cùng 1 bảng customers) ──
    const mainQb = this.customerRepo
      .createQueryBuilder('customer')
      .leftJoin('customer.salesUser', 'salesUser')
      .leftJoin('customer.department', 'department');
    CustomerAccessHelper.applyViewFilter(mainQb, viewerId, viewerRole);

    // ⚠️ FIX bug lệch giờ: `customer.createdAt` là cột datetime DO DB TỰ SINH
    // (CreateDateColumn, đã xác nhận là UTC THẬT - xem giải thích đầy đủ ở
    // resolveRange() phía trên) -> PHẢI lọc bằng `createdFrom`/`createdTo`
    // (UTC). `customer.closedDate` là cột `date` do NGƯỜI DÙNG tự chọn qua
    // date-picker (không có giờ/múi giờ) -> vẫn dùng `closedFrom`/`closedTo`
    // (naive, = from/to). 2 cặp tham số TÁCH RIÊNG (không dùng chung
    // :from/:to như bản trước) vì bản chất 2 cột hoàn toàn khác nhau.
    const buildMainSelect = (qb: typeof mainQb) =>
      qb
        .addSelect(
          `SUM(CASE WHEN customer.createdAt BETWEEN :createdFrom AND :createdTo THEN 1 ELSE 0 END)`,
          'totalCustomers',
        )
        .addSelect(
          `SUM(CASE WHEN customer.status = 'closed' AND customer.closedDate BETWEEN :closedFrom AND :closedTo THEN 1 ELSE 0 END)`,
          'closedCustomers',
        )
        .setParameters({ createdFrom: fromUtc, createdTo: toUtc, closedFrom: from, closedTo: to });

    // ── joinedGroupCustomers (join thêm bảng customer_group_memberships,
    // KHÔNG có relation OneToMany sẵn trên Customer entity nên join thủ
    // công qua điều kiện, không qua tên relation) ──
    // ⚠️ FIX bug lệch giờ tương tự: `membership.joined_at` là cột `timestamp`
    // (MySQL tự quy đổi theo session timezone = UTC cả lúc ghi lẫn đọc) ->
    // PHẢI dùng `fromUtc`/`toUtc`, KHÔNG dùng `from`/`to` (naive) như bản cũ.
    const buildJoinedSelect = (qb: any) =>
      qb
        .innerJoin(
          CustomerGroupMembership,
          'membership',
          'membership.customer_id = customer.id AND membership.joined = true AND membership.joined_at BETWEEN :joinedFrom AND :joinedTo',
          { joinedFrom: fromUtc, joinedTo: toUtc },
        )
        .addSelect('COUNT(DISTINCT customer.id)', 'joinedGroupCustomers');

    // ── Cá nhân ──
    const personalMainRaw = await buildMainSelect(
      mainQb
        .clone()
        .select('customer.salesUserId', 'userId')
        .addSelect('salesUser.name', 'userName')
        .andWhere('customer.salesUserId IS NOT NULL')
        .groupBy('customer.salesUserId')
        .addGroupBy('salesUser.name'),
    ).getRawMany();

    const personalJoinedQb = buildJoinedSelect(
      this.customerRepo
        .createQueryBuilder('customer')
        .select('customer.salesUserId', 'userId')
        .andWhere('customer.salesUserId IS NOT NULL')
        .groupBy('customer.salesUserId'),
    );
    CustomerAccessHelper.applyViewFilter(personalJoinedQb, viewerId, viewerRole);
    if (viewerRole === Role.EMPLOYEE) {
      personalJoinedQb.andWhere('customer.salesUserId = :selfId', { selfId: viewerId });
    }
    const personalJoinedRaw = await personalJoinedQb.getRawMany();

    let personalMainFiltered = personalMainRaw;
    if (viewerRole === Role.EMPLOYEE) {
      // Cùng lý do như getRevenueReport(): ép về đúng chính mình, không phụ
      // thuộc phạm vi "xem được" rộng hơn của applyViewFilter cho Employee.
      personalMainFiltered = personalMainRaw.filter(
        (r: any) => Number(r.userId) === viewerId,
      );
    }
    const personal = this.mergeBreakdown(
      personalMainFiltered,
      personalJoinedRaw,
      'userId',
      (r: any) => ({ userId: Number(r.userId), userName: r.userName ?? '(Không rõ)' }),
    );

    // ── Phòng ban (Employee KHÔNG có mục này) ──
    let department: any[] | null = null;
    if (viewerRole !== Role.EMPLOYEE) {
      const departmentMainRaw = await buildMainSelect(
        mainQb
          .clone()
          .select('customer.departmentId', 'departmentId')
          .addSelect('department.name', 'departmentName')
          .andWhere('customer.departmentId IS NOT NULL')
          .groupBy('customer.departmentId')
          .addGroupBy('department.name'),
      ).getRawMany();

      const departmentJoinedQb = buildJoinedSelect(
        this.customerRepo
          .createQueryBuilder('customer')
          .select('customer.departmentId', 'departmentId')
          .andWhere('customer.departmentId IS NOT NULL')
          .groupBy('customer.departmentId'),
      );
      CustomerAccessHelper.applyViewFilter(departmentJoinedQb, viewerId, viewerRole);
      const departmentJoinedRaw = await departmentJoinedQb.getRawMany();

      department = this.mergeBreakdown(
        departmentMainRaw,
        departmentJoinedRaw,
        'departmentId',
        (r: any) => ({
          departmentId: Number(r.departmentId),
          departmentName: r.departmentName ?? '(Không rõ)',
        }),
      );
    }

    // ── Tổng tất cả (CHỈ Admin/Assistant) ──
    let total: { totalCustomers: number; closedCustomers: number; joinedGroupCustomers: number } | null =
      null;
    if (viewerRole === Role.ADMIN || viewerRole === Role.ASSISTANT) {
      // ⚠️ PHẢI tự gọi .select() với ĐÚNG 1 cột giả trước khi buildMainSelect()
      // addSelect thêm 2 cột tổng hợp - nếu không, TypeORM mặc định SELECT
      // TOÀN BỘ cột customer.* (chưa từng gọi .select() lần nào), trộn lẫn
      // cột thô với cột SUM(CASE...) mà không có GROUP BY sẽ vi phạm
      // ONLY_FULL_GROUP_BY của MySQL (khác các nhánh Cá nhân/Phòng ban ở
      // trên - những nhánh đó ĐÃ tự gọi .select() cho cột GROUP BY trước).
      const totalMainRaw = await buildMainSelect(
        mainQb.clone().select('1', '_dummy'),
      ).getRawOne();

      const totalJoinedRaw = await buildJoinedSelect(
        this.customerRepo.createQueryBuilder('customer').select('1', '_dummy'),
      ).getRawOne();

      total = {
        totalCustomers: Number(totalMainRaw?.totalCustomers) || 0,
        closedCustomers: Number(totalMainRaw?.closedCustomers) || 0,
        joinedGroupCustomers: Number(totalJoinedRaw?.joinedGroupCustomers) || 0,
      };
    }

    return { period: { type: query.period, from, to }, personal, department, total };
  }

  /**
   * Gộp 2 mảng raw (từ 2 query riêng - "main" có totalCustomers/closedCustomers,
   * "joined" có joinedGroupCustomers) theo chung 1 khoá (userId/departmentId)
   * thành 1 mảng duy nhất đủ cả 3 chỉ số. Dùng OUTER JOIN kiểu JS (Map) vì 1
   * người/phòng ban có thể xuất hiện ở bảng này mà không có ở bảng kia (vd có
   * khách mới nhập trong kỳ nhưng chưa ai join nhóm nào).
   */
  private mergeBreakdown(
    mainRows: any[],
    joinedRows: any[],
    key: 'userId' | 'departmentId',
    pickIdentity: (row: any) => Record<string, any>,
  ) {
    const map = new Map<number, any>();
    for (const row of mainRows) {
      map.set(Number(row[key]), {
        ...pickIdentity(row),
        totalCustomers: Number(row.totalCustomers) || 0,
        closedCustomers: Number(row.closedCustomers) || 0,
        joinedGroupCustomers: 0,
      });
    }
    for (const row of joinedRows) {
      const k = Number(row[key]);
      const existing = map.get(k);
      const joinedCount = Number(row.joinedGroupCustomers) || 0;
      if (existing) {
        existing.joinedGroupCustomers = joinedCount;
      } else {
        map.set(k, {
          ...pickIdentity(row),
          totalCustomers: 0,
          closedCustomers: 0,
          joinedGroupCustomers: joinedCount,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalCustomers - a.totalCustomers);
  }
}