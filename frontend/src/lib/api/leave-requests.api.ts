import axiosInstance from './axios-instance';
import type { ReportQuery } from '../types/reports.types';
import type { LeaveStatsFilters, LeaveStatsResponse } from '../types/leave-stats.types';

export interface LeaveRequest {
  id: number;
  leaveType: 'annual' | 'sick' | 'maternity' | 'unpaid' | 'compensatory';
  startDate: string;
  endDate: string;
  duration: 'full_day' | 'half_day_am' | 'half_day_pm';
  totalDays: number;
  // Period Hours (Optional) - khung giờ Từ - Đến cụ thể trong ngày (vd
  // '14:00:00' - '17:00:00'), TÁCH BIỆT với duration/totalDays. null khi
  // không dùng Period Hours (mặc định). Format trả về từ BE: HH:mm:ss.
  periodStartTime: string | null;
  periodEndTime: string | null;
  reason: string;
  // Đơn bổ sung - BE tính tự động lúc create() khi startDate sớm hơn ngày
  // tạo đơn (tạo bù, quên tạo trước ngày nghỉ). Không đổi lại khi update().
  isSupplementary: boolean;
  rejectionReason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requester: {
    id: number;
    name: string;
    email: string;
    department?: {
      id: number;
      name: string;
      // Mã màu hex hiển thị Tag phòng ban ngoài FE - luôn có giá trị (BE
      // cột NOT NULL DEFAULT, xem migration AddColorToRbacGroupingTables1781300000000).
      color?: string;
    };
  };
  approver: {
    id: number;
    name: string;
  } | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  // Thời điểm huỷ/xoá mềm - có giá trị = đơn đang ở THÙNG RÁC (tab Thùng rác ở
  // /duyet-phep). Do chủ đơn huỷ đơn pending, hoặc người có `leave_requests.delete`
  // chuyển đơn đã duyệt/từ chối vào thùng rác.
  cancelledAt?: string | null;
  // Số ảnh đính kèm - BE tính qua loadRelationCountAndMap() ở findAll()/
  // findPending()/findHistory() (xem LeaveRequest.attachmentCount ở entity),
  // KHÔNG có ở response của các endpoint đơn lẻ (create/update/approve...).
  // Optional vì lý do đó - FE fallback badge "0" khi field không có.
  attachmentCount?: number;
}

/** Bộ lọc + tham số week-mode của 3 endpoint list (mine/pending/history). */
export interface LeaveListFilters {
  page?: number;         // trang TUẦN (1-based)
  weeksPerPage?: number; // mặc định 4
  // PHA 2 (lazy-load 1 tuần): 'YYYY-MM-DD' của Thứ 2. Không truyền = chỉ lấy `weeks`.
  weekStart?: string;
  weekPage?: number;
  weekLimit?: number;
  search?: string;
  departmentId?: number;
  leaveType?: string;
  status?: string;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;   // YYYY-MM-DD
}

export interface LeaveWeekModeResponse<T> {
  data: T[];
  /** Tổng bản ghi của TẤT CẢ tuần khớp filter (không riêng trang này). */
  total: number;
  page: number;
  totalPages: number;
  totalWeeks: number;
  weeksPerPage: number;
  weeks: { weekStart: string; count: number }[];
  weekTotal?: number;
}

/** Kết quả thao tác hàng loạt - từng đơn độc lập (partial success). */
export interface BulkLeaveResult {
  succeeded: number[];
  failed: { id: number; reason: string }[];
}

/** BE giới hạn 100 id/lần (BULK_LEAVE_MAX) - FE tự cắt lô nếu chọn nhiều hơn. */
const BULK_CHUNK = 100;

async function postBulkChunked(url: string, ids: number[]): Promise<BulkLeaveResult> {
  const merged: BulkLeaveResult = { succeeded: [], failed: [] };
  for (let i = 0; i < ids.length; i += BULK_CHUNK) {
    const res = await axiosInstance.post<BulkLeaveResult>(url, { ids: ids.slice(i, i + BULK_CHUNK) });
    merged.succeeded.push(...(res.data?.succeeded ?? []));
    merged.failed.push(...(res.data?.failed ?? []));
  }
  return merged;
}

