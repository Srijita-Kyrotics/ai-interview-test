/**
 * Deletes the local SQLite database so the next run recreates it from scratch.
 *
 *   npm run db:reset
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), '.data');

try {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log('Removed .data — the database will be recreated on next start.');
} catch (error) {
  if (error.code === 'EPERM' || error.code === 'EBUSY') {
    console.error(
      [
        'Could not delete .data because a running process still has the database open.',
        '',
        'Stop the dev server first, then re-run:',
        '  1. Ctrl+C in the terminal running "npm run dev"',
        '  2. npm run db:reset',
      ].join('\n'),
    );
    process.exit(1);
  }
  throw error;
}
