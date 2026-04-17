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
  source: 'Facebook' | 'TikTok' | 'Google' | 'Instagram' | 'Other';
  campaign?: string;
  salesUser?: {
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
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
