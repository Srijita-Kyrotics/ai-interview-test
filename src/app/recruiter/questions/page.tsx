import Link from 'next/link';
import { redirect } from 'next/navigation';
import RecruiterQuestionBank from '@/components/RecruiterQuestionBank';
import { getCurrentRecruiter } from '@/lib/actions';
import { listRecruiterQuestions } from '@/lib/custom-actions';

export const metadata = { title: 'Question bank' };

export default async function RecruiterQuestionsPage() {
  const recruiter = await getCurrentRecruiter();
  if (!recruiter) redirect('/recruiter');

  const questions = await listRecruiterQuestions();

  return (
    <div className="container container-narrow">
      <Link href="/recruiter" className="back-link">
        &larr; Back to dashboard
      </Link>

      <div className="page-head">
        <div>
          <h1>Question bank</h1>
          <p className="lead-muted">
            Write reusable questions once, then attach them to the screening round of any role.
          </p>
        </div>
      </div>

      <RecruiterQuestionBank
        questions={questions.map(q => ({
          id: q.id,
          prompt: q.prompt,
          hint: q.hint,
          maxScore: q.maxScore,
        }))}
      />
    </div>
  );
}
