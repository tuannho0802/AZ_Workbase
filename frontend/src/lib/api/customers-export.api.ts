import axiosInstance from './axios-instance';
import { CustomerFilterParams } from '../hooks/useCustomers';

/**
 * Kích hoạt tải file xuống trình duyệt từ 1 Blob - cùng pattern với
 * `triggerBrowserDownload()` ở attendance-export.api.ts.
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

/**
 * Với `responseType: 'blob'`, khi backend trả lỗi (403 thiếu quyền
 * `customers.export`...), axios KHÔNG tự parse JSON như request thường -
 * `error.response.data` là 1 Blob chứa JSON lỗi dạng thô. Đọc lại nội dung
 * Blob thành JSON thật rồi gán ngược vào `error.response.data` trước khi ném
 * lại, để interceptor lỗi chung của axiosInstance hiện đúng message thay vì
 * "[object Blob]" - cùng pattern với attendance-export.api.ts.
 */
async function rethrowWithParsedBlobError(error: any): Promise<never> {
  const data = error?.response?.data;
  if (data instanceof Blob && data.type.includes('json')) {
    try {
      const text = await data.text();
      error.response.data = JSON.parse(text);
    } catch {
      // Blob không phải JSON hợp lệ - giữ nguyên lỗi gốc.
    }
  }
  throw error;
}

/**
 * ⚠️ FIX BUG THẬT (2026-09-23): trước đây hàm này TỰ dựng tên file ở FE
 * (`KhachHang ...xlsx`) và HOÀN TOÀN bỏ qua header `Content-Disposition` mà
 * backend đã set (xem `customers.controller.ts#exportExcel` +
 * `customers-export.service.ts#buildFilename`) - tên file backend build có
 * đoạn "Khach-Hang-ExportBy-{TênNgườiXuất}" theo đúng yêu cầu chủ dự án,
 * nhưng người dùng tải về lại thấy tên CŨ không hề có đoạn đó vì FE ghi đè
 * bằng `a.download` của chính nó. Sửa: đọc tên file THẬT từ header trả về,
 * chỉ fallback về cách dựng tên cũ khi (hiếm) không đọc được header (vd bị
 * chặn CORS ở môi trường lạ).
 *
 * ⚠️ Cũng sửa luôn lỗi kiểu dữ liệu: tham số dưới đây trước đây khai
 * `Omit<CustomerFilters, ...>` trong khi type import ở trên là
 * `CustomerFilterParams` - `CustomerFilters` KHÔNG hề tồn tại ở bất kỳ đâu
 * trong codebase (chỉ là tên gõ nhầm), lẽ ra phải fail `tsc --noEmit`.
 */
function extractFilenameFromContentDisposition(header?: string | null): string | null {
  if (!header) return null;
  // Ưu tiên `filename*` (RFC 5987 - hỗ trợ tên có dấu/khoảng trắng), đúng
  // định dạng BE đang set: `filename*=UTF-8''<encoded>`.
  const starMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (starMatch) {
    try {
      return decodeURIComponent(starMatch[1]);
    } catch {
      // Rơi xuống thử filename= thường bên dưới.
    }
  }
  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1] : null;
}

/** "YYYY-MM-DD" -> "DD-MM-YY" - chỉ dùng cho fallback khi không đọc được
 * Content-Disposition (xem JSDoc `extractFilenameFromContentDisposition`). */
function isoDateToFileToken(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y.slice(2)}`;
}

function buildFallbackFilename(from?: string, to?: string): string {
  if (from && to) {
    return `KhachHang ${isoDateToFileToken(from)} - ${isoDateToFileToken(to)}.xlsx`;
  }
  return `KhachHang ToanBo.xlsx`;
}

export const customersExportApi = {
  /**
   * Xuất Excel danh sách khách hàng - nhận ĐÚNG bộ filter đang áp dụng
   * (từ trang /customers hoặc từ Modal xuất - xem ExportCustomersModal.tsx)
   * để đảm bảo dữ liệu xuất ra khớp với những gì người dùng đang lọc, đồng
   * thời để backend áp lại đúng RBAC scope (`customers.export`) khi build
   * lại danh sách.
   */
  exportCustomers: async (
    filters: Omit<CustomerFilterParams, 'page' | 'limit'>,
  ) => {
    try {
      const response = await axiosInstance.get('/customers/export', {
        params: filters,
        responseType: 'blob',
      });
      const filename =
        extractFilenameFromContentDisposition(response.headers?.['content-disposition']) ||
        buildFallbackFilename(filters.dateFrom, filters.dateTo);
      triggerBrowserDownload(response.data, filename);
    } catch (error) {
      await rethrowWithParsedBlobError(error);
    }
  },
};