export interface CustomerNote {
  id: number;
  customerId: number;
  note: string;
  noteType: 'general' | 'call' | 'meeting' | 'follow_up';
  isImportant: boolean;
  createdBy: number;
  createdByUser?: {
    id: number;
    name: string;
    fullName?: string;
    email?: string;
  };
  // NULL nếu ghi chú chưa từng được sửa. Chỉ hiện dòng hệ thống "Sửa cuối
  // bởi" trên UI khi `updatedBy` khác `createdBy` (2 người khác nhau cùng
  // chạm vào 1 note) - xem CustomerNotesTab.tsx.
  updatedBy?: number | null;
  updatedByUser?: {
    id: number;
    name: string;
    fullName?: string;
    email?: string;
  } | null;
  // Số lần ghi chú đã được SỬA (không tính lần tạo đầu tiên) - luôn hiện
  // trên UI cạnh thời gian sửa cuối khi > 0, bất kể người sửa cuối có
  // trùng người tạo hay không (khác `updatedBy` - chỉ dùng để hiện TÊN
  // người sửa khi khác người tạo).
  editCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface RecentNote {
  id: number;
  note: string;
  createdAt: string;
  createdByName: string | null;
}

export interface Deposit {
  id: number;
  customerId: number;
  amount: number;
  depositDate: string;
  broker?: string;
  note?: string;
  createdById?: number;
  createdBy?: {
    id: number;
    name: string;
    fullName?: string;
    email?: string;
  };
  updatedBy?: {
    id: number;
    name: string;
    fullName?: string;
    email?: string;
  };
  updatedAt?: string;
  createdAt: string;
  customer?: {
    id: number;
    name: string;
    phone: string;
    salesUser?: {
      name: string;
      email?: string;
    };
  };
}

export interface CustomerStats {
  totalCustomers: number;
  newToday: number;
  closedTotal: number;
  pendingTotal: number;
  potentialTotal: number;
  totalDepositAmount: number;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  // Nguồn giờ là free-text quản lý qua bảng media_sources (không còn ENUM
  // cứng ở DB) - xem media-sources.api.ts. Giữ string thay vì union cứng để
  // không lệch với dữ liệu thật (vd admin thêm "Zalo" sẽ không khớp type cũ).
  source: string;
  campaign?: string;
  salesUser?: {
    id: number;
    name: string;
    fullName?: string;
    email?: string;
    role?: string;
  };
  marketingUser?: {
    id: number;
    name: string;
    fullName?: string;
    email?: string;
    role?: string;
  };
  status: 'closed' | 'pending' | 'potential' | 'lost' | 'inactive';
  broker?: string;
  inputDate: string;
  assignedDate?: string;
  closedDate?: string;
  department?: {
    id: number;
    name: string;
  };
  note?: string;
  latestFTD?: number;
  totalDeposit30Days?: number;
  activeAssignees?: any[];
  // Số nhóm liên kết (Zalo/Telegram...) khách hàng ĐÃ join - tính batch 1
  // query/trang ở backend (customers.service.ts findAll()), KHÔNG phải
  // N+1 query. Chỉ có mặt khi backend trả kèm (luôn có ở findAll()).
  joinedGroupsCount?: number;
  /** Tên các nhóm đã join (kèm id) - dùng để hiển thị tag theo pattern
   * giống "Sales chính/phụ" (tên nhóm đầu + "+N", hover xem chi tiết). */
  joinedGroups?: Array<{ id: number; name: string }>;
  notes?: CustomerNote[];
  // Tối đa 5 note gần nhất (mới nhất trước) - trả kèm sẵn từ findAll() (1
  // query/trang, KHÔNG N+1) - dùng cho cột "Ghi chú gần nhất" ở bảng danh
  // sách, KHÁC với `notes` (đầy đủ, chỉ có ở findOne() khi mở chi tiết).
  recentNotes?: RecentNote[];
  deposits?: Deposit[];
  createdById?: number;
  updatedById?: number;
  createdBy?: {
    id: number;
    name: string;
    fullName?: string;
    email?: string;
  };
  updatedBy?: {
    id: number;
    name: string;
    fullName?: string;
    email?: string;
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}