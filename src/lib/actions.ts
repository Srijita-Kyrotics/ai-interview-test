'use server';

import { db, STANDARD_SKILLS, Job, Student, Application, ApplicationStage } from './store';
import { revalidatePath } from 'next/cache';

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substring(2, 9);

export async function getSkillSuggestions(query: string) {
  if (!query) return [];
  const lowerQuery = query.toLowerCase();
  return STANDARD_SKILLS.filter(skill => skill.toLowerCase().includes(lowerQuery));
}

export async function createStudent(data: Omit<Student, 'id'>) {
  const newStudent: Student = { ...data, id: generateId() };
  db.students.push(newStudent);
  return newStudent;
}

export async function getStudent(id: string) {
  return db.students.find(s => s.id === id) || null;
}

export async function createJob(data: Omit<Job, 'id'>) {
  const newJob: Job = { ...data, id: generateId() };
  db.jobs.push(newJob);
  revalidatePath('/student/jobs');
  revalidatePath('/recruiter');
  return newJob;
}

export async function getJobs() {
  return db.jobs;
}

export async function getJob(id: string) {
  return db.jobs.find(j => j.id === id) || null;
}

export async function applyForJob(studentId: string, jobId: string) {
  const student = db.students.find(s => s.id === studentId);
  const job = db.jobs.find(j => j.id === jobId);
  
  if (!student || !job) {
    throw new Error('Student or Job not found');
  }

  // Calculate skill match
  const requiredSkills = job.skillsRequired;
  const studentSkills = student.skills;
  const matchCount = requiredSkills.filter(skill => studentSkills.includes(skill)).length;
  const matchScore = requiredSkills.length > 0 ? (matchCount / requiredSkills.length) * 100 : 100;

  const newApplication: Application = {
    id: generateId(),
    studentId,
    jobId,
    stage: 'Applied',
    matchScore,
  };

  db.applications.push(newApplication);
  revalidatePath('/student/dashboard');
  revalidatePath(`/recruiter/jobs/${jobId}`);
  
  return newApplication;
}

export async function getStudentApplications(studentId: string) {
  const apps = db.applications.filter(a => a.studentId === studentId);
  return apps.map(app => ({
    ...app,
    job: db.jobs.find(j => j.id === app.jobId)
  }));
}

export async function getJobApplications(jobId: string) {
  const apps = db.applications.filter(a => a.jobId === jobId);
  return apps.map(app => ({
    ...app,
    student: db.students.find(s => s.id === app.studentId)
  }));
}

export async function updateApplicationStage(applicationId: string, newStage: ApplicationStage) {
  const app = db.applications.find(a => a.id === applicationId);
  if (app) {
    app.stage = newStage;
    revalidatePath('/student/dashboard');
    revalidatePath(`/recruiter/jobs/${app.jobId}`);
  }
}
