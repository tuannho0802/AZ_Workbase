import axiosInstance from './axios-instance';

export interface AssignmentGroupDepartmentRef {
  departmentId: number;
  department?: { id: number; name: string };
}
export interface AssignmentGroupPositionRef {
  positionId: number;
  position?: { id: number; code: string; name: string };
}

export interface AssignmentGroupConfig {
  id: number;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  departments: AssignmentGroupDepartmentRef[];
  positions: AssignmentGroupPositionRef[];
}

export interface CreateAssignmentGroupPayload {
  key: string;
  name: string;
  description?: string;
  departmentIds: number[];
  positionIds?: number[];
}

export interface UpdateAssignmentGroupPayload {
  name?: string;
  description?: string;
  departmentIds: number[];
  positionIds?: number[];
}

export interface AssignmentGroupUser {
  id: number;
  name: string;
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
