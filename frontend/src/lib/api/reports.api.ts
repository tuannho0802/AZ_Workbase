import axiosInstance from './axios-instance';
import { ReportQuery, RevenueReport, CustomerReport } from '../types/reports.types';

export const reportsApi = {
    getRevenueReport: async (query: ReportQuery): Promise<RevenueReport> => {
        const response = await axiosInstance.get<RevenueReport>('/reports/revenue', { params: query });
        return response.data;
    },

    getCustomerReport: async (query: ReportQuery): Promise<CustomerReport> => {
        const response = await axiosInstance.get<CustomerReport>('/reports/customers', { params: query });
        return response.data;
    },
};