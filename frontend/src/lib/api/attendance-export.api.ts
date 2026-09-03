import axiosInstance from './axios-instance';

/**
 * Kích hoạt tải file xuống trình duyệt từ 1 Blob - dùng chung cho cả 3 API
 * export bên dưới.
 */
function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/** "YYYY-MM-DD" -> "DD-MM-YY" - PHẢI khớp y hệt isoDateToFileToken() ở
 * backend (attendance-export.service.ts) để tên file tải xuống nhất quán. */
function isoDateToFileToken(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y.slice(2)}`;
}

/**
 * Dựng tên file GIỐNG HỆT buildFilename() ở backend - tự làm ở FE thay vì
 * đọc header Content-Disposition từ response, vì header đó cần backend
 * expose qua CORS (Access-Control-Expose-Headers) mới đọc được từ JS ở
 * trình duyệt khi FE/BE khác domain (thường gặp khi deploy Vercel riêng
 * frontend/backend) - tự dựng lại theo đúng công thức đã biết trước là chắc
 * chắn, không phụ thuộc cấu hình CORS.
 */
function buildExportFilename(tabLabel: string, from?: string, to?: string): string {
  if (from && to) {
    return `${tabLabel} ${isoDateToFileToken(from)} - ${isoDateToFileToken(to)}.xlsx`;
  }
  return `${tabLabel} ToanBo.xlsx`;
}

export interface ExportMonthlyDayEntry {
  day: number;
  mark: 'X' | 'X/2' | '1/2K' | 'P' | 'KL';
  reason?: string;
}

export interface ExportMonthlyLateEarlyEntry {
  dateStr: string;
  time: string;
  minutes: number;
}

export interface ExportMonthlyRow {
  userName: string;
  departmentName: string;
  days: ExportMonthlyDayEntry[];
  actualWorkDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  annualLeaveBalance?: number | null;
  lateEntries: ExportMonthlyLateEarlyEntry[];
  earlyEntries: ExportMonthlyLateEarlyEntry[];
}

/**
 * Với `responseType: 'blob'`, khi backend trả lỗi (403/400...), axios KHÔNG
 * tự parse JSON như request thường - `error.response.data` là 1 Blob chứa
 * JSON lỗi dạng thô. Interceptor lỗi chung của axiosInstance (đọc
 * `error.response?.data?.message`) sẽ không đọc được message thật từ 1 Blob,
 * hiện ra thông báo vô nghĩa kiểu "[object Blob]". Đọc lại nội dung Blob
 * thành JSON thật rồi gán ngược vào `error.response.data` trước khi ném lại,
 * để interceptor chung xử lý đúng như mọi lỗi API khác.
 */
async function rethrowWithParsedBlobError(error: any): Promise<never> {
  const data = error?.response?.data;
  if (data instanceof Blob && data.type.includes('json')) {
    try {
      const text = await data.text();
      error.response.data = JSON.parse(text);
    } catch {
      // Blob không phải JSON hợp lệ - giữ nguyên lỗi gốc, không chặn luồng.
    }
  }
  throw error;
}

export const attendanceExportApi = {
  exportLogs: async (query: {
    userId?: number;
    matched?: 'matched' | 'unmatched';
    from?: string;
    to?: string;
  }) => {
    try {
      const response = await axiosInstance.get('/attendance-export/logs', {
        params: query,
        responseType: 'blob',
      });
      triggerBrowserDownload(response.data, buildExportFilename('LogsChamCong', query.from, query.to));
    } catch (error) {
      await rethrowWithParsedBlobError(error);
    }
  },

  exportSummary: async (query: { userId?: number; from?: string; to?: string }) => {
    try {
      const response = await axiosInstance.get('/attendance-export/summary', {
        params: query,
        responseType: 'blob',
      });
      triggerBrowserDownload(response.data, buildExportFilename('BangChamCong', query.from, query.to));
    } catch (error) {
      await rethrowWithParsedBlobError(error);
    }
  },

  exportMonthly: async (dto: { month: string; rows: ExportMonthlyRow[] }) => {
    try {
      const response = await axiosInstance.post('/attendance-export/monthly', dto, {
        responseType: 'blob',
      });
      // month "YYYY-MM" -> from/to = ngày đầu/cuối tháng, khớp cách backend tự
      // suy ra monthStartIso/monthEndIso trong exportMonthlyAttendance().
      const [y, m] = dto.month.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const from = `${dto.month}-01`;
      const to = `${dto.month}-${String(daysInMonth).padStart(2, '0')}`;
      triggerBrowserDownload(response.data, buildExportFilename('TongHopChamCong', from, to));
    } catch (error) {
      await rethrowWithParsedBlobError(error);
    }
  },
};
