import axiosInstance from './axios-instance';
import {
    ReportQuery,
    RevenueReport,
    CustomerReport,
    QualityReport,
    MarketingReport,
    MarketingReportFilters,
    ReportCustomerList,
    ReportCustomerListQuery,
    ReportCustomerDetail,
    ReportContext,
    GroupQualityReport,
    GroupQualityFilters,
} from '../types/reports.types';

export const reportsApi = {
    getRevenueReport: async (query: ReportQuery): Promise<RevenueReport> => {
        const response = await axiosInstance.get<RevenueReport>('/reports/revenue', { params: query });
        return response.data;
    },

    getCustomerReport: async (query: ReportQuery): Promise<CustomerReport> => {
        const response = await axiosInstance.get<CustomerReport>('/reports/customers', { params: query });
        return response.data;
    },

    getCustomerQualityReport: async (query: ReportQuery): Promise<QualityReport> => {
        const response = await axiosInstance.get<QualityReport>('/reports/quality', { params: query });
        return response.data;
    },

    getMarketingReport: async (query: ReportQuery & MarketingReportFilters): Promise<MarketingReport> => {
        // axios bỏ qua key undefined; marketingUserId/createdById = 0 vẫn được gửi (0 = "chưa gán").
        const response = await axiosInstance.get<MarketingReport>('/reports/marketing', { params: query });
        return response.data;
    },

    getGroupQualityReport: async (query: ReportQuery & GroupQualityFilters): Promise<GroupQualityReport> => {
        const response = await axiosInstance.get<GroupQualityReport>('/reports/group-quality', { params: query });
        return response.data;
    },

    getCustomerList: async (query: ReportCustomerListQuery): Promise<ReportCustomerList> => {
        const response = await axiosInstance.get<ReportCustomerList>('/reports/customer-list', { params: query });
        return response.data;
    },

    getCustomerDetail: async (id: number, context: ReportContext): Promise<ReportCustomerDetail> => {
        const response = await axiosInstance.get<ReportCustomerDetail>(`/reports/customer-detail/${id}`, { params: { context } });
        return response.data;
    },
};
