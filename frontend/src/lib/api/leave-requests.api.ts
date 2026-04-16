import axiosInstance from './axios-instance';

export interface LeaveRequest {
  id: number;
  leaveType: 'annual' | 'sick' | 'maternity' | 'unpaid' | 'compensatory';
  startDate: string;
  endDate: string;
  duration: 'full_day' | 'half_day_am' | 'half_day_pm';
  totalDays: number;
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
    };
  };
  approver: {
    id: number;
    name: string;
  } | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
}

export const leaveRequestsApi = {
  async create(data: {
    leaveType: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    duration: string;
    reason: string;
  }) {
    const res = await axiosInstance.post('/leave-requests', data);
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
