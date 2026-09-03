import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * ⚠️ ĐỔI TÊN từ middleware.ts -> proxy.ts (Next.js 16 đổi tên convention -
 * "middleware" dễ gây hiểu lầm là middleware kiểu Express, thực ra chỉ chạy
 * ở edge trước khi route render). API giữ nguyên 100% (NextRequest/
 * NextResponse/config.matcher không đổi) - chỉ đổi tên file + tên hàm export.
 * Xem: https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * ⚠️ FIX BUG THẬT (phát hiện qua log Vercel): trước đây chỉ dựa vào
 * `matcher` (danh sách path cố định) để loại trừ các trang không cần đăng
 * nhập - nhưng Vercel BotID (bật qua `withBotId()` ở next.config.js, bảo vệ
 * /api/auth/register khỏi bot đăng ký spam) tự chèn 1 thẻ <script> tải từ
 * đường dẫn UUID NGẪU NHIÊN ở gốc domain (đổi mỗi lần build, không thể liệt
 * kê cứng vào matcher) - việc này CỐ Ý, để script chống bot trông giống
 * request nội bộ, tránh bị ad-blocker chặn nhầm là script bên thứ 3.
 *
 * Vì path ngẫu nhiên không khớp bất kỳ mục nào trong matcher, request tải
 * script đó vẫn lọt vào code check-auth bên dưới, bị coi là "chưa đăng
 * nhập" (đúng - đây là request tải script, không có cookie), rồi bị
 * redirect 307 sang /login (trả về HTML thay vì nội dung script JS thật) -
 * khiến BotID không khởi tạo được.
 *
 * Sửa triệt để: dùng header chuẩn `Sec-Fetch-Dest` (trình duyệt tự gắn,
 * KHÔNG thể giả mạo bằng JS - "forbidden header") để phân biệt điều hướng
 * trang THẬT (giá trị 'document') với mọi request con khác (script/style/
 * font/ảnh/fetch...). Chỉ áp auth-check cho 'document' - bỏ qua tất cả
 * request con bất kể path là gì, không cần đoán/liệt kê path nữa.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Request con (script/style/font/ảnh/fetch/XHR...) - KHÔNG phải điều
  // hướng trang thật -> bỏ qua hoàn toàn, không áp auth-check. Đây là chỗ
  // sửa chính: trước đây các request này (đặc biệt script BotID ở path
  // ngẫu nhiên) vẫn bị check auth như 1 trang thật.
  const fetchDest = request.headers.get('sec-fetch-dest');
  if (fetchDest && fetchDest !== 'document') {
    return NextResponse.next();
  }

  // CRITICAL: Skip login page
  if (pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // CRITICAL: Đọc cookie
  const authCookie = request.cookies.get('auth-storage')?.value;

  if (!authCookie) {
    console.log('[PROXY] No auth cookie, redirect to /login');
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(authCookie));

    // CRITICAL: Check nested state.state (Zustand persist structure)
    const isAuthenticated = parsed?.state?.isAuthenticated;

    console.log('[PROXY] Cookie exists:', !!authCookie);
    console.log('[PROXY] Parsed state:', parsed?.state);
    console.log('[PROXY] Is authenticated:', isAuthenticated);

    if (!isAuthenticated) {
      console.log('[PROXY] Not authenticated, redirect to /login');
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
  } catch (e) {
    console.error('[PROXY] Parse cookie failed:', e);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  // ⚠️ register và account-status PHẢI ở đây, giống login: cả 2 trang này
  // đều cần truy cập được khi CHƯA đăng nhập (đăng ký tài khoản mới; xem
  // trạng thái tài khoản sau khi login thất bại vì đang chờ duyệt/bị từ
  // chối/bị khoá - xem login/page.tsx dòng router.push('/account-status?...')).
  // Thiếu 2 route này khiến middleware redirect chúng về /login ngay lập
  // tức, y hệt lỗi 307 khi bấm "Đăng ký ngay" mà không cần đăng nhập trước.
  //
  // Matcher này vẫn giữ lại (không xoá) dù bản sửa Sec-Fetch-Dest ở trên đã
  // xử lý đúng mọi request con - matcher là lớp lọc THÔ ở tầng routing của
  // Next.js (chạy trước khi vào code), giúp bỏ qua hẳn _next/static, ảnh...
  // mà không tốn 1 lượt gọi proxy() nào - vẫn nên giữ để tối ưu, không phải
  // để "sửa lỗi path ngẫu nhiên" (việc đó giờ do Sec-Fetch-Dest đảm nhiệm).
  matcher: ['/((?!login|register|account-status|api|_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
