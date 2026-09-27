export type Skill = string;

export interface Student {
  id: string;
  name: string;
  skills: Skill[];
  github: string;
  linkedin: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  skillsRequired: Skill[];
  recruiterId: string; // just to tie it to a recruiter
}

export type ApplicationStage =
  | 'Applied'
  | 'Screening'
  | 'Communication'
  | 'Aptitude'
  | 'Technical 1'
  | 'Technical 2'
  | 'HR'
  | 'Selected'
  | 'Rejected';

export const PIPELINE_STAGES: ApplicationStage[] = [
  'Applied',
  'Screening',
  'Communication',
  'Aptitude',
  'Technical 1',
  'Technical 2',
  'HR',
];

export interface Application {
  id: string;
  studentId: string;
  jobId: string;
  stage: ApplicationStage;
  matchScore: number; // calculated at apply time
}

// In-memory store
export const db = {
  students: [] as Student[],
  jobs: [] as Job[],
  applications: [] as Application[],
};

// Available standardized skills
export const STANDARD_SKILLS = [
  'Python',
  'Python Backend',
  'Python Development',
  'FastAPI',
  'SQL',
  'REST API',
  'Git',
  'React',
  'React Native',
  'Node.js',
  'TypeScript',
  'Machine Learning',
  'Docker',
];
