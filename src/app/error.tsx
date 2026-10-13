'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error with digest for debugging
    console.error('Application runtime error caught by ErrorBoundary:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: 'inherit',
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: '520px',
          width: '100%',
          padding: '2.5rem',
          borderRadius: '16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#fee2e2',
            color: '#ef4444',
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 1.5rem',
            fontSize: '1.75rem',
          }}
        >
          ⚠️
        </div>

        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Something went wrong
        </h2>

        <p style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          An error occurred while loading this page. This could be due to a server initialization issue or database connection state.
        </p>

        {error.digest && (
          <div
            style={{
              padding: '0.65rem 1rem',
              backgroundColor: 'var(--surface, #f8fafc)',
              borderRadius: '8px',
              border: '1px solid var(--border, #e2e8f0)',
              fontSize: '0.8rem',
              color: 'var(--text-muted, #64748b)',
              marginBottom: '1.5rem',
              wordBreak: 'break-all',
            }}
          >
            Error Reference ID (Digest): <code>{error.digest}</code>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            className="btn-primary"
            style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', cursor: 'pointer' }}
          >
            Try again
          </button>
          <Link
            href="/"
            className="btn-ghost"
            style={{ padding: '0.65rem 1.25rem', borderRadius: '8px', textDecoration: 'none' }}
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
