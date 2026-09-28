import Link from 'next/link';

const ROLES = [
  {
    href: '/student',
    title: 'I am a student',
    body: 'Build a profile with standardized skills, apply to roles that match you, and follow every screening round in one place.',
    cta: 'Create your profile',
  },
  {
    href: '/recruiter',
    title: 'I am a recruiter',
    body: 'Post jobs and internships, see exactly how each applicant matches your requirements, and move candidates through the pipeline.',
    cta: 'Open recruiter dashboard',
  },
];

const FEATURES = [
  {
    title: 'Standardized skills',
    body: 'One canonical skill list, so matching never fails on spelling.',
  },
  {
    title: 'Visible skill match',
    body: 'See exactly which required skills a candidate has and which are missing.',
  },
  {
    title: 'Structured pipeline',
    body: 'Screening, Communication, Aptitude, two technical rounds and HR.',
  },
  {
    title: 'Shared state',
    body: 'One student, one job, one application — connected end to end.',
  },
];

export default function Home() {
  return (
    <main className="container">
      <section className="hero">
        <span className="hero-eyebrow">Student &amp; recruiter platform</span>
        <h1>Where talent meets opportunity</h1>
        <p className="hero-sub">
          RecruitFlow matches students to jobs and internships on standardized skills, then
          runs every application through a transparent hiring pipeline.
        </p>

        <div className="role-grid">
          {ROLES.map(role => (
            <Link key={role.href} href={role.href} className="role-card">
              <h2>{role.title}</h2>
              <p>{role.body}</p>
              <span className="role-card-cta">{role.cta} &rarr;</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="feature-grid">
        {FEATURES.map(feature => (
          <div key={feature.title} className="feature">
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
