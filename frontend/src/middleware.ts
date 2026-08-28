import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CRITICAL: Skip login page
  if (pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  // CRITICAL: Đọc cookie
  const authCookie = request.cookies.get('auth-storage')?.value;

  if (!authCookie) {
    console.log('[MIDDLEWARE] No auth cookie, redirect to /login');
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(authCookie));
    
    // CRITICAL: Check nested state.state (Zustand persist structure)
    const isAuthenticated = parsed?.state?.isAuthenticated;
    
    console.log('[MIDDLEWARE] Cookie exists:', !!authCookie);
    console.log('[MIDDLEWARE] Parsed state:', parsed?.state);
    console.log('[MIDDLEWARE] Is authenticated:', isAuthenticated);

    if (!isAuthenticated) {
      console.log('[MIDDLEWARE] Not authenticated, redirect to /login');
      return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
  } catch (e) {
    console.error('[MIDDLEWARE] Parse cookie failed:', e);
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
  matcher: ['/((?!login|register|account-status|api|_next/static|_next/image|favicon.ico|robots.txt).*)'],
};