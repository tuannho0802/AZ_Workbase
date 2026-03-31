import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authStorage = request.cookies.get('auth-storage')?.value;
  const { pathname } = request.nextUrl;

  console.log(`[Middleware] Path: ${pathname}, Has Cookie: ${!!authStorage}`);
  
  let isAuthenticated = false;
  if (authStorage) {
    try {
      const decoded = decodeURIComponent(authStorage);
      const parsed = JSON.parse(decoded);
      isAuthenticated = parsed.state?.isAuthenticated || false;
      console.log(`[Middleware] Auth Status: ${isAuthenticated}`);
    } catch (e) {
      console.error('[Middleware] Error parsing cookie:', e);
    }
  }

  // Redirect Guard: Don't redirect if we are already at the target
  if (pathname.startsWith('/login')) {
    if (isAuthenticated) {
      console.log('[Middleware] Authenticated user on login page -> Redirecting to /customers');
      return NextResponse.redirect(new URL('/customers', request.url));
    }
    return NextResponse.next();
  }

  // Protected routes: Redirect to login if not authenticated
  // Exclude assets and api routes (already handled by matcher but safe to double check)
  if (!isAuthenticated && !pathname.startsWith('/_next') && !pathname.startsWith('/api') && pathname !== '/favicon.ico') {
    console.log(`[Middleware] Unauthenticated access to ${pathname} -> Redirecting to /login`);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
