'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createStudent, getSkillSuggestions } from '@/lib/actions';

export default function StudentOnboarding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [github, setGithub] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [skillInput, setSkillInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  const handleSkillChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSkillInput(val);
    if (val.length > 0) {
      const sugs = await getSkillSuggestions(val);
      setSuggestions(sugs.filter(s => !selectedSkills.includes(s)));
    } else {
      setSuggestions([]);
    }
  };

  const addSkill = (skill: string) => {
    if (!selectedSkills.includes(skill)) setSelectedSkills([...selectedSkills, skill]);
    setSkillInput('');
    setSuggestions([]);
  };

  const removeSkill = (skill: string) => {
    setSelectedSkills(selectedSkills.filter(s => s !== skill));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const student = await createStudent({ name, github, linkedin, skills: selectedSkills });
    router.push(`/student/dashboard?studentId=${student.id}`);
  };

  return (
    <div className="container">
      <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1>Create Student Profile</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Tell us about your skills to get matched with top opportunities.</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input required value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" />
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <label>GitHub Profile</label>
              <input value={github} onChange={e => setGithub(e.target.value)} placeholder="https://github.com/..." />
            </div>
            <div style={{ flex: 1 }}>
              <label>LinkedIn Profile</label>
              <input value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." />
            </div>
          </div>
          
          <div className="form-group" style={{ position: 'relative' }}>
            <label>Technical Skills</label>
            <input value={skillInput} onChange={handleSkillChange} placeholder="Start typing... e.g. Python, React" />
            
            {suggestions.length > 0 && (
              <div className="suggestions-box">
                {suggestions.map(s => (
                  <div key={s} className="suggestion-item" onClick={() => addSkill(s)}>{s}</div>
                ))}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              {selectedSkills.map(s => (
                <span key={s} className="badge">
                  {s} <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => removeSkill(s)}>×</span>
                </span>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
            Create Profile & Continue
          </button>
        </form>
      </div>
    </div>
  );
}
