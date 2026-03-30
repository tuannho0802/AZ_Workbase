export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  source: 'Facebook' | 'TikTok' | 'Google' | 'Instagram' | 'Other';
  campaign?: string;
  salesUser: {
    id: number;
    name: string;
  };
  status: 'closed' | 'pending' | 'potential' | 'lost';
  broker?: string;
  closedDate?: string;
  department: {
    id: number;
    name: string;
  };
  note?: string;
  latestFTD?: number;
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
