/**
 * Everything about turning a set of graded answers into a pass/fail decision,
 * with no database or model in sight so it can be reasoned about and tested
 * directly.
 */

export interface ScoredAnswer {
  score: number;
  maxScore: number;
  graded: boolean;
}

export interface RoundOutcome {
  /** Sum of the scores earned. */
  score: number;
  /** Sum of the marks available across the answers actually submitted. */
  maxScore: number;
  /** Rounded percentage, or 0 when nothing was submitted. */
  percent: number;
  passed: boolean;
  enoughAnswers: boolean;
  fullyGraded: boolean;
  /** The result needs a human before anyone trusts it. */
  flagged: boolean;
  ungradedCount: number;
}

export function decideRoundOutcome(
  answers: ScoredAnswer[],
  options: { passThreshold: number; minAnswersToPass: number },
): RoundOutcome {
  const maxScore = answers.reduce((sum, a) => sum + a.maxScore, 0);
  const score = answers.reduce((sum, a) => sum + a.score, 0);
  // Denominator is what was submitted, which is what `scoreRound` persists, so
  // the decision and the percentage on the result page can never disagree.
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  const ungradedCount = answers.filter(a => !a.graded).length;
  const enoughAnswers = answers.length >= options.minAnswersToPass;
  const fullyGraded = ungradedCount === 0;

  // A round cannot pass on a part-finished sheet, and it cannot pass on a
  // denominator the model never got to grade.
  const passed = enoughAnswers && fullyGraded && percent >= options.passThreshold;

  return {
    score,
    maxScore,
    percent,
    passed,
    enoughAnswers,
    fullyGraded,
    flagged: !fullyGraded || !enoughAnswers,
    ungradedCount,
  };
}