import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ZkDeviceService } from '../zk-device/zk-device.service';
import { QueryAttendanceLogDto } from '../zk-device/dto/query-attendance-log.dto';
import { QueryAttendanceSummaryDto } from '../zk-device/dto/query-attendance-summary.dto';
import { ExportMonthlyAttendanceDto } from './dto/export-monthly-attendance.dto';

// Giới hạn an toàn cho 1 lần export - đủ cho vài chục nhân viên x vài năm
// log, tránh 1 request vô tình kéo cả bảng vài trăm nghìn dòng làm treo
// tiến trình/timeout Vercel. Không giới hạn thấp hơn vì "Logs chấm công"
// thật sự có thể cần export nhiều tháng liền cho mục đích đối chiếu.
const EXPORT_MAX_ROWS = 20000;

const WEEKDAY_FULL_VN = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];
const WEEKDAY_SHORT_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const SOURCE_LABEL: Record<string, string> = {
  device_push: 'Máy tự đẩy',
  device_pull: 'Đồng bộ thủ công',
};

const STATUS_LABEL: Record<string, string> = {
  on_time: 'Đúng giờ',
  late: 'Đi muộn',
  early_leave: 'Về sớm',
  late_and_early: 'Đi muộn & về sớm',
  missing_checkout: 'Thiếu chấm ra',
};

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

@Injectable()
export class AttendanceExportService {
  constructor(private readonly zkDeviceService: ZkDeviceService) {}

  /**
   * "YYYY-MM-DDTHH:mm:ss" (chuỗi giờ VN naive, KHÔNG có hậu tố Z/offset - xem
   * decode-device-time.util.ts) -> "DD/MM/YYYY HH:mm:ss" bằng CẮT CHUỖI THUẦN,
   * cố tình KHÔNG dựng `Date` rồi format lại - loại bỏ hoàn toàn khả năng dính
   * lại đúng bug lệch giờ +7h đã từng xảy ra trong module này (xem cảnh báo ở
   * đầu decode-device-time.util.ts). Input luôn đúng định dạng vì do chính
   * toNaiveApiString() sinh ra ở phía service gọi vào đây.
   */
  private naiveToVnDisplay(naive: string | null, withSeconds = true): string {
    if (!naive) return '—';
    const [datePart, timePart] = naive.split('T');
    const [y, m, d] = datePart.split('-');
    const time = withSeconds ? timePart : timePart.slice(0, 5);
    return `${d}/${m}/${y} ${time}`;
  }

