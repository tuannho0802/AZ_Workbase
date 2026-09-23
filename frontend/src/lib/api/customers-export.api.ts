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

/** "YYYY-MM-DD" -> "DD-MM-YY" - PHẢI khớp isoDateToFileToken() phía FE cũ
 * (attendance-export.api.ts) chỉ để tên file thân thiện, KHÔNG cần khớp
 * chính xác backend (backend tự đặt tên riêng qua Content-Disposition,
 * nhưng browser tải bằng `a.download` nên vẫn cần tự dựng tên ở đây). */
function isoDateToFileToken(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y.slice(2)}`;
}

function buildExportFilename(from?: string, to?: string): string {
  if (from && to) {
    return `KhachHang ${isoDateToFileToken(from)} - ${isoDateToFileToken(to)}.xlsx`;
  }
  return `KhachHang ToanBo.xlsx`;
}

export const customersExportApi = {
  /**
   * Xuất Excel danh sách khách hàng - nhận ĐÚNG bộ filter đang áp dụng trên
   * bảng chính (trang /customers) để đảm bảo dữ liệu xuất ra khớp với
   * những gì người dùng đang xem, đồng thời để backend áp lại đúng RBAC
   * scope (`customers.export`) khi build lại danh sách.
   */
  exportCustomers: async (
    filters: Omit<CustomerFilters, 'page' | 'limit'>,
  ) => {
    try {
      const response = await axiosInstance.get('/customers/export', {
        params: filters,
        responseType: 'blob',
      });
      triggerBrowserDownload(response.data, buildExportFilename(filters.dateFrom, filters.dateTo));
    } catch (error) {
      await rethrowWithParsedBlobError(error);
    }
  },
};
