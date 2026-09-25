import axiosInstance from './axios-instance';

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
  // Thùng rác - đánh dấu huỷ mềm bằng cancelledAt (thay vì deleted_at/TypeORM soft delete).
  // cancelledAt IS NOT NULL + status PENDING -> Thùng rác "Nghỉ phép" (Owner).
  // cancelledAt IS NOT NULL + status APPROVED/REJECTED -> Thùng rác "Duyệt phép" (Admin).
  cancelledAt?: string | null;
  deletedAt?: string | null;
  deletedBy?: { id: number; name: string } | null;
  // Số ảnh đính kèm - BE tính qua loadRelationCountAndMap() ở findAll()/
  // findPending()/findHistory() (xem LeaveRequest.attachmentCount ở entity),
  // KHÔNG có ở response của các endpoint đơn lẻ (create/update/approve...).
  // Optional vì lý do đó - FE fallback badge "0" khi field không có.
  attachmentCount?: number;
}

/** Tóm tắt 1 tuần (PHA 1 của BE, week-mode) - mirror `WeekBucket` ở `week-window.util.ts`. */
export interface WeekBucketDto {
  /** 'YYYY-MM-DD' của Thứ 2. */
  weekStart: string;
  count: number;
}

// Shape trả về từ `GET /leave-requests`, `/pending`, `/history`, `/trash` -
// mirror ĐÚNG `paginateList()` ở BE (xem `leave-requests.service.ts`).
// `weeks`/`totalWeeks`/`weekTotal` chỉ có khi gọi kèm `weeksPerPage`
// (week-mode) - mirror ĐÚNG `AuditFilters`/response ở `audit.types.ts`.
// ⚠️ FIX BUG THẬT: `weeks` trước đây khai sai kiểu `number` (phải là mảng
// `WeekBucketDto[]` - BE trả PHA 1 là danh sách tuần kèm count, không phải 1
// con số đơn) và thiếu hẳn `totalWeeks` (tổng số tuần, dùng làm `total` của
// `<Pagination>` ở `WeeklyLazySection`) - chưa ai dùng tới nên chưa lộ ra.
export interface PaginatedLeaveRequests {
  data: LeaveRequest[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  weeks?: WeekBucketDto[];
  totalWeeks?: number;
  weekTotal?: number;
}

// Mirror ĐÚNG `QueryLeaveRequestsDto` ở BE - ValidationPipe global bật
// `forbidNonWhitelisted: true` nên field nào KHÔNG khai ở DTO (vd `_t` cache-
// busting kiểu cũ) sẽ bị BE trả 400. Không tự thêm field lạ vào params.
export interface LeaveRequestsQuery {
  page?: number;
  limit?: number;
  weeksPerPage?: number;
  weekStart?: string;
  weekPage?: number;
  weekLimit?: number;
  search?: string;
  departmentId?: number;
  leaveType?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const leaveRequestsApi = {
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
  
  // ⚠️ ĐỔI: BE giờ LUÔN trả `{data, total, page, limit, totalPages}` (không
  // còn mảng trần) - xem comment ở `LeaveRequestsService.findAll()`. Đã bỏ
  // cache-busting `_t=${Date.now()}` kiểu cũ: ValidationPipe global
  // (`forbidNonWhitelisted: true`) từ chối field lạ không khai ở
  // `QueryLeaveRequestsDto` -> từng gây 400 Bad Request hàng loạt (kể cả ở
  // badge sidebar, ảnh hưởng MỌI trang). BE đã tự set Cache-Control phù hợp
  // qua `CacheControlInterceptor` nên không cần workaround này nữa.
  // `limit` mặc định 100 (trần tối đa DTO cho phép) để giữ gần đúng hành vi
  // "tải hết" cũ trong lúc CHỜ 2 trang nghi-phep/duyet-phep chuyển hẳn sang
  // `WeeklyLazySection` (phân trang thật theo tuần) - xem TODO ở 2 trang đó.
  async getAll(params?: LeaveRequestsQuery): Promise<PaginatedLeaveRequests> {
    const res = await axiosInstance.get('/leave-requests', { params });
    return res.data;
  },

  async getPending(params?: LeaveRequestsQuery): Promise<PaginatedLeaveRequests> {
    const res = await axiosInstance.get('/leave-requests/pending', { params });
    return res.data;
  },

  async getHistory(params?: LeaveRequestsQuery): Promise<PaginatedLeaveRequests> {
    const res = await axiosInstance.get('/leave-requests/history', { params });
    return res.data;
  },

  async getTrash(params?: LeaveRequestsQuery): Promise<PaginatedLeaveRequests> {
    const res = await axiosInstance.get('/leave-requests/trash', { params });
    return res.data;
  },

  // Tab "Thùng rác" ở nghi-phep/page.tsx - CHỈ đơn CỦA CHÍNH viewer (permission
  // `leave_requests.request`, KHÔNG cần `leave_requests.delete` - xem
  // LeaveRequestsController.findMyTrash() ở BE).
  async getMyTrash(params?: LeaveRequestsQuery): Promise<PaginatedLeaveRequests> {
    const res = await axiosInstance.get('/leave-requests/my-trash', { params });
    return res.data;
  },

  // Tự xoá mềm đơn CỦA CHÍNH MÌNH (nút "Xoá" ở nghi-phep/page.tsx) - chỉ khi
  // đơn đang PENDING (BE tự chặn nếu đã có quyết định - xem selfSoftDelete()
  // ở LeaveRequestsService). KHÁC hẳn cancel() - xoá đưa đơn vào Thùng rác.
  async selfSoftDelete(id: number) {
    const res = await axiosInstance.delete(`/leave-requests/${id}/self`);
    return res.data;
  },

  // Khôi phục đơn CỦA CHÍNH MÌNH từ Thùng rác.
  async selfRestoreFromTrash(id: number) {
    const res = await axiosInstance.patch(`/leave-requests/my-trash/${id}/restore`);
    return res.data;
  },

  // Xoá VĨNH VIỄN đơn CỦA CHÍNH MÌNH khỏi Thùng rác - không thể hoàn tác.
  async selfHardDelete(id: number) {
    const res = await axiosInstance.delete(`/leave-requests/my-trash/${id}/hard-delete`);
    return res.data;
  },

  async restoreFromTrash(id: number) {
    const res = await axiosInstance.patch(`/leave-requests/trash/${id}/restore`);
    return res.data;
  },

  async hardDelete(id: number) {
    const res = await axiosInstance.delete(`/leave-requests/trash/${id}/hard-delete`);
    return res.data;
  },

  // Xoá mềm (đưa vào Thùng rác) - permission `leave_requests.delete`.
  async softDelete(id: number) {
    const res = await axiosInstance.delete(`/leave-requests/${id}`);
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
  
  async cancel(id: number) {
    const res = await axiosInstance.patch(`/leave-requests/${id}/cancel`);
    return res.data;
  }
};