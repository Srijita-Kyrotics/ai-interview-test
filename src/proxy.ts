import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Cookie-presence gate for the portal routes. It is a first line of defence
 * only: every server action and route handler still re-checks ownership, so a
 * forged cookie cannot reach another user's data.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/student') && pathname !== '/student') {
    if (!request.cookies.get('rf_student')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  if (pathname.startsWith('/recruiter') && pathname !== '/recruiter') {
    if (!request.cookies.get('rf_recruiter')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  if (pathname.startsWith('/admin') && pathname !== '/admin') {
    if (!request.cookies.get('rf_admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/student/:path*', '/recruiter/:path*', '/admin/:path*'],
};
