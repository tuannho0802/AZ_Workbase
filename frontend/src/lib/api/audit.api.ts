import axiosInstance from './axios-instance';
import { AuditFilters, PaginatedAuditResponse, AuditSettings } from '../types/audit.types';

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

  // Admin Cleanup Settings
  getSettings: async (): Promise<AuditSettings> => {
    const response = await axiosInstance.get('/audit-logs/settings');
    return response.data;
  },

  updateSettings: async (settings: AuditSettings): Promise<{ success: boolean }> => {
    const response = await axiosInstance.post('/audit-logs/settings', settings);
    return response.data;
  },

  // Manual Cleanup
  cleanupByRange: async (from: string, to: string): Promise<{ success: boolean; count: number }> => {
    const response = await axiosInstance.delete('/audit-logs/cleanup', {
      params: { from, to }
    });
    return response.data;
  },

  bulkDelete: async (ids: number[]): Promise<{ success: boolean }> => {
    const response = await axiosInstance.delete('/audit-logs/bulk', {
      data: { ids }
    });
    return response.data;
  },
};
