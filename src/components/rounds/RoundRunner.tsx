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

/**
 * The Web Speech API is not in the DOM lib yet and is prefixed in some browsers,
 * so the two shapes this component touches are declared locally rather than
 * reaching for `any`.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as SpeechWindow;
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

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
  const [phase, setPhase] = useState<Phase>(() => {
    if (initialState.status === 'in_progress') return 'active';
    // A round closed without a single answer still has a result to show, so a
    // terminal status decides this rather than how many answers exist.
    return initialState.status === 'passed' || initialState.status === 'failed'
      ? 'finished'
      : 'instructions';
  });
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
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [, startTransition] = useTransition();
  const closingRef = useRef(false);

  const question = definition.questions[index];
  const total = definition.questions.length;

  // An answer is final once graded, so a question that already has one is shown
  // read-only rather than offered for another attempt.
  const submittedAnswer = useMemo(
    () => state.answers.find(a => a.questionId === question?.id) ?? null,
    [state.answers, question?.id],
  );
  const isSubmitted = submittedAnswer !== null;

  useEffect(() => {
    if (phase !== 'active' || !question || (question.kind !== 'communication' && question.kind !== 'aptitude' && question.kind !== 'technical1' && question.kind !== 'technical2') || !state.id) return;
    let active = true;
    generateDynamicPrompt(state.id, question.id).then(res => {
      if (active) setDynamicPrompt(res);
    }).catch(err => {
      if (active) setDynamicPrompt(err instanceof Error ? err.message : 'Error loading prompt from AI.');
    });
    return () => { active = false; };
  }, [phase, question, state.id]);

  // Navigation owns the draft: moving to a question shows whatever was already
  // submitted for it, so a revisit shows the graded answer instead of blank.
  const goTo = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), total - 1);
    const target = definition.questions[clamped];
    setIndex(clamped);
    setDynamicPrompt(null);
    setDraft(state.answers.find(a => a.questionId === target?.id)?.answer ?? '');
  }, [definition.questions, state.answers, total]);

  const uploadAudio = useCallback(async (blob: Blob) => {
    const roundId = state.id;
    if (!roundId || !question) return;
    try {
      const res = await fetch(
        `/api/rounds/audio?roundId=${encodeURIComponent(roundId)}&questionId=${encodeURIComponent(question.id)}`,
        { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob },
      );
      setAudioNotice(res.ok ? 'Recording saved.' : 'Recording could not be saved.');
    } catch {
      setAudioNotice('Recording could not be saved.');
    }
  }, [state.id, question]);

  const startRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) void uploadAudio(blob);
        chunksRef.current = [];
      };
      recorder.start();
      recorderRef.current = recorder;
    } catch {
      setAudioNotice('Microphone access was blocked, so no audio was captured.');
    }
  }, [uploadAudio]);

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorderRef.current = null;
  }, []);

  const toggleRecording = useCallback(() => {
    setAudioNotice(null);
    if (isRecording) {
      recognitionRef.current?.stop();
      stopRecorder();
      setIsRecording(false);
      return;
    }

    const Recognition = getSpeechRecognition();
    if (Recognition) {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event: SpeechRecognitionEventLike) => {
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
    }

    // Transcript and audio are independent: a browser without speech
    // recognition still records audio, and one without a microphone still types.
    void startRecorder();
    setIsRecording(true);
  }, [isRecording, startRecorder, stopRecorder]);
  
  const speakPrompt = useCallback(() => {
    const textToSpeak = dynamicPrompt || question?.prompt;
    if (!textToSpeak) return;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    window.speechSynthesis.speak(utterance);
  }, [dynamicPrompt, question]);

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
      try {
        const result = await completeAssessmentRound(roundId);
        setState(result.state);
        setAdvancedTo(result.advancedTo);
        setPhase('finished');
      } catch (err) {
        // Deliberately not clearing closingRef: retrying on a zeroed timer would
        // loop. "Finish round" stays enabled so the candidate can retry by hand.
        setError(err instanceof Error ? err.message : 'Time is up and the round could not be closed.');
      }
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
        setDraft('');
        setDynamicPrompt(null);
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
        // Stop capture before submitting so the recording is flushed to storage
        // alongside the answer it belongs to.
        if (isRecording) {
          recognitionRef.current?.stop();
          stopRecorder();
          setIsRecording(false);
        }
        const result = await submitRoundAnswer(roundId, question.id, draft);
        setState(result.state);
        setLastEvaluation(result.evaluation);
        setDraft('');
        goTo(index + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not submit that answer.');
      }
    });
  }, [state.id, question, draft, index, isRecording, stopRecorder, goTo]);

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
          {(question.kind === 'communication' || question.kind === 'aptitude' || question.kind === 'technical1' || question.kind === 'technical2') ? (dynamicPrompt || 'Loading prompt...') : question.prompt}
        </h2>
        {question.hint && <p className="round-hint">{question.hint}</p>}
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <button type="button" className="btn-secondary" onClick={speakPrompt}>
            🔊 Speak Question
          </button>
          {!isSubmitted && (
            <button type="button" className={isRecording ? "btn-primary" : "btn-secondary"} onClick={toggleRecording}>
              {isRecording ? '⏹️ Stop Recording' : '🎤 Start Recording'}
            </button>
          )}
        </div>

        {audioNotice && <p className="muted" role="status">{audioNotice}</p>}

        {isSubmitted && (
          <p className="round-submitted-note" role="status">
            Submitted and graded — this answer cannot be changed.
          </p>
        )}

        <label className="round-label" htmlFor="round-answer">
          Your answer (spoken or typed)
        </label>
        <textarea
          id="round-answer"
          className="round-textarea"
          value={draft}
          onChange={event => setDraft(event.target.value)}
          rows={9}
          readOnly={isSubmitted}
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
            onClick={() => goTo(index - 1)}
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
          ) : isSubmitted ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => goTo(index + 1)}
            >
              Next question
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
