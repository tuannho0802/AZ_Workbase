import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { CustomersService } from './customers.service';
import { CustomerFiltersDto } from './dto/customer-filters.dto';
import { CustomerNote } from '../../database/entities/customer-note.entity';
import { CustomerStatus } from '../../database/entities/customer-status.entity';
import { UiVisibilityService } from '../ui-visibility/ui-visibility.service';
import { toPascalSlug } from '../../common/utils/vietnamese-slug.util';

// Giới hạn an toàn cho 1 lần export - cùng tinh thần EXPORT_MAX_ROWS ở
// attendance-export.service.ts (tránh 1 request kéo cả trăm nghìn dòng làm
// treo tiến trình/timeout Vercel). 20.000 khách hàng đủ dùng cho quy mô CRM
// nội bộ hiện tại; nếu vượt, người dùng nên lọc hẹp bớt trước khi xuất.
const EXPORT_MAX_ROWS = 20000;

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1677FF' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
  right: { style: 'thin', color: { argb: 'FFD9D9D9' } },
};

const NOTE_TYPE_LABEL: Record<string, string> = {
  general: 'Chung',
  call: 'Cuộc gọi',
  meeting: 'Cuộc họp',
  follow_up: 'Theo dõi',
};

@Injectable()
export class CustomersExportService {
  constructor(
    private readonly customersService: CustomersService,
    private readonly uiVisibilityService: UiVisibilityService,
    @InjectRepository(CustomerNote)
    private readonly notesRepository: Repository<CustomerNote>,
    @InjectRepository(CustomerStatus)
    private readonly customerStatusRepository: Repository<CustomerStatus>,
  ) {}

  private styleHeaderRow(row: ExcelJS.Row) {
    row.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
  }

