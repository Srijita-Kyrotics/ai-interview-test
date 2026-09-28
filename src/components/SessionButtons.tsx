'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { endRecruiterSession, endStudentSession } from '@/lib/actions';

export function SignOutRecruiterButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await endRecruiterSession();
          router.refresh();
        })
      }
    >
      Sign out
    </button>
  );
}

export function StartOverButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await endStudentSession();
          router.push('/student');
          router.refresh();
        })
      }
    >
      Switch student
    </button>
  );
}
