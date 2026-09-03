import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ⚠️ BỔ SUNG BẮT BUỘC cho fix ở `frontend/src/app/api/auth/register/route.ts`
 * (2026-09-03) - THIẾU FILE NÀY THÌ FIX Ở FRONTEND KHÔNG CÓ TÁC DỤNG GÌ.
 *
 * Bối cảnh: FE và BE là 2 Vercel project TÁCH RIÊNG. Route trung gian ở FE
 * (BotID) gọi sang BE qua `fetch()` - đây là 1 kết nối MỚI, không phải
 * "forward nguyên request" - nên IP trình duyệt gốc chỉ còn cách duy nhất để
 * BE biết được là FE tự đọc rồi nhét vào 1 header rồi gửi kèm.
 *
 * Vercel's edge, ở BẤT KỲ project nào (kể cả BE), LUÔN tự tính lại header
 * `X-Forwarded-For` dựa theo IP TCP thật của kết nối đang tới - và GHI ĐÈ
 * mọi giá trị client tự gắn vào header này (chống giả mạo IP, xem tài liệu
 * Vercel). Kết nối tới BE ở đây là từ chính hàm serverless của FE (không
 * phải trình duyệt), nên `X-Forwarded-For` mà BE thấy luôn là địa chỉ hạ
 * tầng nội bộ của FE - GIỐNG NHAU cho mọi người dùng đi qua route BotID -
 * khiến `ThrottlerGuard` mặc định (dùng `req.ip`, vốn đọc từ chính header
 * này qua `trust proxy` ở main.ts) coi MỌI người dùng là chung 1 IP. Đây là
 * nguyên nhân thật của bug "đổi IP/dùng WARP vẫn dính 429".
 *
 * FE đã đổi sang forward qua header TÊN RIÊNG `x-az-client-ip` (Vercel
 * không có logic đặc biệt nào với header tự đặt tên, chỉ ghi đè đúng họ
 * header proxy chuẩn: x-forwarded-for, x-real-ip, forwarded) - guard này
 * đọc đúng header đó thay cho `req.ip`.
 *
 * Fallback về `req.ip` khi header vắng mặt (vd ai đó gọi thẳng
 * `POST /auth/register` vào domain BE, bỏ qua route BotID ở FE - trường hợp
 * đã được lường trước, xem comment trong route.ts) - lúc đó `req.ip` vẫn là
 * IP thật của người gọi (không qua thêm hop Vercel nào nữa), rate-limit vẫn
 * đúng, chỉ là không đi qua được lớp BotID.
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
    protected async getTracker(req: Record<string, any>): Promise<string> {
        const forwarded = req.headers['x-az-client-ip'];
        if (typeof forwarded === 'string' && forwarded.trim()) {
            return forwarded.trim();
        }
        return req.ip;
    }
}