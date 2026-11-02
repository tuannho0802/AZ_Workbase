import axiosInstance from './axios-instance';
import { rethrowWithParsedBlobError, triggerBrowserDownload } from './attendance-export.api';
import type { LeaveExportModel, LeaveExportRequest } from '../types/leave-export.types';
import { filenameFromContentDisposition } from '../utils/leaveExport';

/**
 * Xuất Excel thống kê nghỉ phép - gate `leave_requests.approve` ở BE. Kỳ/bộ lọc/form đi trong BODY (POST) vì
 * BE kế thừa QueryLeaveStatsDto; chỉ khi bấm "Xuất Excel" mới gọi `exportExcel` (Demo dùng `preview`).
 */
export const leaveExportApi = {
    async preview(body: LeaveExportRequest): Promise<LeaveExportModel> {
        const res = await axiosInstance.post<LeaveExportModel>('/leave-requests/export/preview', body);
        return res.data;
    },

    async exportExcel(body: LeaveExportRequest): Promise<string> {
        try {
            const res = await axiosInstance.post('/leave-requests/export', body, { responseType: 'blob' });
            const filename = filenameFromContentDisposition(
                res.headers?.['content-disposition'] as string | undefined,
                `NghiPhep_${body.form}.xlsx`,
            );
            triggerBrowserDownload(res.data, filename);
            return filename;
        } catch (error) {
            return rethrowWithParsedBlobError(error);
        }
    },
};
