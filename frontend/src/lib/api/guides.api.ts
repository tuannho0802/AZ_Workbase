import axiosInstance from './axios-instance';

export interface GuideRoleBrief {
    id: number;
    code: string;
    name: string;
    color: string;
}

export interface GuidePositionBrief {
    id: number;
    code: string;
    name: string;
    color: string;
}

/** Permission để chọn "cần quyền để xem" (đọc từ bảng permissions qua /guides/manage/permissions). */
export interface GuidePermissionBrief {
    key: string;
    resource: string;
    action: string;
    description: string | null;
}

export interface GuideDepartmentBrief {
    id: number;
    name: string;
    color: string;
}

/** Mục lục (người dùng thường) - không kèm nội dung. */
export interface GuideListItem {
    id: number;
    title: string;
    slug: string;
    sortOrder: number;
    updatedAt: string;
}

/** Danh sách quản trị - gồm bản nháp, kèm role + trạng thái, không kèm nội dung. */
export interface GuideManageItem extends GuideListItem {
    isPublished: boolean;
    roleIds: number[];
    roles: GuideRoleBrief[];
    positionIds: number[];
    positions: GuidePositionBrief[];
    departmentIds: number[];
    departments: GuideDepartmentBrief[];
    /** Các permission key người xem phải có TẤT CẢ (rỗng = không yêu cầu). */
    requiredPermissions: string[];
    createdAt: string;
}

export interface GuideDetail extends GuideManageItem {
    content: string;
    /** Tên người sửa cuối (null = chưa sửa lần nào). */
    updatedByName: string | null;
}

export interface CreateGuidePayload {
    title: string;
    /** Bỏ trống = BE tự sinh từ tiêu đề. */
    slug?: string;
    content: string;
    sortOrder?: number;
    isPublished?: boolean;
    /** Rỗng/bỏ trống = mọi role đăng nhập đều xem được. */
    roleIds?: number[];
    /** Rỗng/bỏ trống = không giới hạn theo vị trí. */
    positionIds?: number[];
    /** Rỗng/bỏ trống = không giới hạn theo phòng ban. */
    departmentIds?: number[];
    /** Phải có TẤT CẢ các permission này mới xem được (AND với các chiều trên). Rỗng/bỏ trống = không yêu cầu. */
    requiredPermissions?: string[];
}

/** Không gửi roleIds/positionIds/departmentIds/requiredPermissions = giữ nguyên; gửi `[]` = bỏ giới hạn. */
export type UpdateGuidePayload = Partial<CreateGuidePayload>;

export const guidesApi = {
    /** Mọi role đăng nhập: chỉ guide đã xuất bản + đúng role của mình. */
    list: async (): Promise<GuideListItem[]> => {
        const res = await axiosInstance.get<GuideListItem[]>('/guides');
        return res.data;
    },

    getBySlug: async (slug: string): Promise<GuideDetail> => {
        const res = await axiosInstance.get<GuideDetail>(`/guides/${encodeURIComponent(slug)}`);
        return res.data;
    },

    // ---- Nhóm quản trị (BE gác `guides.manage`) ----
    listManage: async (): Promise<GuideManageItem[]> => {
        const res = await axiosInstance.get<GuideManageItem[]>('/guides/manage/all');
        return res.data;
    },

    listRoleOptions: async (): Promise<GuideRoleBrief[]> => {
        const res = await axiosInstance.get<GuideRoleBrief[]>('/guides/manage/roles');
        return res.data;
    },

    listPositionOptions: async (): Promise<GuidePositionBrief[]> => {
        const res = await axiosInstance.get<GuidePositionBrief[]>('/guides/manage/positions');
        return res.data;
    },

    listDepartmentOptions: async (): Promise<GuideDepartmentBrief[]> => {
        const res = await axiosInstance.get<GuideDepartmentBrief[]>('/guides/manage/departments');
        return res.data;
    },

    listPermissionOptions: async (): Promise<GuidePermissionBrief[]> => {
        const res = await axiosInstance.get<GuidePermissionBrief[]>('/guides/manage/permissions');
        return res.data;
    },

    getManageDetail: async (id: number): Promise<GuideDetail> => {
        const res = await axiosInstance.get<GuideDetail>(`/guides/manage/${id}`);
        return res.data;
    },

    create: async (data: CreateGuidePayload): Promise<GuideDetail> => {
        const res = await axiosInstance.post<GuideDetail>('/guides', data);
        return res.data;
    },

    update: async (id: number, data: UpdateGuidePayload): Promise<GuideDetail> => {
        const res = await axiosInstance.patch<GuideDetail>(`/guides/${id}`, data);
        return res.data;
    },

    remove: async (id: number): Promise<{ success: true }> => {
        const res = await axiosInstance.delete<{ success: true }>(`/guides/${id}`);
        return res.data;
    },
};