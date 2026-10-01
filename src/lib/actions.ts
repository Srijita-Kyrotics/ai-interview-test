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

const ADMIN_COOKIE = 'rf_admin';

export async function getCurrentAdmin() {
  const id = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!id) return null;
  return repo.findAdminById(id);
}

export async function startAdminSession(email: string) {
  const admin = repo.insertAdmin(email);
  (await cookies()).set(ADMIN_COOKIE, admin.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return admin;
}

export async function endAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

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
  const recruiter = repo.findRecruiterByName(trimmedName, trimmedCompany);
  
  if (!recruiter) {
    throw new Error('Recruiter not found. Please create a profile.');
  }

  (await cookies()).set(RECRUITER_COOKIE, recruiter.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return recruiter;
}

export async function signUpRecruiter(name: string, company: string) {
  const trimmedName = name.trim();
  const trimmedCompany = company.trim();
  const existing = repo.findRecruiterByName(trimmedName, trimmedCompany);
  
  if (existing) {
    throw new Error('Recruiter already exists. Please sign in.');
  }
  
  const recruiter = repo.insertRecruiter(trimmedName, trimmedCompany);

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

export async function signInStudent(name: string, password?: string) {
  const student = repo.findStudentByName(name.trim());
  if (!student) {
    throw new Error('Student not found. Please create a profile.');
  }
  if (student.password && student.password !== password) {
    throw new Error('Incorrect password.');
  }
  await startStudentSession(student.id);
  return student;
}

export async function createStudent(data: {
  name: string;
  password?: string;
  skills: Skill[];
  github: string;
  linkedin: string;
}) {
  const existing = repo.findStudentByName(data.name.trim());
  if (existing) {
    throw new Error('Student already exists. Please sign in.');
  }
  
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
  const recruiter = await getCurrentRecruiter();
  if (!recruiter || recruiter.id !== data.recruiterId) {
    throw new Error('Unauthorized to create job for this recruiter.');
  }

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
  
  const recruiter = await getCurrentRecruiter();
  const application = repo.findApplicationById(applicationId);
  if (!application) throw new Error('Application not found');
  
  if (recruiter) {
    const job = repo.findJobById(application.jobId);
    if (!job || job.recruiterId !== recruiter.id) {
      throw new Error('Unauthorized to modify this application.');
    }
  }

  const updatedApplication = repo.setApplicationStage(applicationId, newStage);
  revalidatePath('/student/dashboard');
  revalidatePath(`/recruiter/jobs/${updatedApplication.jobId}`);
  revalidatePath(`/recruiter/candidates/${applicationId}`);
  return updatedApplication;
}

/** Moves a candidate one step along the pipeline, or into a final stage. */
export async function advanceApplicationStage(
  applicationId: string,
  target: 'next' | 'reject' = 'next',
) {
  const recruiter = await getCurrentRecruiter();
  const application = repo.findApplicationById(applicationId);
  if (!application) throw new Error('Application not found');
  
  if (recruiter) {
    const job = repo.findJobById(application.jobId);
    if (!job || job.recruiterId !== recruiter.id) {
      throw new Error('Unauthorized to modify this application.');
    }
  }

  if (target === 'reject') return updateApplicationStage(applicationId, 'Rejected');

  const index = PIPELINE_STAGES.indexOf(application.stage);
  const next = PIPELINE_STAGES[index + 1] ?? 'Selected';
  return updateApplicationStage(applicationId, next);
}

/* -------------------------------------------------------------------------- */
/*                                Questions                                   */
/* -------------------------------------------------------------------------- */

export async function createQuestion(data: { category: string; questionType: string; content: string; metadataJson: string }) {
  const admin = await getCurrentAdmin();
  const recruiter = await getCurrentRecruiter();
  
  const createdBy = admin?.id || recruiter?.id;
  if (!createdBy) {
    throw new Error('Unauthorized to create a question.');
  }

  const question = repo.insertQuestion({ ...data, createdBy });
  revalidatePath('/admin/questions');
  return question;
}
