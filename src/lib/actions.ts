'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import * as repo from '@/lib/db/repo';
import {
  hashPassword,
  isLegacyPlaintextPassword,
  validatePasswordStrength,
  verifyPassword,
} from '@/lib/passwords';
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

const SECURE_COOKIES = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: SECURE_COOKIES,
} as const;

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

/**
 * Admin access is granted by a credential the deployment configures, not by
 * whoever types an email. Both halves must be present and match: without them
 * the admin area is simply closed.
 */
const ADMIN_EMAIL = process.env.RECRUITFLOW_ADMIN_EMAIL?.trim() ?? '';
const ADMIN_PASSWORD = process.env.RECRUITFLOW_ADMIN_PASSWORD ?? '';

export async function getCurrentAdmin() {
  const id = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!id) return null;
  return repo.findAdminById(id);
}

export async function startAdminSession(email: string, password: string) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      'Admin access is not configured. Set RECRUITFLOW_ADMIN_EMAIL and RECRUITFLOW_ADMIN_PASSWORD.',
    );
  }

  if (email.trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error('Incorrect email or password.');
  }
  if (!verifyPassword(password, ADMIN_PASSWORD)) {
    throw new Error('Incorrect email or password.');
  }

  // The admins row is created on first successful login, so the deployment only
  // needs the environment variables — no pre-seeded account.
  const admin = repo.findAdminByEmail(ADMIN_EMAIL) ?? repo.insertAdmin(ADMIN_EMAIL);

  (await cookies()).set(ADMIN_COOKIE, admin.id, cookieOptions);
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
  (await cookies()).set(STUDENT_COOKIE, studentId, cookieOptions);
}

export async function endStudentSession() {
  (await cookies()).delete(STUDENT_COOKIE);
}

export async function getCurrentRecruiter(): Promise<Recruiter | null> {
  const id = (await cookies()).get(RECRUITER_COOKIE)?.value;
  if (!id) return null;
  return repo.findRecruiterById(id);
}

/**
 * A recruiter's account is the only thing standing between a stranger and every
 * candidate's answers, so the password is mandatory on both sign-up and
 * sign-in. Accounts created before hashing are upgraded on first successful
 * sign-in.
 */
export async function signInRecruiter(name: string, company: string, password: string) {
  const credentials = repo.findRecruiterCredentials(name, company);
  if (!credentials) {
    throw new Error('Recruiter not found. Please create a profile.');
  }
  if (!credentials.password) {
    throw new Error('This account has no password set. Ask an admin to reset it.');
  }
  if (!verifyPassword(password, credentials.password)) {
    throw new Error('Incorrect password.');
  }
  if (isLegacyPlaintextPassword(credentials.password)) {
    repo.setRecruiterPassword(credentials.id, hashPassword(password));
  }

  (await cookies()).set(RECRUITER_COOKIE, credentials.id, cookieOptions);
  return repo.findRecruiterById(credentials.id);
}

export async function signUpRecruiter(name: string, company: string, password: string) {
  const trimmedName = name.trim();
  const trimmedCompany = company.trim();
  const weakness = validatePasswordStrength(password);
  if (weakness) throw new Error(weakness);

  if (repo.findRecruiterByName(trimmedName, trimmedCompany)) {
    throw new Error('Recruiter already exists. Please sign in.');
  }

  const recruiter = repo.insertRecruiter(trimmedName, trimmedCompany, hashPassword(password));
  (await cookies()).set(RECRUITER_COOKIE, recruiter.id, cookieOptions);
  return recruiter;
}

export async function endRecruiterSession() {
  (await cookies()).delete(RECRUITER_COOKIE);
}

/* -------------------------------------------------------------------------- */
/*                                  Students                                  */
/* -------------------------------------------------------------------------- */

/**
 * An account with no stored password used to accept any input at all, because
 * the check was skipped when the column was empty. Passwordless access is now
 * impossible: a blank stored secret is refused rather than waved through.
 */
export async function signInStudent(email: string, password: string) {
  const credentials = repo.findStudentCredentialsByEmail(email);
  if (!credentials) {
    throw new Error('Student not found. Please create a profile.');
  }
  if (!credentials.password) {
    throw new Error('This account has no password set. Create a new profile instead.');
  }
  if (!verifyPassword(password, credentials.password)) {
    throw new Error('Incorrect password.');
  }
  if (isLegacyPlaintextPassword(credentials.password)) {
    repo.setStudentPassword(credentials.id, hashPassword(password));
  }

  await startStudentSession(credentials.id);
  return repo.findStudentById(credentials.id);
}

export async function createStudent(data: {
  name: string;
  email: string;
  password: string;
  skills: Skill[];
  github: string;
  linkedin: string;
}) {
  const existing = repo.findStudentByEmail(data.email.trim());
  if (existing) {
    throw new Error('Student already exists. Please sign in.');
  }
  const weakness = validatePasswordStrength(data.password);
  if (weakness) throw new Error(weakness);

  const student = repo.insertStudent({
    name: data.name.trim(),
    email: data.email.trim(),
    passwordHash: hashPassword(data.password),
    skills: data.skills,
    github: data.github,
    linkedin: data.linkedin,
  });
  await startStudentSession(student.id);
  return student;
}

export async function updateStudent(
  id: string,
  data: { name: string; email: string; skills: Skill[]; github: string; linkedin: string },
) {
  const session = await getCurrentStudent();
  if (!session || session.id !== id) {
    throw new Error('You can only edit your own profile.');
  }
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
