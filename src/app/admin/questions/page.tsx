import { listAllQuestions } from '@/lib/db/repo';
import { createQuestion } from '@/lib/actions';

export default async function AdminQuestionsPage() {
  const questions = listAllQuestions();

  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '2rem' }}>Question Bank</h1>
      
      <div style={{ background: 'var(--surface)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '3rem', boxShadow: 'var(--shadow-sm)' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Add New Question</h2>
        <form action={async (formData) => {
          'use server';
          await createQuestion({
            category: formData.get('category') as string,
            questionType: formData.get('questionType') as string,
            content: formData.get('content') as string,
            metadataJson: formData.get('metadataJson') as string || '{}'
          });
        }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>Category</label>
              <select name="category" required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <option value="Communication">Communication</option>
                <option value="Aptitude">Aptitude</option>
                <option value="Technical">Technical</option>
                <option value="HR">HR</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>Type</label>
              <select name="questionType" required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <option value="text">Text Response</option>
                <option value="voice_repeat">Voice: Listen & Repeat</option>
                <option value="voice_read">Voice: Read Aloud</option>
                <option value="voice_open">Voice: Open Response</option>
              </select>
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>Content / Prompt</label>
            <textarea name="content" required rows={3} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)', resize: 'vertical' }} placeholder="e.g. Please listen carefully and repeat the sentence." />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.5rem', fontWeight: 500 }}>Metadata (JSON) <span style={{ color: 'var(--text-muted)' }}>(Optional config like max_score, audioUrl)</span></label>
            <input name="metadataJson" type="text" placeholder='{"maxScore": 10}' style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }} />
          </div>
          
          <button type="submit" className="btn-primary" style={{ padding: '0.8rem', borderRadius: '8px', fontWeight: 600, marginTop: '0.5rem' }}>
            Save Question
          </button>
        </form>
      </div>

      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Existing Questions ({questions.length})</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {questions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No questions found in the database.</p>
          ) : questions.map(q => (
            <div key={q.id} style={{ background: 'var(--surface)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: '4px', fontWeight: 600 }}>{q.category}</span>
                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: 'var(--surface-hover)', borderRadius: '4px', fontWeight: 500 }}>{q.questionType}</span>
              </div>
              <p style={{ fontWeight: 500, color: 'var(--text)', marginBottom: '0.5rem' }}>{q.content}</p>
              <code style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block' }}>{q.metadataJson}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
