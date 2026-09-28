import { calculateSkillMatch, matchLabel } from '@/lib/types';
import type { Job, Student } from '@/lib/types';

type SkillMatchSummaryProps = {
  job: Job;
  student: Student;
  /** Snapshot captured at apply time; falls back to live recomputation. */
  matchedSkills?: string[];
};

/** Shows exactly which required skills the candidate does and does not have. */
export default function SkillMatchSummary({
  job,
  student,
  matchedSkills,
}: SkillMatchSummaryProps) {
  const match = calculateSkillMatch(job.skillsRequired, student.skills);
  const matched = matchedSkills ?? match.matched;

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
            const has = matched.includes(skill);
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
