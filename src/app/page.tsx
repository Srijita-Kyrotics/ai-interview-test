import Link from 'next/link';
import { getCurrentStudent, getCurrentRecruiter } from '@/lib/actions';
import { redirect } from 'next/navigation';

export default async function Home() {
  // If already logged in, we can optionally redirect them or just let them go to their portal.
  const student = await getCurrentStudent();
  const recruiter = await getCurrentRecruiter();
  
  if (student) {
    redirect('/student/dashboard');
  } else if (recruiter) {
    redirect('/recruiter');
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      
      {/* Background ambient shapes */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)', borderRadius: '50%', zIndex: 0, filter: 'blur(60px)', animation: 'pulse 10s infinite alternate' }} />
      <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, var(--success-soft) 0%, transparent 70%)', borderRadius: '50%', zIndex: 0, filter: 'blur(80px)' }} />

      <header style={{ position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 3rem', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', display: 'grid', placeItems: 'center', color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }}>
            S
          </div>
          <span style={{ fontWeight: '700', fontSize: '1.25rem', letterSpacing: '-0.03em', color: 'var(--text)' }}>RecruitFlow</span>
        </div>
        <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <Link href="/student" style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>For Students</Link>
          <Link href="/recruiter" style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>For Employers</Link>
        </nav>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative', zIndex: 10, padding: '4rem 2rem', textAlign: 'center' }}>
        
        <span style={{ display: 'inline-block', padding: '0.4rem 1rem', background: 'var(--surface-hover)', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-hover)', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
          🚀 The future of AI-proctored hiring
        </span>
        
        <h1 style={{ fontSize: '3.5rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, maxWidth: '800px', marginBottom: '1.5rem', color: 'var(--text)' }}>
          Hire the best talent with <br/><span style={{ color: 'var(--accent)' }}>AI-driven assessments</span>.
        </h1>
        
        <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto 4rem', lineHeight: 1.6 }}>
          A fully integrated campus hiring platform. Live proctored interviews, AI voice agents, and seamless pipeline management in one unified workspace.
        </p>

        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '900px', width: '100%' }}>
          {/* Student Portal Card */}
          <div style={{ flex: '1 1 350px', background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', textAlign: 'left', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: 'var(--shadow-sm)' }} className="portal-card">
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', marginBottom: '1.5rem' }}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 700 }}>Student Portal</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>
              Create your profile, match with top jobs, and take live, AI-proctored interviews in a seamless environment.
            </p>
            <Link href="/student" className="btn-primary" style={{ width: '100%', padding: '0.8rem', fontSize: '1rem', borderRadius: '12px' }}>
              Student Login
            </Link>
          </div>

          {/* Recruiter Portal Card */}
          <div style={{ flex: '1 1 350px', background: 'rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid var(--border)', borderRadius: '24px', padding: '3rem 2rem', textAlign: 'left', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: 'var(--shadow-sm)' }} className="portal-card">
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--success-soft)', display: 'grid', placeItems: 'center', marginBottom: '1.5rem' }}>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem', fontWeight: 700 }}>Employer Portal</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>
              Manage candidates, set up custom AI question banks, and make data-driven hiring decisions effortlessly.
            </p>
            <Link href="/recruiter" className="btn-primary" style={{ width: '100%', padding: '0.8rem', fontSize: '1rem', borderRadius: '12px', background: '#111827' }}>
              Recruiter Login
            </Link>
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .portal-card:hover {
          transform: translateY(-5px);
          box-shadow: var(--shadow-lg);
          border-color: var(--border-strong);
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.1); opacity: 1; }
        }
      `}} />
    </main>
  );
}

