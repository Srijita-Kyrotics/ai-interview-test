export type Skill = string;

export interface Student {
  id: string;
  name: string;
  email: string;
  skills: Skill[];
  github: string;
  linkedin: string;
  createdAt: string;
}

export interface Recruiter {
  id: string;
  name: string;
  company: string;
}

export interface Admin {
  id: string;
  email: string;
  createdAt: string;
}

export const OPPORTUNITY_TYPES = ['job', 'internship'] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_TYPE_LABELS: Record<OpportunityType, string> = {
  job: 'Job',
  internship: 'Internship',
};

export interface Job {
  id: string;
  type: OpportunityType;
  title: string;
  description: string;
  skillsRequired: Skill[];
  eligibility: string;
  recruiterId: string;
  createdAt: string;
}

export interface JobRound {
  id: string;
  jobId: string;
  kind: string;
  position: number;
  passThreshold: number;
}

export interface Question {
  id: string;
  category: string;
  questionType: string;
  content: string;
  metadataJson: string;
  createdBy: string;
  createdAt: string;
}

export interface ProctoringEvent {
  id: string;
  roundId: string;
  eventType: string;
  timestamp: string;
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

export const FINAL_STAGES: ApplicationStage[] = ['Selected', 'Rejected'];

export const ALL_STAGES: ApplicationStage[] = [...PIPELINE_STAGES, ...FINAL_STAGES];

export const DEFAULT_STAGE: ApplicationStage = 'Applied';

export function isApplicationStage(value: string): value is ApplicationStage {
  return (ALL_STAGES as string[]).includes(value);
}

export interface Application {
  id: string;
  studentId: string;
  jobId: string;
  stage: ApplicationStage;
  matchScore: number;
  matchedSkills: Skill[];
  createdAt: string;
}

export interface ApplicationWithJob extends Application {
  job: Job;
}

export interface ApplicationWithStudent extends Application {
  student: Student;
}

export interface SkillMatch {
  score: number;
  matched: Skill[];
  missing: Skill[];
  total: number;
}

/**
 * Exact-match scoring over standardized skills. Kept deliberately simple and
 * isolated so a real matcher can replace it without touching call sites.
 */
export function calculateSkillMatch(requiredSkills: Skill[], studentSkills: Skill[]): SkillMatch {
  const owned = new Set(studentSkills.map(s => s.trim().toLowerCase()));
  const matched = requiredSkills.filter(skill => owned.has(skill.trim().toLowerCase()));
  const missing = requiredSkills.filter(skill => !owned.has(skill.trim().toLowerCase()));
  const total = requiredSkills.length;
  return {
    score: total === 0 ? 100 : Math.round((matched.length / total) * 100),
    matched,
    missing,
    total,
  };
}

export function matchLabel(score: number): string {
  if (score >= 80) return 'Strong skill match';
  if (score >= 50) return 'Moderate skill match';
  return 'Low skill match';
}

/**
 * Ranks standardized skills so exact hits come first, then prefix matches,
 * then substring matches. Keeps "Pyth" -> Python, Python Backend, ...
 */
export function rankSkillSuggestions(skills: Skill[], query: string): Skill[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...skills];
  const scored: { skill: Skill; rank: number }[] = [];
  for (const skill of skills) {
    const value = skill.toLowerCase();
    let rank: number;
    if (value === needle) rank = 0;
    else if (value.startsWith(needle)) rank = 1;
    else if (value.includes(needle)) rank = 2;
    else continue;
    scored.push({ skill, rank });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.skill.localeCompare(b.skill))
    .map(entry => entry.skill);
}

export const STANDARD_SKILLS: Skill[] = [
  'Python',
  'Python Backend',
  'Python Development',
  'FastAPI',
  'Django',
  'Flask',
  'SQL',
  'PostgreSQL',
  'MongoDB',
  'Redis',
  'REST API',
  'GraphQL',
  'Git',
  'Docker',
  'Kubernetes',
  'CI/CD',
  'AWS',
  'Azure',
  'React',
  'React Native',
  'Next.js',
  'Node.js',
  'TypeScript',
  'JavaScript',
  'Java',
  'C++',
  'Go',
  'Rust',
  'HTML',
  'CSS',
  'Machine Learning',
  'Deep Learning',
  'Data Structures',
  'Algorithms',
  'System Design',
  'OOP',
];