/** Bỏ field rỗng ('' / null / undefined) để không gửi query param thừa lên BE. */
function cleanParams(f: LeaveListFilters): LeaveListFilters {
  return Object.fromEntries(
    Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as LeaveListFilters;
}

export const leaveRequestsApi = {
  // `leave_requests.view` - thống kê nghỉ phép theo kỳ (tab "Thống kê" ở /duyet-phep). Phạm vi xem do BE tự khoanh theo scope.
  async getStats(query: ReportQuery & LeaveStatsFilters): Promise<LeaveStatsResponse> {
    const params = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''),
    );
    const res = await axiosInstance.get<LeaveStatsResponse>('/leave-requests/stats', { params });
    return res.data;
  },

  async create(data: {
    leaveType: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    duration: string;
    reason: string;
    // Period Hours (Optional) - khung giờ Từ - Đến cụ thể trong ngày, dạng
    // 'HH:mm' (vd '14:00'). Phải gửi ĐỦ CẢ HAI hoặc bỏ trống cả hai - xem
    // LeaveRequestsService.validatePeriodHours() ở BE.
    periodStartTime?: string;
    periodEndTime?: string;
    // Object key trên B2 (bucket leave-attachments) đã PUT xong qua
    // presignAttachment() - KHÔNG PHẢI URL. Xem
    // LeaveRequestsService.create() ở BE (mục 5: validate + lưu ảnh).
    attachmentKeys?: string[];
  }) {
    const res = await axiosInstance.post('/leave-requests', data);
    return res.data;
  },

  // `leave_requests.request` - xin Presigned PUT URL để đính kèm 1 ảnh vào
  // đơn ĐANG TẠO (chưa có id đơn lúc gọi, key trả về gửi kèm lúc create()).
  // `leaveType` + `index` là BẮT BUỘC ở BE (PresignAttachmentDto không có
  // @IsOptional, ValidationPipe global bật forbidNonWhitelisted) - dùng để
  // đặt tên file dễ đọc "{TenNV}_{Role}_{LoaiPhep}_{N}_{Ngay}.{ext}".
  async presignAttachment(
    contentType: string,
    leaveType: string,
    index: number,
  ): Promise<{ uploadUrl: string; key: string }> {
    const res = await axiosInstance.post('/leave-requests/attachments/presign', {
      contentType,
      leaveType,
      index,
    });
    return res.data;
  },

  // Dọn ảnh đã PUT lên B2 (qua presignAttachment) nhưng CHƯA gắn vào đơn
  // nào - gọi khi người dùng xoá ảnh khỏi picker, hoặc đóng/huỷ Modal tạo
  // đơn TRƯỚC khi bấm "Tạo đơn". Best-effort ở phía gọi - không throw ra
  // UI nếu lỗi (xem AttachmentUploader.tsx / nghi-phep/page.tsx), vì đây
  // chỉ là dọn rác, không phải luồng nghiệp vụ chính.
  async discardAttachments(keys: string[]) {
    if (keys.length === 0) return;
    const res = await axiosInstance.post('/leave-requests/attachments/discard', { keys });
    return res.data;
  },

  // Ký Presigned GET URL (TTL 10 phút) cho toàn bộ ảnh đính kèm của 1 đơn -
  // chỉ chủ đơn hoặc người có quyền duyệt/xem đúng phạm vi mới gọi được.
  async getAttachmentUrls(id: number): Promise<{ id: number; key: string; url: string }[]> {
    const res = await axiosInstance.get(`/leave-requests/${id}/attachment-urls`);
    return res.data;
  },
  
  // ── WEEK-MODE: phân trang theo TUẦN + lazy-load từng tuần (xem BE
  // LeaveRequestsService.findMinePaged/findPendingPaged/findHistoryPaged).
  // KHÔNG gửi `_t` - DTO BE bật forbidNonWhitelisted (từng gây 400 ở /history).
  async getMinePaged(filters: LeaveListFilters): Promise<LeaveWeekModeResponse<LeaveRequest>> {
    const res = await axiosInstance.get('/leave-requests/mine/paged', { params: cleanParams(filters) });
    return res.data;
  },

  async getPendingPaged(filters: LeaveListFilters): Promise<LeaveWeekModeResponse<LeaveRequest>> {
    const res = await axiosInstance.get('/leave-requests/pending/paged', { params: cleanParams(filters) });
    return res.data;
  },

  async getHistoryPaged(filters: LeaveListFilters): Promise<LeaveWeekModeResponse<LeaveRequest>> {
    const res = await axiosInstance.get('/leave-requests/history/paged', { params: cleanParams(filters) });
    return res.data;
  },

  /** Thùng rác (đơn có cancelledAt) - cùng phạm vi xem với lịch sử duyệt. */
  async getTrashPaged(filters: LeaveListFilters): Promise<LeaveWeekModeResponse<LeaveRequest>> {
    const res = await axiosInstance.get('/leave-requests/trash/paged', { params: cleanParams(filters) });
    return res.data;
  },

  /** Số đơn đang chờ MÌNH duyệt (badge) - nhẹ, không tải danh sách. */
  async getPendingCount(): Promise<number> {
    const res = await axiosInstance.get('/leave-requests/pending/count');
    return Number(res.data?.count ?? 0);
  },

  /** Số đơn CỦA MÌNH đang pending (badge) - nhẹ, không tải danh sách. */
  async getMyPendingCount(): Promise<number> {
    const res = await axiosInstance.get('/leave-requests/mine/pending-count');
    return Number(res.data?.count ?? 0);
  },

  async getAll() {
    // Adding timestamp as a query param to bypass potential browser/proxy caching
    const res = await axiosInstance.get(`/leave-requests?_t=${Date.now()}`);
    return res.data;
  },
  
  async getPending() {
    const res = await axiosInstance.get(`/leave-requests/pending?_t=${Date.now()}`);
    return res.data;
  },

  async getHistory() {
    const res = await axiosInstance.get(`/leave-requests/history?_t=${Date.now()}`);
    return res.data;
  },

  /** Đơn nghỉ đã duyệt trong khoảng ngày, dùng cho bảng Tổng hợp chấm công theo tháng */
  async getApprovedInRange(from: string, to: string) {
    const res = await axiosInstance.get('/leave-requests/approved-range', {
      params: { from, to },
    });
    return res.data as LeaveRequest[];
  },

  // "Sửa hộ" 1 đơn đang PENDING/APPROVED (permission `leave_requests.edit`,
  // TÁCH hẳn khỏi `leave_requests.approve`) - dùng khi User báo lỡ set sai
  // ngày. Không có overlap-check ở BE (đối xứng với bypass ở create()).
  // Chỉ gửi field nào thực sự đổi - xem LeaveRequestsService.update() (mọi
  // field đều optional, field không gửi giữ nguyên giá trị cũ).
  async update(
    id: number,
    data: {
      leaveType?: string;
      startDate?: string; // YYYY-MM-DD
      endDate?: string;   // YYYY-MM-DD
      duration?: string;
      reason?: string;
      // Period Hours (Optional) - gửi '' hoặc null để xoá cặp giờ đã lưu.
      periodStartTime?: string | null;
      periodEndTime?: string | null;
    },
  ) {
    const res = await axiosInstance.patch(`/leave-requests/${id}`, data);
    return res.data;
  },

  async approve(id: number) {
    const res = await axiosInstance.patch(`/leave-requests/${id}/approve`);
    return res.data;
  },
  
  async reject(id: number, reason: string) {
    const res = await axiosInstance.patch(`/leave-requests/${id}/reject`, { reason });
    return res.data;
  },
  
  // Chủ đơn tự huỷ đơn PENDING (-> vào thùng rác) - permission `leave_requests.request`.
  async cancel(id: number) {
    const res = await axiosInstance.patch(`/leave-requests/${id}/cancel`);
    return res.data;
  },

  // Đơn ĐÃ DUYỆT/TỪ CHỐI -> thùng rác (nút "Huỷ" ở tab Lịch sử) - `leave_requests.delete`.
  async trash(id: number) {
    const res = await axiosInstance.patch(`/leave-requests/${id}/trash`);
    return res.data;
  },

  // Xoá vĩnh viễn - CHỈ đơn đang ở thùng rác (BE chặn nếu chưa huỷ) - `leave_requests.delete`.
  async hardDelete(id: number) {
    const res = await axiosInstance.delete(`/leave-requests/${id}`);
    return res.data;
  },

  bulkTrash(ids: number[]): Promise<BulkLeaveResult> {
    return postBulkChunked('/leave-requests/bulk-trash', ids);
  },

  bulkHardDelete(ids: number[]): Promise<BulkLeaveResult> {
    return postBulkChunked('/leave-requests/trash/bulk-delete', ids);
  },
};