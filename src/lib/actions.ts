'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import * as repo from '@/lib/db/repo';
import {
  DEFAULT_STAGE,
  PIPELINE_STAGES,
  STANDARD_SKILLS,
  calculateSkillMatch,
  isApplicationStage,
  rankSkillSuggestions,
} from './types';
import type { Application, Job, OpportunityType, Recruiter, Skill, Student } from './types';

const STUDENT_COOKIE = 'rf_student';
const RECRUITER_COOKIE = 'rf_recruiter';

/* -------------------------------------------------------------------------- */
/*                              Skill suggestions                             */
/* -------------------------------------------------------------------------- */

export async function getSkillSuggestions(query: string) {
  return rankSkillSuggestions(STANDARD_SKILLS, query);
}

/* -------------------------------------------------------------------------- */
/*                                   Session                                  */
/* -------------------------------------------------------------------------- */

export async function getCurrentStudent(): Promise<Student | null> {
  const id = (await cookies()).get(STUDENT_COOKIE)?.value;
  if (!id) return null;
  return repo.findStudentById(id);
}

export async function startStudentSession(studentId: string) {
  (await cookies()).set(STUDENT_COOKIE, studentId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

export async function endStudentSession() {
  (await cookies()).delete(STUDENT_COOKIE);
}

export async function getCurrentRecruiter(): Promise<Recruiter | null> {
  const id = (await cookies()).get(RECRUITER_COOKIE)?.value;
  if (!id) return null;
  return repo.findRecruiterById(id);
}

export async function signInRecruiter(name: string, company: string) {
  const trimmedName = name.trim();
  const trimmedCompany = company.trim();
  // Reuse an existing recruiter with the same details so signing in again
  // returns you to your own roles instead of creating an empty duplicate.
  const recruiter =
    repo.findRecruiterByName(trimmedName, trimmedCompany) ??
    repo.insertRecruiter(trimmedName, trimmedCompany);

  (await cookies()).set(RECRUITER_COOKIE, recruiter.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return recruiter;
}

export async function endRecruiterSession() {
  (await cookies()).delete(RECRUITER_COOKIE);
}

/* -------------------------------------------------------------------------- */
/*                                  Students                                  */
/* -------------------------------------------------------------------------- */

export async function createStudent(data: {
  name: string;
  skills: Skill[];
  github: string;
  linkedin: string;
}) {
  const student = repo.insertStudent(data);
  await startStudentSession(student.id);
  return student;
}

export async function updateStudent(
  id: string,
  data: { name: string; skills: Skill[]; github: string; linkedin: string },
) {
  const student = repo.updateStudentRow(id, data);
  revalidatePath('/student/dashboard');
  revalidatePath('/student/profile');
  return student;
}

export async function getStudent(id: string) {
  return repo.findStudentById(id);
}

/* -------------------------------------------------------------------------- */
/*                              Jobs / internships                            */
/* -------------------------------------------------------------------------- */

export async function createJob(data: {
  type: OpportunityType;
  title: string;
  description: string;
  skillsRequired: Skill[];
  eligibility: string;
  recruiterId: string;
}) {
  const job = repo.insertJob(data);
  revalidatePath('/student/jobs');
  revalidatePath('/recruiter');
  return job;
}

export async function getOpenJobs(): Promise<Job[]> {
  return repo.listOpenJobs();
}

export async function getJobsByRecruiter(recruiterId: string): Promise<Job[]> {
  return repo.listJobsByRecruiter(recruiterId);
}

export async function getJob(id: string): Promise<Job | null> {
  return repo.findJobById(id);
}

/* -------------------------------------------------------------------------- */
/*                                Applications                                */
/* -------------------------------------------------------------------------- */

/**
 * Applies the signed-in student to a job. The student is resolved from the
 * session cookie rather than the request body so a client cannot submit an
 * application on behalf of another student.
 */
export async function applyForJob(jobId: string): Promise<Application> {
  const student = await getCurrentStudent();
  if (!student) throw new Error('You need a student profile before applying.');

  const job = repo.findJobById(jobId);
  if (!job) throw new Error('This opportunity is no longer available.');

  const match = calculateSkillMatch(job.skillsRequired, student.skills);
  const application = repo.insertApplication({
    studentId: student.id,
    jobId,
    stage: DEFAULT_STAGE,
    matchScore: match.score,
    matchedSkills: match.matched,
  });

  revalidatePath('/student/dashboard');
  revalidatePath(`/recruiter/jobs/${jobId}`);
  return application;
}

export async function getStudentApplications(studentId: string) {
  return repo.listApplicationsByStudent(studentId);
}

export async function getJobApplications(jobId: string) {
  return repo.listApplicationsByJob(jobId);
}

export async function getApplication(id: string) {
  return repo.findApplicationById(id);
}

export async function updateApplicationStage(
  applicationId: string,
  newStage: string,
): Promise<Application> {
  if (!isApplicationStage(newStage)) throw new Error(`Unknown stage: ${newStage}`);
  const application = repo.setApplicationStage(applicationId, newStage);
  revalidatePath('/student/dashboard');
  revalidatePath(`/recruiter/jobs/${application.jobId}`);
  revalidatePath(`/recruiter/candidates/${applicationId}`);
  return application;
}

/** Moves a candidate one step along the pipeline, or into a final stage. */
export async function advanceApplicationStage(
  applicationId: string,
  target: 'next' | 'reject' = 'next',
) {
  const application = repo.findApplicationById(applicationId);
  if (!application) throw new Error('Application not found');
  if (target === 'reject') return updateApplicationStage(applicationId, 'Rejected');

  const index = PIPELINE_STAGES.indexOf(application.stage);
  const next = PIPELINE_STAGES[index + 1] ?? 'Selected';
  return updateApplicationStage(applicationId, next);
}
