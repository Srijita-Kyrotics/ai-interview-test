import { FINAL_STAGES, PIPELINE_STAGES } from '@/lib/types';
import type { ApplicationStage } from '@/lib/types';

type PipelineTrackerProps = {
  stage: ApplicationStage;
};

function getStepState(stage: ApplicationStage, step: ApplicationStage) {
  if (stage === 'Selected' || stage === 'Rejected') {
    if (step === stage) return 'done';
    return 'skipped';
  }
  const stageIndex = PIPELINE_STAGES.indexOf(stage);
  const stepIndex = PIPELINE_STAGES.indexOf(step);
  if (stepIndex < stageIndex) return 'done';
  if (stepIndex === stageIndex) return 'current';
  return 'upcoming';
}

const MARKERS: Record<string, string> = {
  done: '✓',
  current: '→',
  upcoming: '○',
  skipped: '·',
};

/**
 * Renders the full hiring funnel. `Selected`/`Rejected` replace the remaining
 * steps once a decision has been made.
 */
export default function PipelineTracker({ stage }: PipelineTrackerProps) {
  const decided = FINAL_STAGES.includes(stage);
  const steps = decided ? [...PIPELINE_STAGES, stage] : PIPELINE_STAGES;

  return (
    <div className={`pipeline${decided ? ' pipeline-decided' : ''}`}>
      {steps.map(step => {
        const state = getStepState(stage, step);
        return (
          <div key={step} className={`pipeline-stage is-${state}`}>
            <span className="pipeline-marker" aria-hidden="true">
              {MARKERS[state]}
            </span>
            <span>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
