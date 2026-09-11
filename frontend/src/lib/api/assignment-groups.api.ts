import axiosInstance from './axios-instance';

export interface AssignmentGroupDepartmentRef {
  departmentId: number;
  department?: { id: number; name: string; color: string };
}
export interface AssignmentGroupPositionRef {
  positionId: number;
  position?: { id: number; code: string; name: string; color: string };
}

export interface AssignmentGroupConfig {
  id: number;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  // Mã màu hex hiển thị Tag nhóm phụ trách ngoài FE - luôn có giá trị (BE
  // cột NOT NULL DEFAULT, xem migration AddColorToRbacGroupingTables1781300000000).
  color: string;
  departments: AssignmentGroupDepartmentRef[];
  positions: AssignmentGroupPositionRef[];
}

export interface CreateAssignmentGroupPayload {
  key: string;
  name: string;
  description?: string;
  departmentIds: number[];
  positionIds?: number[];
  color?: string;
}

export interface UpdateAssignmentGroupPayload {
  name?: string;
  description?: string;
  departmentIds: number[];
  positionIds?: number[];
  color?: string;
}

export interface AssignmentGroupUser {
  id: number;
  name: string;
  // ⚠️ MỚI (2026-09-10, rà soát GroupManagersModal.tsx): backend
  // `resolveUsers()` giờ trả đủ field giống `GET /users/all` (dùng chung bởi
  // SalesUserSelect) để FE vẽ dropdown chi tiết avatar/role/department/vị
  // trí thay vì chỉ hiện tên trơn.
  email: string;
  role: string;
  // ⚠️ MỚI (đồng bộ Tag màu CustomerFilters.tsx "Sales (Phòng Kinh Doanh)"/
  // "Marketing (Phòng Marketing)" + chia-data/page.tsx "Data Owner"/"Lọc
  // theo Sales") - `color` giờ có sẵn từ BE (xem
  // AssignmentGroupsService.resolveUsers()), dùng chung `resolveEntityColor()`
  // như mọi Tag Phòng ban/Vị trí khác trong app.
  department?: { id: number; name: string; color?: string } | null;
  position?: { id: number; name: string; code?: string; color?: string } | null;
}

export const assignmentGroupsApi = {
  getAll: async (): Promise<AssignmentGroupConfig[]> => {
    const response = await axiosInstance.get<AssignmentGroupConfig[]>('/assignment-groups');
    return response.data;
  },

  getById: async (id: number): Promise<AssignmentGroupConfig> => {
    const response = await axiosInstance.get<AssignmentGroupConfig>(`/assignment-groups/${id}`);
    return response.data;
  },

  create: async (data: CreateAssignmentGroupPayload): Promise<AssignmentGroupConfig> => {
    const response = await axiosInstance.post<AssignmentGroupConfig>('/assignment-groups', data);
    return response.data;
  },

  update: async (id: number, data: UpdateAssignmentGroupPayload): Promise<AssignmentGroupConfig> => {
    const response = await axiosInstance.patch<AssignmentGroupConfig>(`/assignment-groups/${id}`, data);
    return response.data;
  },

  remove: async (id: number): Promise<{ deleted: true }> => {
    const response = await axiosInstance.delete(`/assignment-groups/${id}`);
    return response.data;
  },

  // Chỉ cần đăng nhập (không cần assignment_groups.manage) - khớp
  // AssignmentGroupsController.resolveUsers().
  getUsers: async (key: string): Promise<AssignmentGroupUser[]> => {
    const response = await axiosInstance.get<AssignmentGroupUser[]>(`/assignment-groups/${key}/users`);
    return response.data;
  },
};