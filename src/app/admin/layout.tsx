import { redirect } from 'next/navigation';
import { getCurrentAdmin, startAdminSession } from '@/lib/actions';
import Link from 'next/link';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();

  if (!admin) {
    return (
      <div style={{ padding: '2rem', maxWidth: '400px', margin: '4rem auto' }}>
        <h2>Admin Login</h2>
        <form action={async (formData) => {
          'use server';
          try {
            await startAdminSession(
              String(formData.get('email') ?? ''),
              String(formData.get('password') ?? ''),
            );
          } catch (error) {
            redirect(`/admin?error=${encodeURIComponent(error instanceof Error ? error.message : 'Sign in failed.')}`);
          }
          redirect('/admin/questions');
        }}>
          <input name="email" type="email" placeholder="admin@recruitflow.com" required autoComplete="username" style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem' }} />
          <input name="password" type="password" placeholder="Password" required autoComplete="current-password" style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem' }} />
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.8rem' }}>Sign In</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-elevated)' }}>
      {/* Admin Sidebar */}
      <aside style={{ width: '250px', borderRight: '1px solid var(--border)', padding: '2rem 1rem' }}>
        <h3 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1.5rem', fontWeight: 700 }}>Admin Panel</h3>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link href="/admin/questions" style={{ padding: '0.75rem 1rem', borderRadius: '8px', background: 'var(--surface-hover)', color: 'var(--text)', fontWeight: 500 }}>
            Question Bank
          </Link>
          <Link href="/admin/pipelines" style={{ padding: '0.75rem 1rem', borderRadius: '8px', color: 'var(--text-muted)', fontWeight: 500 }}>
            Pipelines
          </Link>
        </nav>
      </aside>
      {/* Main Content */}
      <main style={{ flex: 1, padding: '3rem' }}>
        {children}
      </main>
    </div>
  );
}
