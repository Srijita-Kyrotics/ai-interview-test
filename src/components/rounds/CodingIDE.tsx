'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { SUPPORTED_LANGUAGES, type LanguageOption, type ExecutionResult } from '@/lib/judge0';

interface CodingIDEProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  isSubmitted?: boolean;
}

export function CodingIDE({ value, onChange, disabled, isSubmitted }: CodingIDEProps) {
  const [selectedLang, setSelectedLang] = useState<LanguageOption>(SUPPORTED_LANGUAGES[0]);
  const [code, setCode] = useState<string>(() => {
    // If value already has code or was initialized, keep it
    if (value && value.trim()) return value;
    return SUPPORTED_LANGUAGES[0].defaultCode;
  });
  const [stdin, setStdin] = useState<string>('');
  const [showStdin, setShowStdin] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [execResult, setExecResult] = useState<ExecutionResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Synchronize composite answer back to parent
  const syncAnswer = useCallback(
    (currentCode: string, lang: LanguageOption, currentNotes: string) => {
      const formatted = `// Language: ${lang.name} (Judge0 ID: ${lang.judge0Id})
${currentCode}

${currentNotes.trim() ? `/* Explanation / Notes:\n${currentNotes.trim()}\n*/` : ''}`;
      onChange(formatted);
    },
    [onChange],
  );

  const handleLanguageChange = (langId: string) => {
    const lang = SUPPORTED_LANGUAGES.find(l => l.id === langId) || SUPPORTED_LANGUAGES[0];
    setSelectedLang(lang);
    // If current code is just default code of another language or empty, switch to new default
    const isOldDefault = SUPPORTED_LANGUAGES.some(l => l.defaultCode === code);
    if (!code.trim() || isOldDefault) {
      setCode(lang.defaultCode);
      syncAnswer(lang.defaultCode, lang, notes);
    } else {
      syncAnswer(code, lang, notes);
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    syncAnswer(newCode, selectedLang, notes);
  };

  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    syncAnswer(code, selectedLang, newNotes);
  };

  const handleReset = () => {
    if (confirm('Reset editor to starter template? Your current edits in this editor will be overwritten.')) {
      setCode(selectedLang.defaultCode);
      syncAnswer(selectedLang.defaultCode, selectedLang, notes);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const spaces = '    '; // 4 spaces

      const updated = code.substring(0, start) + spaces + code.substring(end);
      setCode(updated);
      syncAnswer(updated, selectedLang, notes);

      // Restore cursor position
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
      }, 0);
    }
  };

  const runCode = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setRunError(null);
    setExecResult(null);

    try {
      const res = await fetch('/api/judge0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          languageId: selectedLang.judge0Id,
          sourceCode: code,
          stdin: stdin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute code');
      }
      setExecResult(data);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  // Compute line numbers
  const linesCount = Math.max(1, code.split('\n').length);
  const lineNumbers = Array.from({ length: linesCount }, (_, i) => i + 1);

  return (
    <div className="coding-ide-container">
      {/* Top Toolbar */}
      <div className="coding-ide-toolbar">
        <div className="coding-ide-controls">
          <label htmlFor="lang-select" className="coding-ide-label">
            Language:
          </label>
          <select
            id="lang-select"
            className="coding-ide-select"
            value={selectedLang.id}
            onChange={e => handleLanguageChange(e.target.value)}
            disabled={disabled || isSubmitted}
          >
            {SUPPORTED_LANGUAGES.map(lang => (
              <option key={lang.id} value={lang.id}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>

        <div className="coding-ide-actions">
          <button
            type="button"
            className="btn-ghost btn-xs"
            onClick={() => setShowStdin(!showStdin)}
          >
            {showStdin ? 'Hide Stdin' : 'Custom Input (Stdin)'}
          </button>
          {!isSubmitted && (
            <button
              type="button"
              className="btn-ghost btn-xs"
              onClick={handleReset}
              disabled={disabled}
            >
              Reset Code
            </button>
          )}
          <button
            type="button"
            className="btn-primary btn-sm coding-ide-run-btn"
            onClick={runCode}
            disabled={isRunning || disabled || !code.trim()}
          >
            {isRunning ? '⏳ Running...' : '▶ Run Code'}
          </button>
        </div>
      </div>

      {/* Stdin Box (Optional) */}
      {showStdin && (
        <div className="coding-ide-stdin-box">
          <label className="coding-ide-sublabel">Standard Input (stdin):</label>
          <textarea
            className="coding-ide-stdin"
            rows={3}
            placeholder="Enter input for your program here..."
            value={stdin}
            onChange={e => setStdin(e.target.value)}
            disabled={disabled || isSubmitted}
          />
        </div>
      )}

      {/* Code Editor with Line Numbers */}
      <div className="coding-ide-editor-wrapper">
        <div className="coding-ide-linenos" aria-hidden="true">
          {lineNumbers.map(n => (
            <div key={n} className="coding-ide-lineno">
              {n}
            </div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="coding-ide-textarea"
          value={code}
          onChange={e => handleCodeChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          readOnly={isSubmitted}
          disabled={disabled}
          placeholder="Write your code here..."
        />
      </div>

      {/* Terminal Output Panel */}
      <div className="coding-ide-output-panel">
        <div className="coding-ide-output-header">
          <span className="coding-ide-output-title">Execution Console</span>
          {execResult && (
            <span
              className={`coding-status-pill coding-status-${
                execResult.status.id === 3 ? 'accepted' : 'error'
              }`}
            >
              {execResult.status.description}
            </span>
          )}
          {execResult && (execResult.time || execResult.memory) && (
            <span className="coding-ide-stats">
              {execResult.time && `${(parseFloat(execResult.time) * 1000).toFixed(0)} ms`}
              {execResult.memory && ` · ${execResult.memory} KB`}
            </span>
          )}
        </div>

        <div className="coding-ide-output-body">
          {isRunning && <p className="coding-ide-msg">Executing on Judge0 server...</p>}

          {runError && <pre className="coding-ide-error">{runError}</pre>}

          {execResult && (
            <>
              {execResult.compileOutput && (
                <div className="coding-ide-section">
                  <span className="coding-ide-section-title">Compilation Error:</span>
                  <pre className="coding-ide-error">{execResult.compileOutput}</pre>
                </div>
              )}
              {execResult.stderr && (
                <div className="coding-ide-section">
                  <span className="coding-ide-section-title">Standard Error:</span>
                  <pre className="coding-ide-error">{execResult.stderr}</pre>
                </div>
              )}
              {execResult.stdout && (
                <div className="coding-ide-section">
                  <span className="coding-ide-section-title">Standard Output:</span>
                  <pre className="coding-ide-stdout">{execResult.stdout}</pre>
                </div>
              )}
              {!execResult.stdout && !execResult.stderr && !execResult.compileOutput && (
                <p className="coding-ide-msg">Process finished with no output.</p>
              )}
            </>
          )}

          {!isRunning && !runError && !execResult && (
            <p className="coding-ide-empty">Click &quot;▶ Run Code&quot; to compile and execute your solution.</p>
          )}
        </div>
      </div>

      {/* Optional Explanation Notes */}
      <div className="coding-ide-notes">
        <label className="coding-ide-sublabel">
          Algorithm approach & explanation (Optional):
        </label>
        <textarea
          className="coding-ide-notes-input"
          rows={3}
          placeholder="Explain your approach, time/space complexity, or trade-offs..."
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          readOnly={isSubmitted}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
