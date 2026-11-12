import axiosInstance from './axios-instance';
import { rethrowWithParsedBlobError, triggerBrowserDownload } from './attendance-export.api';
import { useAuthStore } from '../stores/auth.store';
import { toPascalSlug } from '../utils/vietnamese-slug.util';
import type { FanpageFilters } from './fanpages.api';

/** Bộ lọc xuất = bộ lọc danh sách Page + kỳ (from/to) cho sheet Bài đăng / Số liệu / Khách & Tiền nạp. */
export type FanpageExportParams = Omit<FanpageFilters, 'page' | 'limit'> & { from?: string; to?: string };

/** Tên file dựng lại ở FE đúng công thức BE (`FanpageExportService.export`) - header content-disposition không đọc được qua CORS. */
function buildFilename(from?: string, to?: string): string {
    const name = useAuthStore.getState().user?.name;
    const slug = name ? toPascalSlug(name) : '';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const span = from && to ? `${from}_${to}` : today;
    return `Fanpage_${span}${slug ? `_ExportBy-${slug}` : ''}.xlsx`;
}

export const fanpageExportApi = {
    /** `GET /fanpages/export` - gate `fanpages.export` ở BE. */
    exportExcel: async (params: FanpageExportParams): Promise<string> => {
        try {
            const res = await axiosInstance.get('/fanpages/export', { params, responseType: 'blob' });
            const filename = buildFilename(params.from, params.to);
            triggerBrowserDownload(res.data, filename);
            return filename;
        } catch (error) {
            return rethrowWithParsedBlobError(error);
        }
    },
};
