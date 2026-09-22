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
  // Số ảnh đính kèm - BE tính qua loadRelationCountAndMap() ở findAll()/
  // findPending()/findHistory() (xem LeaveRequest.attachmentCount ở entity),
  // KHÔNG có ở response của các endpoint đơn lẻ (create/update/approve...).
  // Optional vì lý do đó - FE fallback badge "0" khi field không có.
  attachmentCount?: number;
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
  
  async cancel(id: number) {
    const res = await axiosInstance.patch(`/leave-requests/${id}/cancel`);
    return res.data;
  }
};