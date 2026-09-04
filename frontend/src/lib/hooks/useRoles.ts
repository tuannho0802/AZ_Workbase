import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '../api/roles.api';
import {
    RoleWithPermissions,
    Permission,
    CreateRolePayload,
    UpdateRolePayload,
    UpdateRolePermissionsPayload,
} from '../types/roles.types';

const ROLES_KEY = ['roles'];
const PERMISSIONS_KEY = ['permissions'];
const MY_PERMISSIONS_KEY = ['my-permissions'];

// Cùng lý do EMPTY_ARRAY dùng chung ở useLinkGroups.ts - tránh tạo array
// mới mỗi render khi data còn undefined (infinite loop nếu nơi gọi có
// useEffect phụ thuộc reference này).
const EMPTY_ROLES: RoleWithPermissions[] = [];
const EMPTY_PERMISSIONS: Permission[] = [];

export const useRoles = () => {
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ROLES_KEY,
        queryFn: () => rolesApi.getAllRoles(),
        staleTime: 30 * 1000,
    });

    return { roles: (data as RoleWithPermissions[]) ?? EMPTY_ROLES, isLoading, isError, error, refetch };
};

export const useAllPermissions = () => {
    const { data, isLoading } = useQuery({
        queryKey: PERMISSIONS_KEY,
        // Danh mục permission gần như không đổi (chỉ đổi khi dev thêm tính năng
        // mới kèm migration) - cache dài, không cần refetch liên tục.
        queryFn: () => rolesApi.getAllPermissions(),
        staleTime: 5 * 60 * 1000,
    });

    return { permissions: (data as Permission[]) ?? EMPTY_PERMISSIONS, isLoading };
};

function useInvalidateRoles() {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: ROLES_KEY });
        // ⚠️ Invalidate LUÔN cả my-permissions - nếu Admin vừa sửa ma trận quyền
        // của CHÍNH role mình đang mang, sidebar/trang chủ phải cập nhật ngay,
        // không đợi hết staleTime 60s của useMyPermissions (UX "thấy ngay kết
        // quả vừa đổi" thay vì phải F5 hoặc chờ).
        queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_KEY });
    };
}

export const useCreateRole = () => {
    const invalidate = useInvalidateRoles();
    return useMutation({
        mutationFn: (payload: CreateRolePayload) => rolesApi.createRole(payload),
        onSuccess: invalidate,
    });
};

export const useUpdateRole = () => {
    const invalidate = useInvalidateRoles();
    return useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: UpdateRolePayload }) =>
            rolesApi.updateRole(id, payload),
        onSuccess: invalidate,
    });
};

export const useDeleteRole = () => {
    const invalidate = useInvalidateRoles();
    return useMutation({
        mutationFn: (id: number) => rolesApi.deleteRole(id),
        onSuccess: invalidate,
    });
};

export const useUpdateRolePermissions = () => {
    const invalidate = useInvalidateRoles();
    return useMutation({
        mutationFn: ({ id, payload }: { id: number; payload: UpdateRolePermissionsPayload }) =>
            rolesApi.updateRolePermissions(id, payload),
        onSuccess: invalidate,
    });
};