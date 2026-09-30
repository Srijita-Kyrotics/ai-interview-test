import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isStudentRoute = pathname.startsWith('/student');
  const isRecruiterRoute = pathname.startsWith('/recruiter');
  const isAdminRoute = pathname.startsWith('/admin');

  if (pathname.startsWith('/student') && pathname !== '/student') {
    const studentCookie = request.cookies.get('rf_student');
    if (!studentCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  if (pathname.startsWith('/recruiter') && pathname !== '/recruiter') {
    const recruiterCookie = request.cookies.get('rf_recruiter');
    if (!recruiterCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  if (pathname.startsWith('/admin') && pathname !== '/admin') {
    const adminCookie = request.cookies.get('rf_admin');
    if (!adminCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/student/:path*', '/recruiter/:path*', '/admin/:path*'],
};
