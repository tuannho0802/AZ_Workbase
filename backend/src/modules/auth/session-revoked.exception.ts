import { HttpStatus, UnauthorizedException } from '@nestjs/common';

/**
 * 401 `SESSION_REVOKED` (PLAN P5): phiên (thiết bị) này đã bị đăng xuất/thu hồi. FE xử lý như mọi 401: thử refresh,
 * refresh thất bại -> đăng xuất im lặng. KHÔNG kéo theo thu hồi các phiên khác của người dùng.
 */
export class SessionRevokedException extends UnauthorizedException {
    constructor() {
        super({
            statusCode: HttpStatus.UNAUTHORIZED,
            code: 'SESSION_REVOKED',
            message: 'Phiên đăng nhập này đã bị đăng xuất. Vui lòng đăng nhập lại',
        });
    }
}