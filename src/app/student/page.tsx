import { redirect } from 'next/navigation';
import StudentProfileForm from '@/components/StudentProfileForm';
import { getCurrentStudent } from '@/lib/actions';

export const metadata = { title: 'Create your profile' };

export default async function StudentOnboardingPage() {
  if (await getCurrentStudent()) redirect('/student/dashboard');

  return (
    <div className="container container-narrow">
      <div className="card">
        <h1>Create your student profile</h1>
        <p className="lead-muted">
          Your skills drive job matching, so pick them from the standardized list.
        </p>
        <StudentProfileForm submitLabel="Create profile and continue" />
      </div>
    </div>
  );
}
