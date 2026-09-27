import Link from "next/link";

export default function Home() {
  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: '10vh' }}>
      <h1 style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>RecruitFlow</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '3rem' }}>
        A seamless connection between talent and opportunity.
      </p>
      
      <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/student" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="glass-card" style={{ width: '300px', cursor: 'pointer' }}>
            <h2 style={{ color: 'var(--accent)' }}>For Students</h2>
            <p style={{ color: 'var(--text-muted)' }}>Build your profile, showcase skills, and track your applications in real-time.</p>
          </div>
        </Link>

        <Link href="/recruiter" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="glass-card" style={{ width: '300px', cursor: 'pointer' }}>
            <h2 style={{ color: '#ec4899' }}>For Recruiters</h2>
            <p style={{ color: 'var(--text-muted)' }}>Post opportunities, discover top talent, and manage your hiring pipeline effortlessly.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
