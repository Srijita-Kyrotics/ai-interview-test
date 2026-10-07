import { NextRequest, NextResponse } from 'next/server';
import { executeCode } from '@/lib/judge0';
import { consume } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'anon';
    if (!consume(`judge0:${ip}`, 30, 60_000)) {
      return NextResponse.json(
        { error: 'Too many code execution requests. Please wait a moment.' },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { languageId, sourceCode, stdin } = body;

    if (typeof languageId !== 'number' || typeof sourceCode !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request. languageId (number) and sourceCode (string) are required.' },
        { status: 400 },
      );
    }

    const result = await executeCode(languageId, sourceCode, stdin || '');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Judge0 execution error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Execution failed' },
      { status: 500 },
    );
  }
}
