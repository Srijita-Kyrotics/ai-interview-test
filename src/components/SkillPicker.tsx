'use client';

import { useEffect, useRef, useState } from 'react';
import { rankSkillSuggestions, STANDARD_SKILLS } from '@/lib/types';
import type { Skill } from '@/lib/types';

type SkillPickerProps = {
  label: string;
  placeholder: string;
  selected: Skill[];
  onChange: (skills: Skill[]) => void;
};

/**
 * Standardized-skill input. Free text is only ever a *search* query — every
 * committed skill comes from STANDARD_SKILLS, which is what keeps skill
 * matching exact-match reliable.
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

  // Derived synchronously so there's no network delay when typing fast.
  const visibleSuggestions = query.trim()
    ? rankSkillSuggestions(STANDARD_SKILLS, query).filter(s => !selected.includes(s))
    : [];

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function addSkill(skill: Skill) {
    if (!selected.includes(skill)) onChange([...selected, skill]);
    setQuery('');
  }

  function removeSkill(skill: Skill) {
    onChange(selected.filter(s => s !== skill));
  }

  return (
    <div className="form-group" ref={containerRef}>
      <label htmlFor={`skill-search-${label}`}>{label}</label>
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
            if (visibleSuggestions[0]) addSkill(visibleSuggestions[0]);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />

      {open && visibleSuggestions.length > 0 && (
        <div className="suggestions-box" role="listbox">
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

      {selected.length > 0 && (
        <div className="chip-row">
          {selected.map(skill => (
            <span key={skill} className="badge">
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
      {selected.length === 0 && (
        <p className="field-hint">Pick from the suggestions so your skills match job requirements.</p>
      )}
    </div>
  );
}
