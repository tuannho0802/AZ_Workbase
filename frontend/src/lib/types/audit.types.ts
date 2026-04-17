export interface AuditUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface AuditLog {
  id: number;
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  oldData: any | null;
  newData: any | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: AuditUser;
  targetCustomer?: {
    id: number;
    name: string;
    deletedAt?: string | null;
  };
}

export interface AuditSettings {
  enabled: boolean;
  retentionDays: number;
}

export interface AuditFilters {
  page?: number;
  limit?: number;
  userId?: number;
  action?: string;
  entityType?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

export interface PaginatedAuditResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
