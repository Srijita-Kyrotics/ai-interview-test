'use client';

import { useEffect, useRef, useState } from 'react';
import { rankSkillSuggestions, STANDARD_SKILLS } from '@/lib/types';
import type { Skill } from '@/lib/types';

const POPULAR_SKILLS: Skill[] = [
  'Python',
  'JavaScript',
  'TypeScript',
  'React',
  'Next.js',
  'Node.js',
  'SQL',
  'FastAPI',
  'Java',
  'C++',
  'Docker',
  'Git',
  'Machine Learning',
  'Data Structures',
  'System Design',
];

type SkillPickerProps = {
  label: string;
  placeholder: string;
  selected: Skill[];
  onChange: (skills: Skill[]) => void;
};

/**
 * Standardized-skill input with instant popular chips, autocomplete dropdown,
 * and custom skill addition.
 */
export default function SkillPicker({
  label,
  placeholder,
  selected,
  onChange,
}: SkillPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLower = new Set(selected.map(s => s.toLowerCase()));

  // Filtered standard suggestions
  const visibleSuggestions = rankSkillSuggestions(STANDARD_SKILLS, query).filter(
    s => !selectedLower.has(s.toLowerCase()),
  );

  const popularAvailable = POPULAR_SKILLS.filter(
    s => !selectedLower.has(s.toLowerCase()),
  );

  const exactMatchExists = visibleSuggestions.some(
    s => s.toLowerCase() === query.trim().toLowerCase(),
  );

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function addSkill(skill: Skill) {
    const trimmed = skill.trim();
    if (!trimmed) return;
    if (!selectedLower.has(trimmed.toLowerCase())) {
      onChange([...selected, trimmed]);
    }
    setQuery('');
    setOpen(false);
  }

  function removeSkill(skill: Skill) {
    onChange(selected.filter(s => s.toLowerCase() !== skill.toLowerCase()));
  }

  return (
    <div className="form-group skill-field" ref={containerRef} style={{ position: 'relative' }}>
      <label htmlFor={`skill-search-${label}`}>{label}</label>
      
      {/* Selected Skills */}
      {selected.length > 0 && (
        <div className="chip-row" style={{ marginBottom: '0.625rem' }}>
          {selected.map(skill => (
            <span key={skill} className="badge badge-success">
              {skill}
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${skill}`}
                onClick={() => removeSkill(skill)}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <input
        id={`skill-search-${label}`}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (visibleSuggestions[0]) {
              addSkill(visibleSuggestions[0]);
            } else if (query.trim()) {
              addSkill(query.trim());
            }
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />

      {/* Dropdown Suggestions */}
      {open && (visibleSuggestions.length > 0 || (query.trim() && !exactMatchExists)) && (
        <div className="suggestions-box" role="listbox">
          {query.trim() && !exactMatchExists && (
            <div
              className="suggestion-item"
              style={{ fontWeight: 600, color: 'var(--accent)' }}
              onClick={() => addSkill(query.trim())}
            >
              + Add &quot;{query.trim()}&quot;
            </div>
          )}
          {visibleSuggestions.map(skill => (
            <div
              key={skill}
              className="suggestion-item"
              role="option"
              aria-selected={false}
              onClick={() => addSkill(skill)}
            >
              {skill}
            </div>
          ))}
        </div>
      )}

      {/* Quick Select Popular Skills */}
      {popularAvailable.length > 0 && (
        <div style={{ marginTop: '0.625rem' }}>
          <span className="muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.375rem' }}>
            ⚡ Popular skills (click to add):
          </span>
          <div className="chip-row">
            {popularAvailable.slice(0, 10).map(skill => (
              <button
                key={skill}
                type="button"
                className="badge badge-dim"
                style={{ cursor: 'pointer', border: '1px dashed var(--border-strong)', background: 'transparent' }}
                onClick={() => addSkill(skill)}
              >
                + {skill}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected.length === 0 && !popularAvailable.length && (
        <p className="field-hint">Pick or search skills so your profile matches job requirements.</p>
      )}
    </div>
  );
}
