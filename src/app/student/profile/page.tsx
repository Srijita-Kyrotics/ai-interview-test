import Link from 'next/link';
import { redirect } from 'next/navigation';
import StudentProfileForm from '@/components/StudentProfileForm';
import { StartOverButton, SignOutStudentButton } from '@/components/SessionButtons';
import { getCurrentStudent } from '@/lib/actions';

export const metadata = { title: 'My profile' };

export default async function StudentProfilePage() {
  const student = await getCurrentStudent();
  if (!student) redirect('/student');

  return (
    <div className="container container-narrow">
      <div className="card">
        <div className="page-head">
          <div>
            <h1>My profile</h1>
            <p className="lead-muted">Update the details recruiters see when you apply.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <StartOverButton />
            <SignOutStudentButton />
          </div>
        </div>

        <StudentProfileForm
          studentId={student.id}
          initial={{
            name: student.name,
            email: student.email,
            github: student.github,
            linkedin: student.linkedin,
            skills: student.skills,
          }}
          submitLabel="Save changes"
        />

        <hr className="divider" />
        <Link href="/student/dashboard">Back to my applications</Link>
      </div>
    </div>
  );
}
