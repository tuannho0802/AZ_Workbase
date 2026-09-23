import axiosInstance from './axios-instance';
import { CustomerFilterParams } from '../hooks/useCustomers';
import { useAuthStore } from '../stores/auth.store';
import { toPascalSlug } from '../utils/vietnamese-slug.util';

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

/** "YYYY-MM-DD" -> "DD-MM-YY" - PHẢI khớp y hệt cách backend format ngày
 * trong tên file (`customers-export.service.ts#buildFilename`). */
function isoDateToFileToken(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y.slice(2)}`;
}

/**
 * ⚠️ SỬA LẦN 2 (2026-09-23) - RÚT KINH NGHIỆM TỪ LẦN SỬA TRƯỚC:
 *
 * Lần trước đã sửa theo hướng đọc tên file thật từ header
 * `Content-Disposition` do backend trả về. Về mặt LOGIC đúng, nhưng THỰC TẾ
 * người dùng vẫn thấy "KhachHang ToanBo.xlsx" - nguyên nhân: `main.ts` bật
 * CORS với `exposedHeaders: ['Authorization']`, KHÔNG có
 * `'Content-Disposition'`. Với request cross-origin (Frontend/Backend khác
 * domain - đúng kiến trúc Vercel FE + Backend riêng của dự án này, xem
 * `allowedOrigins`/`FRONTEND_URL` ở main.ts), trình duyệt tự ẩn MỌI response
 * header không nằm trong whitelist đó khỏi JavaScript - `response.headers`
 * ở axios KHÔNG BAO GIỜ có `content-disposition`, nên code luôn rơi vào
 * nhánh fallback cũ dù backend đã build đúng tên.
 *
 * `attendance-export.api.ts` (file xuất Excel chấm công, viết TRƯỚC file
 * này) đã từng gặp đúng vấn đề này và chọn giải pháp: KHÔNG đọc header, tự
 * dựng lại tên file ở FE theo ĐÚNG công thức backend dùng - cách này chắc
 * chắn 100%, không phụ thuộc cấu hình CORS. Áp dụng lại đúng pattern đó ở
 * đây: `toPascalSlug()` bản FE (`vietnamese-slug.util.ts`) PHẢI cho ra kết
 * quả giống hệt bản backend cho cùng input, và lấy tên người đang đăng nhập
 * từ `useAuthStore` (giống cách `axios-instance.ts` lấy token) thay vì chờ
 * server trả về.
 */
function buildExportFilename(from?: string, to?: string): string {
  const currentUserName = useAuthStore.getState().user?.name;
  const nameSlug = currentUserName ? toPascalSlug(currentUserName) : '';
  const prefix = nameSlug ? `Khach-Hang-ExportBy-${nameSlug}` : 'KhachHang';

  if (from && to) {
    return `${prefix} ${isoDateToFileToken(from)} - ${isoDateToFileToken(to)}.xlsx`;
  }
  return `${prefix} ToanBo.xlsx`;
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
      triggerBrowserDownload(response.data, buildExportFilename(filters.dateFrom, filters.dateTo));
    } catch (error) {
      await rethrowWithParsedBlobError(error);
    }
  },
};