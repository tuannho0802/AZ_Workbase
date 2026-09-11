import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rolesApi } from '../api/roles.api';
import {
    RoleWithPermissions,
    Permission,
    CreateRolePayload,
    UpdateRolePayload,
    UpdateRolePermissionsPayload,
    DepartmentOverride,
    PositionOverride,
} from '../types/roles.types';

const ROLES_KEY = ['roles'];
const PERMISSIONS_KEY = ['permissions'];
const MY_PERMISSIONS_KEY = ['my-permissions'];
const DEPARTMENT_OVERRIDES_KEY = (roleId: number) => ['role-department-overrides', roleId];
const POSITION_OVERRIDES_KEY = (roleId: number) => ['role-position-overrides', roleId];

// Cùng lý do EMPTY_ARRAY dùng chung ở useLinkGroups.ts - tránh tạo array
// mới mỗi render khi data còn undefined (infinite loop nếu nơi gọi có
// useEffect phụ thuộc reference này).
const EMPTY_ROLES: RoleWithPermissions[] = [];
const EMPTY_PERMISSIONS: Permission[] = [];
const EMPTY_OVERRIDES: DepartmentOverride[] = [];
const EMPTY_POSITION_OVERRIDES: PositionOverride[] = [];

// ⚠️ MỚI (2026-09-11, fix bug 403 "GET /api/roles" ở trang "Vị trí"): tham
// số `enabled` (mặc định `true` - KHÔNG đổi hành vi các nơi gọi cũ, vd
// `/phan-quyen` đã tự gate `canView('roles.view')` trước khi render nên luôn
// enabled là an toàn) - cho phép nơi gọi trì hoãn fetch tới khi THẬT SỰ cần,
// dùng cho các component LUÔN được mount sẵn trong cây (Drawer/Modal điều
// khiển hiện/ẩn qua prop `open`, không unmount) như `PositionVisibilityDrawer`
// - nếu không, `useRoles()` bắn ngay GET /roles lúc trang cha render, BẤT KỂ
// Drawer có đang mở hay không VÀ bất kể người xem trang cha (vd Manager ở
// trang "Vị trí") có quyền `roles.view` hay không -> 403 toast vô nghĩa dù
// họ còn chưa từng bấm nút mở Drawer (nút đó vốn dĩ cũng chỉ hiện với người
// có `roles.manage`, tức Manager không bao giờ bấm được).
export const useRoles = (enabled: boolean = true) => {
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: ROLES_KEY,
        queryFn: () => rolesApi.getAllRoles(),
        enabled,
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

// ── Department Override (mục "Bảng điều khiển Permission theo Phòng ban") ──
export const useDepartmentOverrides = (roleId: number | undefined) => {
    const { data, isLoading, refetch } = useQuery({
        queryKey: DEPARTMENT_OVERRIDES_KEY(roleId ?? 0),
        queryFn: () => rolesApi.getDepartmentOverrides(roleId as number),
        enabled: !!roleId,
        staleTime: 30 * 1000,
    });

    return { overrides: (data as DepartmentOverride[]) ?? EMPTY_OVERRIDES, isLoading, refetch };
};

function useInvalidateDepartmentOverrides(roleId: number) {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: DEPARTMENT_OVERRIDES_KEY(roleId) });
        // Override vừa đổi có thể trùng phòng ban của CHÍNH người đang thao
        // tác (Admin cũng có thể thuộc 1 phòng ban) - invalidate cho chắc,
        // giống lý do ở useInvalidateRoles().
        queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_KEY });
    };
}

export const useUpdateDepartmentOverride = (roleId: number) => {
    const invalidate = useInvalidateDepartmentOverrides(roleId);
    return useMutation({
        mutationFn: ({
            departmentId,
            payload,
        }: {
            departmentId: number;
            payload: UpdateRolePermissionsPayload;
        }) => rolesApi.updateDepartmentOverride(roleId, departmentId, payload),
        onSuccess: invalidate,
    });
};

export const useDeleteDepartmentOverride = (roleId: number) => {
    const invalidate = useInvalidateDepartmentOverrides(roleId);
    return useMutation({
        mutationFn: (departmentId: number) => rolesApi.deleteDepartmentOverride(roleId, departmentId),
        onSuccess: invalidate,
    });
};

// ── Position Override (mục "Bảng điều khiển Permission theo Vị trí") ───────
// Mirror Y HỆT khối Department Override ở trên, chỉ đổi departmentId -> positionId.
export const usePositionOverrides = (roleId: number | undefined) => {
    const { data, isLoading, refetch } = useQuery({
        queryKey: POSITION_OVERRIDES_KEY(roleId ?? 0),
        queryFn: () => rolesApi.getPositionOverrides(roleId as number),
        enabled: !!roleId,
        staleTime: 30 * 1000,
    });

    return { overrides: (data as PositionOverride[]) ?? EMPTY_POSITION_OVERRIDES, isLoading, refetch };
};

function useInvalidatePositionOverrides(roleId: number) {
    const queryClient = useQueryClient();
    return () => {
        queryClient.invalidateQueries({ queryKey: POSITION_OVERRIDES_KEY(roleId) });
        // Override vừa đổi có thể trùng Vị trí của CHÍNH người đang thao tác -
        // invalidate cho chắc, giống lý do ở useInvalidateDepartmentOverrides().
        queryClient.invalidateQueries({ queryKey: MY_PERMISSIONS_KEY });
    };
}

export const useUpdatePositionOverride = (roleId: number) => {
    const invalidate = useInvalidatePositionOverrides(roleId);
    return useMutation({
        mutationFn: ({
            positionId,
            payload,
        }: {
            positionId: number;
            payload: UpdateRolePermissionsPayload;
        }) => rolesApi.updatePositionOverride(roleId, positionId, payload),
        onSuccess: invalidate,
    });
};

export const useDeletePositionOverride = (roleId: number) => {
    const invalidate = useInvalidatePositionOverrides(roleId);
    return useMutation({
        mutationFn: (positionId: number) => rolesApi.deletePositionOverride(roleId, positionId),
        onSuccess: invalidate,
    });
};