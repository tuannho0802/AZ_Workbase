import axiosInstance from './axios-instance';
import { Customer, PaginatedResponse } from '../types/customer.types';

export const customersApi = {
  getCustomers: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<PaginatedResponse<Customer>> => {
    const response = await axiosInstance.get('/customers', { params });
    return response.data;
  },
};
