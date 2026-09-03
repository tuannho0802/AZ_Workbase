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
  createdAt: string;
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
  notes?: CustomerNote[];
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