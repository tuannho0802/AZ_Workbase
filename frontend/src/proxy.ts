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

  // ⚠️ FIX BUG THẬT (2026-09-25) - xem giải thích đầy đủ trong
  // `lib/stores/auth.store.ts`: trước đây route này parse NGUYÊN CỤC state
  // (token + user + avatarUrl dài) từ cookie `auth-storage` - đúng cái
  // cookie dễ vượt trần ~4KB khiến trình duyệt âm thầm không ghi được giá
  // trị mới, làm cookie "đóng băng" ở token cũ/đã revoke -> user đăng nhập
  // lâu ở 1 profile bị kẹt vô thời hạn cho tới khi xoá tay cookie này. Giờ
  // chỉ cần kiểm tra 1 cờ nhỏ `azw-session` (không chứa token/user, không
  // bao giờ phình to) - state thật nằm ở `localStorage` (client tự đọc,
  // không qua middleware này).
  const sessionCookie = request.cookies.get('azw-session')?.value;

  if (sessionCookie === '1') {
    return NextResponse.next();
  }

  // Fallback tương thích ngược: ngay sau lần deploy fix này, trình duyệt
  // của user đang đăng nhập từ TRƯỚC có thể còn cookie `auth-storage` cũ mà
  // CHƯA kịp chạy JS phía client để migrate sang cookie `azw-session` mới
  // (vd họ F5 trang trước khi bất kỳ tab nào của họ mount lại app). Đọc tạm
  // cookie cũ y như logic trước đây để không văng họ ra ngoài oan uổng -
  // fallback này có thể xoá sau khi chắc chắn mọi session cũ đã hết hạn
  // (7 ngày kể từ ngày deploy fix).
  const legacyCookie = request.cookies.get('auth-storage')?.value;
  if (!legacyCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(legacyCookie));
    const isAuthenticated = parsed?.state?.isAuthenticated;

    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
  } catch (e) {
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
