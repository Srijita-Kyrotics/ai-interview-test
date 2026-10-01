'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import {
  completeAssessmentRound,
  startAssessmentRound,
  submitRoundAnswer,
  logProctoringEvent,
  generateDynamicPrompt,
} from '@/lib/round-actions';
import type {
  AnswerEvaluation,
  RoundState,
  SerializableRoundDefinition,
} from '@/lib/assessment/types';
import { RoundStatusHeadline } from './RoundStatus';

type Phase = 'instructions' | 'active' | 'finished';

function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function countWords(value: string): number {
  return value.trim() === '' ? 0 : value.trim().split(/\s+/).length;
}

export function RoundRunner({
  definition,
  applicationId,
  initialState,
  stageNow,
}: {
  definition: SerializableRoundDefinition;
  applicationId: string;
  initialState: RoundState;
  stageNow: string;
}) {
  const [state, setState] = useState<RoundState>(initialState);
  const [phase, setPhase] = useState<Phase>(() =>
    initialState.status === 'in_progress' ? 'active' : initialState.answers.length > 0 ? 'finished' : 'instructions',
  );
  const [index, setIndex] = useState(() => {
    if (initialState.status !== 'in_progress') return 0;
    return Math.min(initialState.answers.length, definition.questions.length - 1);
  });
  const [draft, setDraft] = useState('');
  const [lastEvaluation, setLastEvaluation] = useState<AnswerEvaluation | null>(null);
  const [advancedTo, setAdvancedTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(initialState.secondsRemaining);
  const [dynamicPrompt, setDynamicPrompt] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [, startTransition] = useTransition();
  const closingRef = useRef(false);

  const question = definition.questions[index];
  
  useEffect(() => {
    if (phase !== 'active' || !question || question.kind !== 'communication' || !state.id) return;
    setDynamicPrompt(null);
    let active = true;
    generateDynamicPrompt(state.id, question.id).then(res => {
      if (active) setDynamicPrompt(res);
    }).catch(err => {
      if (active) setDynamicPrompt('Error loading prompt from AI.');
    });
    return () => { active = false; };
  }, [phase, question, state.id]);
  
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert('Speech recognition is not supported in this browser.');
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          setDraft(prev => prev + finalTranscript);
        }
      };
      recognition.onend = () => setIsRecording(false);
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    }
  }, [isRecording]);
  
  const speakPrompt = useCallback(() => {
    const textToSpeak = dynamicPrompt || question?.prompt;
    if (!textToSpeak) return;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    window.speechSynthesis.speak(utterance);
  }, [dynamicPrompt, question]);
  const total = definition.questions.length;
  const isLast = index === total - 1;
  const answeredCount = state.answers.length;

  /* ----------------------------- whole-round timer ------------------------ */
  const timerRunning = phase === 'active';

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setSecondsLeft(prev => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);

    const roundId = state.id;
    if (!roundId) return () => window.clearInterval(id);

    const handleVisibilityChange = () => {
      if (document.hidden) logProctoringEvent(roundId, 'tab_switched');
    };
    const handleCopy = () => logProctoringEvent(roundId, 'copy');
    const handlePaste = () => logProctoringEvent(roundId, 'paste');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
    };
  }, [timerRunning, state.id]);

  // Close the round automatically if the clock runs out mid-answer.
  useEffect(() => {
    if (phase !== 'active' || secondsLeft !== 0 || closingRef.current) return;
    const roundId = state.id;
    if (!roundId) return;
    closingRef.current = true;
    startTransition(async () => {
      const result = await completeAssessmentRound(roundId);
      setState(result.state);
      setAdvancedTo(result.advancedTo);
      setPhase('finished');
    });
  }, [secondsLeft, phase, state.id]);

  const begin = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await startAssessmentRound(applicationId, definition.kind);
        setState(result.state);
        setSecondsLeft(result.state.secondsRemaining);
        setIndex(0);
        setPhase('active');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start the round.');
      }
    });
  }, [applicationId, definition.kind]);

  const submit = useCallback(() => {
    const roundId = state.id;
    if (!roundId || !question) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await submitRoundAnswer(roundId, question.id, draft);
        setState(result.state);
        setLastEvaluation(result.evaluation);
        setDraft('');
        if (isRecording) {
          recognitionRef.current?.stop();
          setIsRecording(false);
        }
        setIndex(prev => Math.min(prev + 1, total - 1));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not submit that answer.');
      }
    });
  }, [state.id, question, draft, total]);

  const finish = useCallback(() => {
    const roundId = state.id;
    if (!roundId) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeAssessmentRound(roundId);
        setState(result.state);
        setAdvancedTo(result.advancedTo);
        setPhase('finished');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not finish the round.');
      }
    });
  }, [state.id]);

  const wordCount = useMemo(() => countWords(draft), [draft]);
  const lowOnTime = secondsLeft !== null && secondsLeft <= 60;

  /* ------------------------------- instructions --------------------------- */
  if (phase === 'instructions') {
    return (
      <div className="round-shell">
        <header className="round-intro">
          <p className="eyebrow">{definition.shortTitle} round</p>
          <h1>{definition.title}</h1>
          <p className="lede">{definition.summary}</p>
          <div className="round-facts">
            <div>
              <span className="round-fact-value">{total}</span>
              <span className="round-fact-label">questions</span>
            </div>
            <div>
              <span className="round-fact-value">{formatTime(definition.timeLimitSec)}</span>
              <span className="round-fact-label">time limit</span>
            </div>
            <div>
              <span className="round-fact-value">{definition.passThreshold}%</span>
              <span className="round-fact-label">to pass</span>
            </div>
          </div>
        </header>

        <section className="card round-card">
          <h2>Before you start</h2>
          <ol className="round-instructions">
            {definition.instructions.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <p className="round-note">
            Your application is currently at the <strong>{stageNow}</strong> stage. Passing this
            round moves you to <strong>{definition.passesTo}</strong>.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn-primary btn-lg" onClick={begin}>
            Start round
          </button>
        </section>
      </div>
    );
  }

  /* --------------------------------- result ------------------------------- */
  if (phase === 'finished') {
    const passed = state.status === 'passed';
    return (
      <div className="round-shell">
        <section className={`card round-card round-result round-result-${passed ? 'passed' : 'failed'}`}>
          <p className="eyebrow">{definition.shortTitle} round</p>
          <h1>{passed ? 'Round passed' : 'Round not passed'}</h1>
          <RoundStatusHeadline state={state} />
          <p className="lede">
            {passed
              ? advancedTo
                ? `You scored ${state.percent}%, which clears the ${state.passThreshold}% threshold. Your application has moved to ${advancedTo}.`
                : `You scored ${state.percent}%, which clears the ${state.passThreshold}% threshold.`
              : `You scored ${state.percent}%. The pass mark is ${state.passThreshold}%, so the round is not cleared. Your application stays at ${stageNow} and your recruiter will decide what happens next.`}
          </p>
        </section>

        <section className="card round-card">
          <h2>Your answers</h2>
          <p className="muted">
            Each answer was assessed as you submitted it. The five signals below are the same ones
            the score is built from.
          </p>
          <ol className="round-review">
            {state.answers.map(answer => (
              <li key={answer.id} className="round-review-item">
                <div className="round-review-head">
                  <h3>{answer.prompt}</h3>
                  <span className="round-review-score">
                    {answer.score} / {answer.maxScore}
                  </span>
                </div>
                <p className="round-review-answer">{answer.answer}</p>
                <p className="round-review-feedback">{answer.feedback}</p>
                <ul className="round-signals">
                  {answer.signals.map(signal => (
                    <li key={signal.label} className={`round-signal round-signal-${signal.level}`}>
                      <span className="round-signal-label">{signal.label}</span>
                      <span className="round-signal-detail">{signal.detail}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <div className="round-actions">
          <a className="btn-ghost" href="/student/dashboard">
            Back to dashboard
          </a>
        </div>
      </div>
    );
  }

  /* --------------------------------- active ------------------------------- */
  if (!question) return null;

  return (
    <div className="round-shell">
      <header className="round-topbar">
        <div className="round-progress">
          <span className="round-progress-label">
            Question {index + 1} of {total}
          </span>
          <div
            className="round-progress-track"
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={total}
          >
            <div
              className="round-progress-fill"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
          <span className="round-progress-sub">{answeredCount} submitted</span>
        </div>
        <div className={`round-timer${lowOnTime ? ' round-timer-low' : ''}`} aria-live="polite">
          <span className="round-timer-label">Time left</span>
          <span className="round-timer-value">{formatTime(secondsLeft ?? 0)}</span>
        </div>
      </header>

      {lastEvaluation && (
        <div className="round-eval" role="status">
          <strong>
            {lastEvaluation.score} / {lastEvaluation.maxScore}
          </strong>{' '}
          {lastEvaluation.feedback}
        </div>
      )}

      <section className="card round-card">
        <h2 className="round-question">
          {question.kind === 'communication' ? (dynamicPrompt || 'Loading prompt...') : question.prompt}
        </h2>
        {question.hint && <p className="round-hint">{question.hint}</p>}
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <button type="button" className="btn-secondary" onClick={speakPrompt}>
            🔊 Speak Question
          </button>
          <button type="button" className={isRecording ? "btn-primary" : "btn-secondary"} onClick={toggleRecording}>
            {isRecording ? '⏹️ Stop Recording' : '🎤 Start Recording'}
          </button>
        </div>

        <label className="round-label" htmlFor="round-answer">
          Your answer (spoken or typed)
        </label>
        <textarea
          id="round-answer"
          className="round-textarea"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          rows={9}
          placeholder={isRecording ? "Listening..." : "Type your answer here or use the microphone..."}
          disabled={secondsLeft === 0}
        />
        <div className="round-textarea-meta">
          <span className={wordCount < question.minWords ? 'muted' : 'round-words-ok'}>
            {wordCount} words
          </span>
          <span className="muted">
            aim for {question.minWords}–{question.suggestedWords}
          </span>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="round-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setIndex(prev => Math.max(0, prev - 1))}
            disabled={index === 0}
          >
            Back
          </button>
          {isLast ? (
            <button
              type="button"
              className="btn-primary"
              onClick={finish}
              disabled={answeredCount === 0}
            >
              Finish round
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={submit}
              disabled={!draft.trim()}
            >
              Submit and continue
            </button>
          )}
        </div>
        {isLast && answeredCount < total && (
          <p className="round-note">
            You submitted {answeredCount} of {total} answers. Finishing now scores only what you
            submitted.
          </p>
        )}
      </section>
    </div>
  );
}
