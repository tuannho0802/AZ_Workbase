import { NextRequest, NextResponse } from 'next/server';
import { checkBotId } from 'botid/server';

// Backend NestJS thật (deploy Vercel riêng - xem `backend/vercel.json`).
// Dùng lại đúng biến `NEXT_PUBLIC_API_URL` cho nhất quán với
// `axios-instance.ts` (client vẫn dùng biến này để gọi các API khác không
// cần BotID) - biến `NEXT_PUBLIC_*` vẫn đọc được ở server (route handler),
// không chỉ ở client.
const BACKEND_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ⚠️ BẮT BUỘC đi kèm 1 Custom Rule ở Vercel Firewall (project BACKEND):
// path = /api/auth/register AND header "x-az-internal-secret" = đúng giá
// trị này -> action "bypass". Nếu thiếu rule đó, header này vô nghĩa (BE
// vẫn bị "Bot Protection: Challenge" chặn y hệt cũ) - xem hướng dẫn tạo rule
// qua `vercel firewall rules add` (không cần vào Dashboard) kèm theo PR này.
//
// Vì sao cần thêm lớp này: request từ route trung gian này (server gọi
// server, không phải trình duyệt thật) bị Vercel Firewall - Bot Protection
// (setting "Challenge requests from non-browser sources", tầng edge, ĐỘC
// LẬP với code NestJS) tự động Challenge - 1 serverless function không chạy
// được JS challenge nên request luôn thất bại ở đây, bất kể BotID/honeypot/
// rate-limit ở tầng ứng dụng có đúng hay không. KHÔNG tắt hẳn Bot Protection
// (giữ nguyên bảo vệ cho các request khác) - chỉ mở đúng 1 khe hẹp cho CHÍNH
// route này bằng 1 secret chỉ 2 phía (route.ts + Firewall Rule) biết.
//
// Biến môi trường server-only (KHÔNG thêm tiền tố NEXT_PUBLIC_) - không lộ
// ra bundle client. Thiếu biến này -> không gắn header -> request vẫn bị
// Challenge như trước khi có rule (an toàn theo hướng "fail closed").
const INTERNAL_BYPASS_SECRET = process.env.FIREWALL_BYPASS_SECRET;

/**
 * Route nội bộ (chạy trên chính domain Next.js/Vercel của Frontend) đứng
 * giữa form đăng ký và backend NestJS thật - đây là lớp thay thế Cloudflare
 * Turnstile cũ bằng Vercel BotID.
 *
 * Vì sao cần route trung gian này thay vì gọi `checkBotId()` thẳng trong
 * `AuthService.register()` ở backend: `checkBotId()` CHỈ chạy được bên
 * trong ngữ cảnh server của chính app Next.js đã được `withBotId()` bọc
 * (đọc header challenge do `<BotIdClient>` gắn vào request cùng domain) -
 * không gọi được từ 1 backend NestJS tách riêng (xem `backend/vercel.json`,
 * đây là 1 Vercel project khác). Nên kiến trúc bắt buộc phải là:
 *
 *   Browser -> (route này, có BotID) -> backend NestJS thật (/auth/register)
 *
 * ⚠️ Vì backend NestJS có domain public riêng, vẫn có thể bị gọi thẳng bỏ
 * qua route này (BotID không tự bảo vệ được nếu ai đó bỏ qua Frontend) -
 * rate-limit theo IP + honeypot ở backend (`AuthService.register()`,
 * `auth.controller.ts`) vẫn giữ nguyên, không phụ thuộc vào route này, để
 * bù cho trường hợp đó.
 */
export async function POST(request: NextRequest) {
    const verification = await checkBotId();

    if (verification.isBot) {
        // Trả lỗi giống hệt dạng lỗi validate thường (400) - không cần phân
        // biệt rõ "bị BotID chặn" với người dùng thật, tránh lộ thông tin cho
        // bot biết chính xác lý do bị chặn để né tránh.
        return NextResponse.json(
            { message: 'Xác minh chống bot thất bại. Vui lòng tải lại trang và thử đăng ký lại.' },
            { status: 400 },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 });
    }

    // ⚠️ FIX BUG THẬT (2026-09-03): trước đây forward qua header CHUẨN
    // `x-forwarded-for` - nhưng tài liệu Vercel xác nhận: "If you are trying
    // to use Vercel behind a proxy, we currently overwrite the
    // X-Forwarded-For header and do not forward external IPs" (chống IP
    // spoofing, không có ngoại lệ trừ gói Enterprise). Route này gọi TỪ 1
    // project Vercel (Frontend) SANG project Vercel khác (Backend) - đúng
    // kịch bản "Vercel đứng sau proxy" - nên giá trị ta tự gắn vào
    // `x-forwarded-for` bị Vercel ÂM THẦM GHI ĐÈ trước khi backend nhận
    // được, khiến rate-limit theo IP ở backend mất tác dụng (mọi người dùng
    // qua route này bị tính chung 1 "IP" - dẫn tới lỗi thật: đổi IP/dùng VPN
    // vẫn dính 429 vì IP thật chưa từng tới được backend).
    //
    // Đổi sang header TÊN RIÊNG (không phải tên chuẩn) - Vercel chỉ can
    // thiệp các header thuộc họ x-forwarded-*/x-real-ip, không đụng tới
    // header tự đặt tên. Backend đọc đúng header này qua
    // `ThrottlerBehindProxyGuard` (xem throttler-behind-proxy.guard.ts).
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor?.split(',')[0]?.trim();

    let backendRes: Response;
    try {
        backendRes = await fetch(`${BACKEND_API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(clientIp ? { 'x-az-client-ip': clientIp } : {}),
                // Xem giải thích đầy đủ ở khai báo INTERNAL_BYPASS_SECRET phía
                // trên - khớp đúng Custom Rule Firewall ở project backend.
                ...(INTERNAL_BYPASS_SECRET
                    ? { 'x-az-internal-secret': INTERNAL_BYPASS_SECRET }
                    : {}),
            },
            body: JSON.stringify(body),
        });
    } catch (error) {
        console.error('[api/auth/register] Lỗi khi gọi backend:', error);
        return NextResponse.json(
            { message: 'Không thể kết nối máy chủ, vui lòng thử lại sau.' },
            { status: 502 },
        );
    }

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
}