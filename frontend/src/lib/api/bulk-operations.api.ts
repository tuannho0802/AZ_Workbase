import axiosInstance from './axios-instance';

/** Kết quả hoàn tác: `skipped` = khách bị bỏ qua (đã sửa sau thao tác / vào Thùng rác / không còn). */
export interface BulkUndoResult {
    restored: number;
    skipped: Array<{ id: number; reason: string }>;
}

/** Phần BE đính kèm vào kết quả thao tác hàng loạt để FE hiện nút Hoàn tác (null = không có gì để hoàn tác). */
export interface BulkUndoInfo {
    operationId: number | null;
    undoExpiresInSeconds: number | null;
}

export const bulkOperationsApi = {
    /** Hoàn tác trong 5 phút (chỉ người thực hiện hoặc Admin). 403 / 409 (đã hoàn tác) / 410 (quá hạn). */
    undo: async (operationId: number): Promise<BulkUndoResult> => {
        const response = await axiosInstance.post<BulkUndoResult>(`/bulk-operations/${operationId}/undo`);
        return response.data;
    },
};