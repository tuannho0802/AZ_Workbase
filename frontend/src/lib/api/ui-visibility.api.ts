import axiosInstance from './axios-instance';

export interface UiVisibilityRuleEntry {
  elementKey: string;
  visible: boolean;
}

export interface UiVisibilityDepartmentOverride {
  departmentId: number;
  departmentName?: string;
  rules: UiVisibilityRuleEntry[];
}

export interface UiVisibilityPositionOverride {
  positionId: number;
  positionName?: string;
  rules: UiVisibilityRuleEntry[];
}

// Khớp shape trả về từ UiVisibilityService.getRoleRules() ở BE.
export interface RoleUiVisibilityRules {
  resource: string;
  elementKeys: string[];
  global: UiVisibilityRuleEntry[];
  departmentOverrides: UiVisibilityDepartmentOverride[];
  positionOverrides: UiVisibilityPositionOverride[];
}

export interface UpsertUiVisibilityRulesPayload {
  resource: string;
  // KHÔNG được set cả hai cùng lúc (validate ở BE) - undefined cả hai = scope Toàn cục.
  departmentId?: number;
  positionId?: number;
  rules: UiVisibilityRuleEntry[];
}

export interface DeleteUiVisibilityRulesQuery {
  resource: string;
  departmentId?: number;
  positionId?: number;
}

export const uiVisibilityApi = {
  // Self-service - dùng cho FE tự ẩn cột/tab, không cần roles.manage.
  getMyHidden: async (resource: string): Promise<string[]> => {
    const response = await axiosInstance.get<string[]>('/ui-visibility/my-hidden', {
      params: { resource },
    });
    return response.data;
  },

  getRoleRules: async (roleId: number, resource: string): Promise<RoleUiVisibilityRules> => {
    const response = await axiosInstance.get<RoleUiVisibilityRules>(
      `/roles/${roleId}/ui-visibility-rules`,
      { params: { resource } },
    );
    return response.data;
  },

  upsertRoleRules: async (
    roleId: number,
    payload: UpsertUiVisibilityRulesPayload,
  ): Promise<{ success: true; count: number }> => {
    const response = await axiosInstance.put(`/roles/${roleId}/ui-visibility-rules`, payload);
    return response.data;
  },

  deleteRoleRules: async (
    roleId: number,
    query: DeleteUiVisibilityRulesQuery,
  ): Promise<{ success: true }> => {
    const response = await axiosInstance.delete(`/roles/${roleId}/ui-visibility-rules`, {
      params: query,
    });
    return response.data;
  },
};
