import { calculateSkillMatch, matchLabel } from '@/lib/types';
import type { Job, Student } from '@/lib/types';

type SkillMatchSummaryProps = {
  job: Job;
  student: Student;
};

/**
 * Shows exactly which required skills the candidate does and does not have.
 * Score and chips are always computed live from the current profile so the two
 * can never disagree after the student edits their skills.
 */
export default function SkillMatchSummary({ job, student }: SkillMatchSummaryProps) {
  const match = calculateSkillMatch(job.skillsRequired, student.skills);

  return (
    <div className="match-summary">
      <div className="match-head">
        <div>
          <span className="match-score" data-tone={tone(match.score)}>
            {Math.round(match.score)}%
          </span>
          <span className="match-label">
            {match.matched.length}/{match.total} required skills matched
          </span>
        </div>
        <span className="match-verdict">{matchLabel(match.score)}</span>
      </div>

      {job.skillsRequired.length === 0 ? (
        <p className="field-hint">This role listed no required skills.</p>
      ) : (
        <div className="match-skills">
          {job.skillsRequired.map(skill => {
            const has = match.matched.includes(skill);
            return (
              <span key={skill} className={`match-skill ${has ? 'has' : 'missing'}`}>
                {has ? '✓' : '✗'} {skill}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function tone(score: number) {
  if (score >= 80) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}
