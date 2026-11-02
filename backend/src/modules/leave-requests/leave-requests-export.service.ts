import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../../common/enums/role.enum';
import { PermissionScope } from '../../database/entities/role-permission.entity';
import { toPascalSlug } from '../../common/utils/vietnamese-slug.util';
import { AuditService } from '../audit/audit.service';
import { LeaveTypesService } from '../leave-types/leave-types.service';
import { ExportLeaveRequestsDto } from './dto/export-leave-requests.dto';
import { buildLeaveExportBuffer } from './leave-export.excel';
import { buildLeaveExportModel, ExportModel, toPreviewModel } from './leave-export.model';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveRequestsStatsService } from './leave-requests-stats.service';

export interface LeaveExportViewer {
  id: number;
  role: string;
  name?: string;
  /** Scope của permission `leave_requests.approve` (PermissionGuard gán sẵn cho route export). */
  approveScope?: string | null;
}

/**
 * [PLAN_WITHDRAWAL_LEAVE_EXPORT - L3] Xuất Excel thống kê nghỉ phép (Demo + file).
 * Số liệu lấy từ `LeaveRequestsStatsService` (cùng getStats()/buildRowsQuery của tab Thống kê) nên khớp UI;
 * model dùng chung cho preview và file => xem gì xuất nấy.
 */
@Injectable()
export class LeaveRequestsExportService {
  constructor(
    private readonly statsService: LeaveRequestsStatsService,
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly leaveTypesService: LeaveTypesService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * NGUỒN DUY NHẤT quyết định phạm vi dữ liệu của export. Hiện = scope của `leave_requests.approve`
   * (đúng thiết kế plan 3.2, vì endpoint gate bằng `approve`). Nếu sau này muốn export KHÔNG rộng hơn tab
   * Thống kê (assistant: view=department nhưng approve=all) chỉ cần đổi hàm này - thành scope hẹp hơn
   * giữa `view` và `approve` - không phải sửa nơi nào khác.
   */
  resolveScope(viewer: LeaveExportViewer): string | null | undefined {
    return viewer.approveScope;
  }

  private assertCanExport(viewer: LeaveExportViewer, scope: string | null | undefined) {
    // Cùng cổng hasApproverScope() với các tab danh sách: scope own/null KHÔNG được lọc gì trong
    // applyApproverScope() nên bắt buộc chặn ở đây thay vì để lọt ra toàn bộ dữ liệu.
    if (viewer.role !== Role.ADMIN && !this.leaveRequestsService.hasApproverScope(viewer.role, scope)) {
      throw new ForbiddenException('Bạn không có phạm vi dữ liệu nghỉ phép để xuất Excel');
    }
  }

  private async buildModel(dto: ExportLeaveRequestsDto, viewer: LeaveExportViewer): Promise<ExportModel> {
    const scope = this.resolveScope(viewer);
    this.assertCanExport(viewer, scope);

    const stats = await this.statsService.getStats(dto, viewer.id, viewer.role, scope);
    // Chỉ form cần danh sách đơn mới kéo thêm (B chi tiết, D ma trận, F gói đầy đủ).
    const needsRequests = dto.form === 'B' || dto.form === 'D' || dto.form === 'F';
    const requests = needsRequests
      ? await this.statsService.getExportRequests(dto, viewer.id, viewer.role, scope)
      : undefined;

    // Loại phép là bảng động `leave_types`: nạp map code -> tên để file hiện tên thay vì mã (vd "sick").
    const types = await this.leaveTypesService.findAll();
    const leaveTypeNames = Object.fromEntries(types.map((t) => [t.code, t.name]));

    return buildLeaveExportModel({ form: dto.form, stats, requests, leaveTypeNames });
  }

  async preview(dto: ExportLeaveRequestsDto, viewer: LeaveExportViewer): Promise<ExportModel> {
    return toPreviewModel(await this.buildModel(dto, viewer));
  }

  async export(
    dto: ExportLeaveRequestsDto,
    viewer: LeaveExportViewer,
    ip?: string,
    userAgent?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const model = await this.buildModel(dto, viewer);
    const buffer = await buildLeaveExportBuffer(model, { exportedByName: viewer.name });

    const rowCount = model.sheets.reduce((n, s) => n + s.tables.reduce((m, t) => m + t.totalRows, 0), 0);
    this.auditService.logActionAsync(
      viewer.id,
      'EXPORT_LEAVE_REQUESTS',
      'leave_request',
      0,
      null,
      {
        form: dto.form,
        period: model.period,
        departmentId: dto.departmentId ?? null,
        leaveType: dto.leaveType ?? null,
        requesterId: dto.requesterId ?? null,
        scope: scope2audit(this.resolveScope(viewer), viewer.role),
        rows: rowCount,
      },
      ip,
      userAgent,
    );

    const nameSlug = viewer.name ? toPascalSlug(viewer.name) : '';
    const filename =
      `NghiPhep_${toPascalSlug(model.title)}_${model.period.from}_${model.period.to}` +
      `${nameSlug ? `_ExportBy-${nameSlug}` : ''}.xlsx`;
    return { buffer, filename };
  }
}

function scope2audit(scope: string | null | undefined, role: string): string {
  return role === Role.ADMIN ? 'all(admin)' : (scope ?? PermissionScope.OWN);
}
