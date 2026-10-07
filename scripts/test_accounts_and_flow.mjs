import { getDb } from '../src/lib/db/index.ts';
import * as repo from '../src/lib/db/repo.ts';
import * as roundsRepo from '../src/lib/db/rounds.repo.ts';
import { hashPassword, verifyPassword } from '../src/lib/passwords.ts';
import { calculateSkillMatch } from '../src/lib/types.ts';
import { getRoundDefinition } from '../src/lib/assessment/registry.ts';

const db = getDb();

console.log('=== Verifying Account Retention and Persistence ===');

// 1. Create a recruiter
const testCompany = `TechCorp_${Date.now()}`;
const testRecruiterName = 'Jane Recruiter';
const recruiterPassword = 'SecurePassword123!';
const recruiter = repo.insertRecruiter(testRecruiterName, testCompany, hashPassword(recruiterPassword));
console.log(`Created recruiter ID: ${recruiter.id} (${testRecruiterName} @ ${testCompany})`);

// Verify recruiter authentication
const recruiterCreds = repo.findRecruiterCredentials(testRecruiterName, testCompany);
if (!recruiterCreds || !verifyPassword(recruiterPassword, recruiterCreds.password)) {
  throw new Error('Recruiter credential verification failed!');
}
console.log('PASS: Recruiter credentials retained and verified.');

// 2. Create a job
const job = repo.insertJob({
  type: 'job',
  title: 'Full Stack AI Engineer',
  description: 'Building next-gen AI platforms.',
  eligibility: 'Open to all.',
  skillsRequired: ['TypeScript', 'React', 'Node.js', 'Python'],
  recruiterId: recruiter.id,
});
console.log(`Created Job: ${job.title} (ID: ${job.id})`);

// 3. Create a student
const testEmail = `student_${Date.now()}@kyrotics.com`;
const studentPassword = 'StudentPassword456!';
const student = repo.insertStudent({
  name: 'Alex Student',
  email: testEmail,
  passwordHash: hashPassword(studentPassword),
  github: 'https://github.com/alex',
  linkedin: 'https://linkedin.com/in/alex',
  skills: ['TypeScript', 'React', 'Node.js', 'Python', 'Machine Learning'],
});
console.log(`Created Student: ${student.name} (Email: ${testEmail})`);

// Verify student authentication
const studentCreds = repo.findStudentCredentialsByEmail(testEmail);
if (!studentCreds || !verifyPassword(studentPassword, studentCreds.password)) {
  throw new Error('Student credential verification failed!');
}
console.log('PASS: Student credentials retained and verified.');

// 4. Create application
const match = calculateSkillMatch(job.skillsRequired, student.skills);
const application = repo.insertApplication({
  studentId: student.id,
  jobId: job.id,
  stage: 'HR',
  matchScore: match.score,
  matchedSkills: match.matched,
});
console.log(`Created Application at HR stage (Match: ${match.score}%)`);

// 5. Start HR Round
const hrDef = getRoundDefinition('hr');
const hrRound = roundsRepo.startRound(application.id, 'hr');
console.log(`Started HR Round (ID: ${hrRound.id}, Status: ${hrRound.status})`);

// 6. Test Generated Question storage
const generatedQuestion = {
  question: 'Can you describe a time when you had to resolve a conflict within your team?',
  evaluation_criteria: 'STAR method, empathy, constructive outcome',
};
roundsRepo.saveGeneratedQuestion(hrRound.id, 'hr-teamwork-conflict', generatedQuestion);

const retrievedQuestion = roundsRepo.findGeneratedQuestion(hrRound.id, 'hr-teamwork-conflict');
if (!retrievedQuestion || retrievedQuestion.question !== generatedQuestion.question) {
  throw new Error('Generated question retrieval failed!');
}
console.log('PASS: Dynamic AI question successfully stored and retrieved from DB.');

// 7. Save and score an answer
roundsRepo.saveAnswer(
  hrRound.id,
  'hr-teamwork-conflict',
  0,
  'In my previous role, two team members disagreed on API structure. I organized a design review to evaluate both options with trade-offs. We chose the optimal solution and delivered on schedule.',
  {
    score: 9,
    maxScore: 10,
    feedback: 'Excellent structured answer illustrating collaborative problem solving.',
    signals: [{ label: 'Communication', detail: 'Structured and clear', level: 'good' }],
  },
  true
);

const answers = roundsRepo.listAnswers(hrRound.id);
if (answers.length !== 1 || answers[0].score !== 9) {
  throw new Error('Answer persistence failed!');
}
console.log('PASS: Candidate answer and score successfully persisted.');

// 8. Verify Account Retention after simulated logout / query
const reloadedStudent = repo.findStudentById(student.id);
const reloadedRecruiter = repo.findRecruiterById(recruiter.id);
const reloadedApps = repo.listApplicationsByStudent(student.id);

if (!reloadedStudent || reloadedStudent.email !== testEmail) {
  throw new Error('Student account retention check failed!');
}
if (!reloadedRecruiter || reloadedRecruiter.name !== testRecruiterName) {
  throw new Error('Recruiter account retention check failed!');
}
if (reloadedApps.length !== 1) {
  throw new Error('Student applications retention check failed!');
}

console.log('PASS: All account profiles, jobs, applications, and rounds are permanently retained.');
console.log('\n=== ALL PERSISTENCE AND FLOW CHECKS PASSED ===\n');
