import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import SiteHeader from '@/components/SiteHeader';
import './globals.css';
import { getCurrentStudent, getCurrentRecruiter } from '@/lib/actions';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: 'RecruitFlow | Campus Hiring Platform',
    template: '%s | RecruitFlow',
  },
  description:
    'Live proctored AI interviews and seamless candidate pipeline management.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const student = await getCurrentStudent();
  const recruiter = await getCurrentRecruiter();

  return (
    <html lang="en" className={inter.variable}>
      <body>
        <SiteHeader isStudent={!!student} isRecruiter={!!recruiter} />
        {children}
      </body>
    </html>
  );
}
