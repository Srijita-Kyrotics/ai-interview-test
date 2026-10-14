export function getOpenRouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY?.trim() || '';
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_REFERER = 'http://localhost:3000';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface CompletionBody {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  response_format?: { type: 'json_object' };
}

interface CompletionResponse {
  choices: { message: { content: string } }[];
}

export async function generateOpenRouterCompletion(
  prompt: string,
  systemMessage?: string,
  jsonMode: boolean = false,
) {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not configured.');
  }

  const messages: ChatMessage[] = [];
  if (systemMessage) {
    messages.push({ role: 'system', content: systemMessage });
  }
  messages.push({ role: 'user', content: prompt });

  const body: CompletionBody = {
    model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL,
    messages,
    temperature: 0.7,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_REFERER?.trim() || DEFAULT_REFERER,
      'X-Title': 'RecruitFlow AI',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenRouter API Error:', errorText);
    throw new Error('Failed to generate AI completion');
  }

  const data = (await response.json()) as CompletionResponse;
  return data.choices[0].message.content.trim();
}
