import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authStorage = request.cookies.get('auth-storage')?.value;
  
  let isAuthenticated = false;
  if (authStorage) {
    try {
      const parsed = JSON.parse(decodeURIComponent(authStorage));
      isAuthenticated = parsed.state?.isAuthenticated || false;
    } catch (e) {
      // Invalid JSON
    }
  }

  const { pathname } = request.nextUrl;

  // Public routes
  if (pathname.startsWith('/login')) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/customers', request.url));
    }
    return NextResponse.next();
  }

  // Protected routes
  if (!isAuthenticated && !pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
