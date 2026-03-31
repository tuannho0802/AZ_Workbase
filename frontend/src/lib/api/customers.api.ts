import axiosInstance from './axios-instance';
import { Customer, PaginatedResponse, CustomerStats } from '../types/customer.types';

export const customersApi = {
  getCustomers: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    salesUserId?: number;
    departmentId?: number;
  }): Promise<PaginatedResponse<Customer>> => {
    const response = await axiosInstance.get('/customers', { params });
    return response.data;
  },

  getStats: async (): Promise<CustomerStats> => {
    const response = await axiosInstance.get('/customers/stats');
    return response.data;
  },

  getCustomer: async (id: number): Promise<Customer> => {
    const response = await axiosInstance.get(`/customers/${id}`);
    return response.data;
  },

  createNote: async (id: number, data: { note: string; noteType?: string; isImportant?: boolean }) => {
    const response = await axiosInstance.post(`/customers/${id}/notes`, data);
    return response.data;
  },

  createDeposit: async (id: number, data: { amount: number; depositDate: string; broker?: string; note?: string }) => {
    const response = await axiosInstance.post(`/customers/${id}/deposits`, data);
    return response.data;
  },
};
