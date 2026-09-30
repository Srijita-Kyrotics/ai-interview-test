'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SiteHeader({ isStudent, isRecruiter }: { isStudent: boolean; isRecruiter: boolean }) {
  const pathname = usePathname();
  
  if (pathname === '/') return null;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)' }}>
            S
          </span>
          RecruitFlow
        </Link>
        <nav className="site-nav" aria-label="Main">
          {isStudent && (
             <Link href="/student/dashboard" className="nav-link" aria-current={pathname.startsWith('/student') ? 'page' : undefined}>Student Dashboard</Link>
          )}
          {isRecruiter && (
             <Link href="/recruiter" className="nav-link" aria-current={pathname.startsWith('/recruiter') ? 'page' : undefined}>Employer Dashboard</Link>
          )}
          {!isStudent && !isRecruiter && (
            <>
              <Link href="/student" className="nav-link">For Students</Link>
              <Link href="/recruiter" className="nav-link">For Employers</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
