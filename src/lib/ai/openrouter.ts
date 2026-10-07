export function getOpenRouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY?.trim() || '';
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

  const messages = [];
  if (systemMessage) {
    messages.push({ role: 'system', content: systemMessage });
  }
  messages.push({ role: 'user', content: prompt });

  const body: any = {
    model: 'openai/gpt-4o-mini',
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
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'RecruitFlow AI',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenRouter API Error:', errorText);
    throw new Error('Failed to generate AI completion');
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}
