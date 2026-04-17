import axiosInstance from './axios-instance';
import { AuditFilters, PaginatedAuditResponse } from '../types/audit.types';

export const auditApi = {
  getLogs: async (filters: AuditFilters): Promise<PaginatedAuditResponse> => {
    const params: any = { ...filters };
    // Remove undefined values
    Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);
    const response = await axiosInstance.get('/audit-logs', { params });
    return response.data;
  },

  getActions: async (): Promise<string[]> => {
    const response = await axiosInstance.get('/audit-logs/actions');
    return response.data;
  },
};