  private async toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  private formatDateTime(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mi} ${dd}/${mm}/${d.getFullYear()}`;
  }

  /**
   * Yêu cầu tường minh của chủ dự án (2026-09-23): tên file PHẢI có đoạn
   * "ExportBy-{TênNgườiXuất}" để phân biệt ai đã xuất file nào (VD nhiều
   * Sales cùng export cùng lúc). Dùng lại NGUYÊN `toPascalSlug()` có sẵn ở
   * `vietnamese-slug.util.ts` (đã dùng cho tên file avatar/đính kèm nghỉ
   * phép) thay vì viết lại logic bỏ dấu - đúng VD chủ dự án cho:
   * "Lê Hoàng Tuấn" -> "LeHoangTuan". Nếu không có tên (trường hợp hiếm -
   * JWT cũ chưa có field `name`, hoặc gọi nội bộ không qua HTTP) thì fallback
   * về đúng format cũ "KhachHang..." (không chèn "-ExportBy-" rỗng vô nghĩa).
   */
  private buildFilename(filters: CustomerFiltersDto, exportedByName?: string): string {
    const nameSlug = exportedByName ? toPascalSlug(exportedByName) : '';
    const prefix = nameSlug ? `Khach-Hang-ExportBy-${nameSlug}` : 'KhachHang';
    if (filters.dateFrom && filters.dateTo) {
      const from = filters.dateFrom.split('-').reverse().join('-');
      const to = filters.dateTo.split('-').reverse().join('-');
      return `${prefix} ${from} - ${to}.xlsx`;
    }
    return `${prefix} ToanBo.xlsx`;
  }

  /**
   * Xuất Excel danh sách khách hàng - RULE BẮT BUỘC (yêu cầu người dùng):
   * dữ liệu xuất ra phải ĐỒNG BỘ TUYỆT ĐỐI với những gì đang hiển thị trên
   * bảng chính (trang /customers). Vì vậy hàm này KHÔNG tự viết lại 1 bản
   * query song song - nó gọi THẲNG `CustomersService.findAll()` (đúng
   * RBAC/scope, đúng bộ filter, đúng field bị ẩn theo UiVisibility) với
   * `limit` nâng lên EXPORT_MAX_ROWS thay vì phân trang UI, tránh nguy cơ 2
   * bản logic RBAC lệch nhau theo thời gian (đúng nguyên tắc đã áp dụng cho
   * `exportMonthlyAttendance` - xem comment kiến trúc ở
   * attendance-export.service.ts).
   */
  async exportCustomers(
    filters: CustomerFiltersDto,
    userId: number,
    userRole: string,
    scope: string | null | undefined,
    callerDepartmentId?: number | null,
    callerPositionId?: number | null,
    callerIsRootAdmin?: boolean,
    // ⚠️ MỚI (2026-09-23) - tên người ĐANG xuất file (KHÔNG phải người tạo/
    // sửa Customer) - dùng để đặt tên file "Khach-Hang-ExportBy-{Tên}", xem
    // buildFilename() bên dưới.
    exportedByName?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { data: customers } = await this.customersService.findAll(
      { ...filters, page: 1, limit: EXPORT_MAX_ROWS },
      userId,
      userRole,
      scope,
      callerDepartmentId,
      callerPositionId,
      callerIsRootAdmin,
    );

    // Field nào đang bị ẩn với NGƯỜI GỌI (cùng nguồn dữ liệu FE dùng để ẩn
    // cột `hideSalesField`/`hideMarketingField`/`tab:deposits` ở
    // customers/page.tsx) - dùng để BỎ HẲN cột tương ứng khỏi Excel, không
    // chỉ để trống ô (đồng bộ với việc FE bỏ hẳn cột, không hiện cột rỗng).
    const hiddenKeys = await this.uiVisibilityService.getHiddenElementKeys(
      userRole,
      'customers',
      callerDepartmentId,
      callerPositionId,
      callerIsRootAdmin,
    );
    const hideSales = hiddenKeys.has('field:sales_assignment');
    const hideMarketing = hiddenKeys.has('field:marketing_assignment');
    const hideDeposits = hiddenKeys.has('tab:deposits');

    // Map code -> tên hiển thị thật của trạng thái (bảng `customer_statuses`
    // là nguồn sự thật động - xem CustomerStatusSelect.tsx ở FE, KHÔNG còn
    // enum cứng). Fallback về đúng code nếu không tìm thấy (customer cũ dùng
    // status đã bị xoá) - khớp hành vi FE.
    const statuses = await this.customerStatusRepository.find();
    const statusLabelByCode = new Map(statuses.map((s) => [s.code, s.name]));

    const workbook = new ExcelJS.Workbook();

    // ───────────────────────── Sheet 1: Khách hàng ─────────────────────
    const sheet = workbook.addWorksheet('Khách hàng');

    const depositRangeLabel =
      filters.dateFrom && filters.dateTo
        ? `${this.formatDate(filters.dateFrom)} - ${this.formatDate(filters.dateTo)}`
        : '30 ngày gần nhất';

    const columns: Array<{ header: string; key: string; width: number }> = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Ngày nhập', key: 'inputDate', width: 14 },
      { header: 'Họ và tên', key: 'name', width: 24 },
      { header: 'SĐT', key: 'phone', width: 16 },
      { header: 'Nguồn', key: 'source', width: 14 },
      { header: 'UTM', key: 'campaign', width: 18 },
      ...(hideSales
        ? []
        : [
            { header: 'Sales phụ trách chính', key: 'primarySales', width: 20 },
            { header: 'Sales được chia', key: 'sharedSales', width: 24 },
          ]),
      ...(hideMarketing ? [] : [{ header: 'Marketing', key: 'marketing', width: 20 }]),
      { header: 'Trạng thái', key: 'status', width: 16 },
      { header: 'Đã joined nhóm', key: 'joinedGroups', width: 26 },
      ...(hideDeposits
        ? []
        : [{ header: `Nạp tiền (${depositRangeLabel})`, key: 'deposit', width: 18 }]),
      { header: 'Ghi chú gần nhất', key: 'recentNotes', width: 40 },
      { header: 'Người tạo', key: 'createdBy', width: 18 },
      { header: 'Ngày tạo', key: 'createdAt', width: 18 },
      { header: 'Người sửa cuối', key: 'updatedBy', width: 18 },
      { header: 'Ngày sửa cuối', key: 'updatedAt', width: 18 },
    ];
    sheet.columns = columns;
    this.styleHeaderRow(sheet.getRow(1));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    customers.forEach((c: any, idx: number) => {
      const primarySales = c.salesUser;
      const allAssignees = c.activeAssignees || [];
      const sharedSales = allAssignees.filter((a: any) => a.id !== primarySales?.id);
      const joinedGroups = c.joinedGroups || [];
      const recentNotes = c.recentNotes || [];

      const rowData: Record<string, any> = {
        stt: idx + 1,
        inputDate: this.formatDate(c.inputDate),
        name: c.name,
        phone: c.phone || '',
        source: c.source || '',
        campaign: c.campaign || '',
        status: statusLabelByCode.get(c.status) || c.status,
        joinedGroups: joinedGroups.length > 0 ? joinedGroups.map((g: any) => g.name).join(', ') : 'Chưa join',
        recentNotes: recentNotes.length > 0
          ? recentNotes.map((n: any) => `[${this.formatDateTime(n.createdAt)}] ${n.createdByName || ''}: ${n.note}`).join('\n')
          : '',
        createdBy: c.createdBy?.name || '',
        createdAt: this.formatDateTime(c.createdAt),
        updatedBy: c.updatedBy?.name || '',
        updatedAt: c.updatedBy ? this.formatDateTime(c.updatedAt) : '',
      };
      if (!hideSales) {
        rowData.primarySales = primarySales?.name || 'Chưa gán';
        rowData.sharedSales = sharedSales.length > 0 ? sharedSales.map((a: any) => a.name).join(', ') : '';
      }
      if (!hideMarketing) {
        rowData.marketing = c.marketingUser?.name || 'Chưa gán';
      }
      if (!hideDeposits) {
        rowData.deposit = Number(c.totalDeposit30Days || 0);
      }

      const row = sheet.addRow(rowData);
      row.eachCell({ includeEmpty: true }, (cell) => (cell.border = THIN_BORDER));
      row.getCell('recentNotes').alignment = { wrapText: true, vertical: 'top' };
      if (!hideDeposits) {
        row.getCell('deposit').numFmt = '#,##0.00';
        row.getCell('deposit').alignment = { horizontal: 'right' };
      }
      row.getCell('stt').alignment = { horizontal: 'center' };
    });

    // ─────────────────── Sheet 2: Ghi chú khách hàng ───────────────────
    // Yêu cầu tường minh: xuất TOÀN BỘ bảng `customer_notes` (không chỉ N
    // ghi chú gần nhất như cột "Ghi chú gần nhất" ở Sheet 1) - CHỈ giới hạn
    // trong đúng các khách hàng đã lọt qua RBAC/filter ở trên (không rò rỉ
    // ghi chú của khách hàng ngoài phạm vi được xem).
    const notesSheet = workbook.addWorksheet('Ghi chú khách hàng');
    notesSheet.columns = [
      { header: 'STT', key: 'stt', width: 6 },
      { header: 'Tên khách hàng', key: 'customerName', width: 24 },
      { header: 'SĐT khách hàng', key: 'customerPhone', width: 16 },
      { header: 'Nội dung ghi chú', key: 'note', width: 50 },
      { header: 'Loại', key: 'noteType', width: 12 },
      { header: 'Quan trọng', key: 'isImportant', width: 12 },
      { header: 'Người tạo', key: 'createdBy', width: 18 },
      { header: 'Ngày tạo', key: 'createdAt', width: 18 },
      { header: 'Người sửa cuối', key: 'updatedBy', width: 18 },
      { header: 'Ngày sửa cuối', key: 'updatedAt', width: 18 },
      { header: 'Số lần sửa', key: 'editCount', width: 12 },
    ];
    this.styleHeaderRow(notesSheet.getRow(1));
    notesSheet.views = [{ state: 'frozen', ySplit: 1 }];

    if (customers.length > 0) {
      const customerIds = customers.map((c: any) => c.id);
      const customerById = new Map(customers.map((c: any) => [c.id, c]));

      const allNotes = await this.notesRepository
        .createQueryBuilder('note')
        .leftJoinAndSelect('note.createdByUser', 'noteCreator')
        .leftJoinAndSelect('note.updatedByUser', 'noteUpdater')
        .where('note.customer_id IN (:...ids)', { ids: customerIds })
        .orderBy('note.customer_id', 'ASC')
        .addOrderBy('note.created_at', 'DESC')
        .getMany();

      allNotes.forEach((n: any, idx: number) => {
        const customer = customerById.get(n.customerId);
        const row = notesSheet.addRow({
          stt: idx + 1,
          customerName: customer?.name || `#${n.customerId}`,
          customerPhone: customer?.phone || '',
          note: n.note,
          noteType: NOTE_TYPE_LABEL[n.noteType] || n.noteType,
          isImportant: n.isImportant ? 'Có' : '',
          createdBy: n.createdByUser?.name || '',
          createdAt: this.formatDateTime(n.createdAt),
          updatedBy: n.updatedByUser?.name || '',
          updatedAt: n.updatedBy ? this.formatDateTime(n.updatedAt) : '',
          editCount: n.editCount || 0,
        });
        row.eachCell({ includeEmpty: true }, (cell) => (cell.border = THIN_BORDER));
        row.getCell('note').alignment = { wrapText: true, vertical: 'top' };
        row.getCell('stt').alignment = { horizontal: 'center' };
      });
    }

    return {
      buffer: await this.toBuffer(workbook),
      filename: this.buildFilename(filters, exportedByName),
    };
  }
}