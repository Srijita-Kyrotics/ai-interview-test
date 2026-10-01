import { redirect } from 'next/navigation';
import StudentAuth from '@/components/StudentAuth';
import { getCurrentStudent } from '@/lib/actions';

export const metadata = { title: 'Sign In or Create your profile' };

export default async function StudentOnboardingPage() {
  if (await getCurrentStudent()) redirect('/student/dashboard');

  return (
    <div className="container container-narrow">
      <StudentAuth />
    </div>
  );
}
