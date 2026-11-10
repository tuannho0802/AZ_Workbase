import axiosInstance from './axios-instance';

export interface FanpagePlatform {
    id: number;
    name: string;
    color: string;
    isActive: boolean;
    sortOrder: number;
    /** Số Page đang dùng nền tảng này (chỉ có ở GET /fanpage-platforms). */
    fanpageCount?: number;
}

export interface FanpageUserBrief {
    id: number;
    name: string;
    employeeCode?: string;
    departmentId?: number | null;
}

/** Quyền của người xem trên TỪNG Page (BE tính sẵn) - FE ẩn nút theo đây, không tự đoán theo role. */
export interface FanpageFlags {
    canEdit: boolean;
    canDelete: boolean;
    canManagePosts: boolean;
    canDeletePosts: boolean;
    canManageNotes: boolean;
    canDeleteNotes: boolean;
}

export interface Fanpage {
    id: number;
    platformId: number;
    platform: FanpagePlatform;
    name: string;
    url: string;
    ownerId: number | null;
    owner: FanpageUserBrief | null;
    isActive: boolean;
    createdBy?: { id: number; name: string } | null;
    createdAt: string;
    updatedAt: string;
    /** Chỉ có ở danh sách. */
    postCount?: number;
    noteCount?: number;
    flags: FanpageFlags;
}

export interface FanpageListResponse {
    data: Fanpage[];
    capabilities: { canCreate: boolean; canAssignOwner: boolean };
}

export interface FanpageFilters {
    platformId?: number;
    ownerId?: number;
    isActive?: 'true' | 'false';
    search?: string;
}

export interface FanpageUserRef {
    id: number;
    name: string;
}

export interface FanpagePost {
    id: number;
    fanpageId: number;
    title: string | null;
    url: string;
    /** YYYY-MM-DD */
    postedDate: string | null;
    note: string | null;
    createdBy: FanpageUserRef | null;
    updatedBy: FanpageUserRef | null;
    createdAt: string;
    updatedAt: string;
}

export interface FanpageNote {
    id: number;
    fanpageId: number;
    note: string;
    editCount: number;
    createdBy: FanpageUserRef | null;
    updatedBy: FanpageUserRef | null;
    createdAt: string;
    updatedAt: string;
}

export interface CreateFanpagePayload {
    platformId: number;
    name: string;
    url: string;
    ownerId?: number;
}

export type UpdateFanpagePayload = Partial<CreateFanpagePayload> & { isActive?: boolean };

export interface FanpagePostPayload {
    url: string;
    title?: string | null;
    postedDate?: string | null;
    note?: string | null;
}

export interface FanpagePlatformPayload {
    name?: string;
    color?: string;
    sortOrder?: number;
}

export const fanpagesApi = {
    list: async (filters: FanpageFilters): Promise<FanpageListResponse> =>
        (await axiosInstance.get<FanpageListResponse>('/fanpages', { params: filters })).data,

    get: async (id: number): Promise<Fanpage> => (await axiosInstance.get<Fanpage>(`/fanpages/${id}`)).data,

    ownerOptions: async (): Promise<FanpageUserBrief[]> =>
        (await axiosInstance.get<FanpageUserBrief[]>('/fanpages/owner-options')).data,

    create: async (data: CreateFanpagePayload): Promise<Fanpage> => (await axiosInstance.post<Fanpage>('/fanpages', data)).data,

    update: async (id: number, data: UpdateFanpagePayload): Promise<Fanpage> =>
        (await axiosInstance.patch<Fanpage>(`/fanpages/${id}`, data)).data,

    remove: async (id: number): Promise<void> => {
        await axiosInstance.delete(`/fanpages/${id}`);
    },

    // ── Bài đăng ──
    listPosts: async (fanpageId: number): Promise<FanpagePost[]> =>
        (await axiosInstance.get<FanpagePost[]>(`/fanpages/${fanpageId}/posts`)).data,

    createPost: async (fanpageId: number, data: FanpagePostPayload): Promise<FanpagePost> =>
        (await axiosInstance.post<FanpagePost>(`/fanpages/${fanpageId}/posts`, data)).data,

    updatePost: async (fanpageId: number, postId: number, data: Partial<FanpagePostPayload>): Promise<FanpagePost> =>
        (await axiosInstance.patch<FanpagePost>(`/fanpages/${fanpageId}/posts/${postId}`, data)).data,

    removePost: async (fanpageId: number, postId: number): Promise<void> => {
        await axiosInstance.delete(`/fanpages/${fanpageId}/posts/${postId}`);
    },

    // ── Ghi chú tiến trình ──
    listNotes: async (fanpageId: number): Promise<FanpageNote[]> =>
        (await axiosInstance.get<FanpageNote[]>(`/fanpages/${fanpageId}/notes`)).data,

    createNote: async (fanpageId: number, note: string): Promise<FanpageNote> =>
        (await axiosInstance.post<FanpageNote>(`/fanpages/${fanpageId}/notes`, { note })).data,

    updateNote: async (fanpageId: number, noteId: number, note: string): Promise<FanpageNote> =>
        (await axiosInstance.patch<FanpageNote>(`/fanpages/${fanpageId}/notes/${noteId}`, { note })).data,

    removeNote: async (fanpageId: number, noteId: number): Promise<void> => {
        await axiosInstance.delete(`/fanpages/${fanpageId}/notes/${noteId}`);
    },

    // ── Nền tảng ──
    listPlatforms: async (activeOnly = false): Promise<FanpagePlatform[]> =>
        (await axiosInstance.get<FanpagePlatform[]>('/fanpage-platforms', { params: activeOnly ? { activeOnly: true } : undefined }))
            .data,

    createPlatform: async (data: FanpagePlatformPayload & { name: string }): Promise<FanpagePlatform> =>
        (await axiosInstance.post<FanpagePlatform>('/fanpage-platforms', data)).data,

    updatePlatform: async (id: number, data: FanpagePlatformPayload): Promise<FanpagePlatform> =>
        (await axiosInstance.patch<FanpagePlatform>(`/fanpage-platforms/${id}`, data)).data,

    lockPlatform: async (id: number): Promise<FanpagePlatform> =>
        (await axiosInstance.patch<FanpagePlatform>(`/fanpage-platforms/${id}/lock`)).data,

    unlockPlatform: async (id: number): Promise<FanpagePlatform> =>
        (await axiosInstance.patch<FanpagePlatform>(`/fanpage-platforms/${id}/unlock`)).data,
};