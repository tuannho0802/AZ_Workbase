import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED = 'allowWhenPasswordChangeRequired';

/**
 * P6: đánh dấu endpoint VẪN được gọi khi tài khoản đang bị buộc/hết hạn đổi mật khẩu.
 * Mặc định mọi endpoint có đăng nhập đều bị chặn (403 PASSWORD_CHANGE_REQUIRED). Chỉ gắn cho:
 * change-password-required, PATCH users/me/password, logout, GET users/me (refresh không cần JWT nên vốn không bị chặn).
 */
export const AllowWhenPasswordChangeRequired = () => SetMetadata(ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED, true);
