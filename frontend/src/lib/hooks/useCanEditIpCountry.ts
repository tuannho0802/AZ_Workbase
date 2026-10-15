import { useMyPermissions } from './useMyPermissions';
import { useAuthStore } from '../stores/auth.store';

/**
 * Sửa tay quốc gia của IP: BE yêu cầu `users.manage` phạm vi `all` (hoặc role `admin`). FE ẩn nút trước để không lộ UI
 * rồi báo 403 (BE vẫn là nơi chặn thật).
 */
export function useCanEditIpCountry(): boolean {
    const { can, scope } = useMyPermissions();
    const role = useAuthStore((s) => s.user?.role);
    if (role === 'admin') return true;
    return can('users.manage') && scope('users.manage') === 'all';
}