  /** "YYYY-MM-DD" -> "DD/MM/YYYY" bằng cắt chuỗi thuần (cùng lý do trên). */
  private isoDateToVn(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  /** "YYYY-MM-DD" -> "DD-MM-YY" (dùng đặt tên file - không dùng "/" vì đó là
   * ký tự phân cách thư mục, sẽ làm hỏng tên file khi tải xuống). */
  private isoDateToFileToken(iso: string): string {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y.slice(2)}`;
  }

  /** Thứ trong tuần (0=CN) từ "YYYY-MM-DD" - dùng constructor 3 tham số
   * (thuần lịch, không dính giờ/múi giờ nào) nên an toàn tuyệt đối. */
  private weekdayOfIso(iso: string): number {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }

  private buildFilename(tabLabel: string, from?: string, to?: string): string {
    if (from && to) {
      return `${tabLabel} ${this.isoDateToFileToken(from)} - ${this.isoDateToFileToken(to)}.xlsx`;
    }
    return `${tabLabel} ToanBo.xlsx`;
  }

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

  // ─────────────────────────────────────────────────────────────────────
  // Tab "Logs chấm công" - export y chang bảng gốc (Thời gian/Nhân viên/
  // Nguồn/Mã máy), chỉ khác .csv ở chỗ có style/border/cột-rộng đàng hoàng.
  // ─────────────────────────────────────────────────────────────────────
  async exportAttendanceLogs(
    query: QueryAttendanceLogDto,
    viewerId: number,
    viewerRole: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { data } = await this.zkDeviceService.getAttendanceLogs(
      { ...query, page: 1, limit: EXPORT_MAX_ROWS },
      viewerId,
      viewerRole,
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Logs chấm công');

    sheet.columns = [
      { header: 'Thời gian', key: 'time', width: 20 },
      { header: 'Nhân viên', key: 'employee', width: 26 },
      { header: 'Trạng thái khớp', key: 'matchStatus', width: 16 },
      { header: 'Nguồn', key: 'source', width: 18 },
      { header: 'Mã máy', key: 'device', width: 20 },
    ];
    this.styleHeaderRow(sheet.getRow(1));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const log of data as any[]) {
      const row = sheet.addRow({
        time: this.naiveToVnDisplay(log.recordTime),
        employee: log.matchedUser
          ? log.matchedUser.name
          : `Chưa khớp: ${log.deviceUserName || `UID ${log.deviceUserId}`}`,
        matchStatus: log.matchedUser ? 'Đã khớp' : 'Chưa khớp',
        source: SOURCE_LABEL[log.source] || log.source,
        device: log.deviceSerialNumber || '—',
      });
      row.eachCell((cell) => (cell.border = THIN_BORDER));
      if (!log.matchedUser) {
        row.getCell('employee').font = { color: { argb: 'FFD46B08' } };
        row.getCell('matchStatus').font = { color: { argb: 'FFD46B08' }, bold: true };
      }
    }

    return {
      buffer: await this.toBuffer(workbook),
      filename: this.buildFilename('LogsChamCong', query.from, query.to),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Tab "Bảng chấm công" (attendance-summary) - export y chang bảng gốc.
  // ─────────────────────────────────────────────────────────────────────
  async exportAttendanceSummary(
    query: QueryAttendanceSummaryDto,
    viewerId: number,
    viewerRole: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { data } = await this.zkDeviceService.getAttendanceSummary(
      { ...query, page: 1, limit: EXPORT_MAX_ROWS },
      viewerId,
      viewerRole,
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bảng chấm công');

    sheet.columns = [
      { header: 'Ngày', key: 'date', width: 24 },
      { header: 'Nhân viên', key: 'employee', width: 26 },
      { header: 'Giờ vào', key: 'checkIn', width: 12 },
      { header: 'Giờ ra', key: 'checkOut', width: 12 },
      { header: 'Tổng giờ làm', key: 'workHours', width: 14 },
      { header: 'Trạng thái', key: 'status', width: 20 },
    ];
    this.styleHeaderRow(sheet.getRow(1));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const r of data as any[]) {
      const dow = this.weekdayOfIso(r.date);
      const row = sheet.addRow({
        date: `${WEEKDAY_FULL_VN[dow]}, ${this.isoDateToVn(r.date)}`,
        employee: r.isMapped ? r.userName : `${r.userName} (chưa map)`,
        checkIn: this.naiveToVnDisplay(r.checkIn, false).split(' ')[1] ?? '—',
        checkOut: r.checkOut ? this.naiveToVnDisplay(r.checkOut, false).split(' ')[1] : '—',
        workHours: r.workHours != null ? `${r.workHours}h` : '—',
        status: STATUS_LABEL[r.status as string] || r.status,
      });
      row.eachCell((cell) => (cell.border = THIN_BORDER));
      if (r.isLate) row.getCell('checkIn').font = { color: { argb: 'FFFA8C16' }, bold: true };
      if (r.isEarlyLeave) row.getCell('checkOut').font = { color: { argb: 'FFFAAD14' }, bold: true };
      if (!r.isMapped) row.getCell('employee').font = { color: { argb: 'FFD46B08' } };
    }

    return {
      buffer: await this.toBuffer(workbook),
      filename: this.buildFilename('BangChamCong', query.from, query.to),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Tab "Tổng hợp chấm công" (ma trận nhân viên x ngày trong tháng).
  //
  // ⚠️ QUYẾT ĐỊNH KIẾN TRÚC QUAN TRỌNG: logic suy luận từng ô (X/1-2K/P/KL -
  // nửa ngày theo giờ làm, đơn nghỉ đè lên chấm công, vắng không phép cho
  // ngày đã qua...) CHỈ tồn tại ở AttendanceMonthlyTab.tsx (frontend),
  // KHÔNG được port lại ở đây. Nếu viết lại độc lập ở backend, 2 bản logic
  // (FE TypeScript UI-only vs BE TypeScript) rất dễ lệch nhau theo thời
  // gian khi 1 bên được sửa mà quên sửa bên kia - đúng kiểu bug FE/BE lệch
  // nhau đã xảy ra nhiều lần trong dự án này (xem PERMISSIONS.md). Thay vào
  // đó, endpoint này nhận THẲNG mảng `rows` đã được tính sẵn từ chính FE
  // (frontend gửi lên nguyên state đang render trên màn hình) - đảm bảo
  // Excel xuất ra "y chang" những gì đang hiển thị, đúng yêu cầu, mà không
  // cần tin tưởng 1 bản sao logic thứ 2. Việc wiring FE gửi đúng payload
  // này sẽ làm ở lượt sau.
  // ─────────────────────────────────────────────────────────────────────
  async exportMonthlyAttendance(
    dto: ExportMonthlyAttendanceDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [year, month] = dto.month.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStartIso = `${dto.month}-01`;
    const monthEndIso = `${dto.month}-${String(daysInMonth).padStart(2, '0')}`;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tổng hợp chấm công');

    // ── Header 2 dòng: dòng 1 = nhóm cột, dòng 2 = từng ngày + thứ ──
    const fixedLeftHeaders = ['STT', 'Họ và tên', 'Vị trí'];
    const fixedRightHeaders = [
      'Ngày công thực tế',
      'Nghỉ hưởng lương',
      'Nghỉ không lương',
      'Số ngày nghỉ phép còn lại',
      'Ghi chú',
    ];

    const headerRow1 = sheet.getRow(1);
    const headerRow2 = sheet.getRow(2);
    let col = 1;
    for (const h of fixedLeftHeaders) {
      sheet.mergeCells(1, col, 2, col);
      headerRow1.getCell(col).value = h;
      col++;
    }
    const dayStartCol = col;
    sheet.mergeCells(1, dayStartCol, 1, dayStartCol + daysInMonth - 1);
    headerRow1.getCell(dayStartCol).value = 'Ngày trong tháng';
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = this.weekdayOfIso(`${dto.month}-${String(d).padStart(2, '0')}`);
      headerRow2.getCell(col).value = `${d}\n${WEEKDAY_SHORT_VN[dow]}`;
      col++;
    }
    for (const h of fixedRightHeaders) {
      sheet.mergeCells(1, col, 2, col);
      headerRow1.getCell(col).value = h;
      col++;
    }
    this.styleHeaderRow(headerRow1);
    this.styleHeaderRow(headerRow2);
    headerRow2.eachCell((cell) => (cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }));

    // ── Cột rộng ──
    sheet.getColumn(1).width = 6; // STT
    sheet.getColumn(2).width = 22; // Họ và tên
    sheet.getColumn(3).width = 16; // Vị trí
    for (let d = 0; d < daysInMonth; d++) sheet.getColumn(dayStartCol + d).width = 5;
    const rightStart = dayStartCol + daysInMonth;
    sheet.getColumn(rightStart).width = 14; // Ngày công thực tế
    sheet.getColumn(rightStart + 1).width = 12; // Hưởng lương
    sheet.getColumn(rightStart + 2).width = 12; // Không lương
    sheet.getColumn(rightStart + 3).width = 14; // Số ngày phép còn lại
    sheet.getColumn(rightStart + 4).width = 40; // Ghi chú

    const MARK_COLOR: Record<string, string> = {
      X: 'FF1677FF',
      'X/2': 'FFD48806',
      '1/2K': 'FFD4380D',
      P: 'FF08979C',
      KL: 'FFCF1322',
    };

    // ── Dữ liệu ──
    dto.rows.forEach((r, idx) => {
      const rowIndex = 3 + idx;
      const row = sheet.getRow(rowIndex);
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = r.userName;
      row.getCell(3).value = r.departmentName;

      const dayMap = new Map(r.days.map((entry) => [entry.day, entry]));
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = row.getCell(dayStartCol + d - 1);
        const entry = dayMap.get(d);
        if (entry) {
          cell.value = entry.mark;
          cell.font = { bold: true, color: { argb: MARK_COLOR[entry.mark] || 'FF000000' } };
          if (entry.reason) cell.note = entry.reason;
        }
      }

      row.getCell(rightStart).value = Number(r.actualWorkDays.toFixed(1));
      row.getCell(rightStart + 1).value = Number(r.paidLeaveDays.toFixed(1));
      row.getCell(rightStart + 2).value = Number(r.unpaidLeaveDays.toFixed(1));
      row.getCell(rightStart + 3).value = r.annualLeaveBalance ?? '—';

      const noteLines: string[] = [];
      if (r.lateEntries.length > 0) {
        noteLines.push('Đi trễ:');
        for (const e of r.lateEntries) noteLines.push(`${e.dateStr} ${e.time} (+${e.minutes} phút)`);
        noteLines.push(`Tổng trễ: ${r.lateEntries.reduce((s, e) => s + e.minutes, 0)} phút`);
      }
      if (r.earlyEntries.length > 0) {
        if (noteLines.length) noteLines.push('');
        noteLines.push('Về sớm:');
        for (const e of r.earlyEntries) noteLines.push(`${e.dateStr} ${e.time} (-${e.minutes} phút)`);
        noteLines.push(`Tổng sớm: ${r.earlyEntries.reduce((s, e) => s + e.minutes, 0)} phút`);
      }
      const noteCell = row.getCell(rightStart + 4);
      noteCell.value = noteLines.join('\n');
      noteCell.alignment = { wrapText: true, vertical: 'top' };

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = THIN_BORDER;
      });
      row.getCell(1).alignment = { horizontal: 'center' };
      for (let d = 1; d <= daysInMonth; d++) {
        row.getCell(dayStartCol + d - 1).alignment = { horizontal: 'center' };
      }
      row.getCell(rightStart).alignment = { horizontal: 'center' };
      row.getCell(rightStart + 1).alignment = { horizontal: 'center' };
      row.getCell(rightStart + 2).alignment = { horizontal: 'center' };
      row.getCell(rightStart + 3).alignment = { horizontal: 'center' };
    });

    sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 2 }];

    return {
      buffer: await this.toBuffer(workbook),
      filename: this.buildFilename('TongHopChamCong', monthStartIso, monthEndIso),
    };
  }
}
