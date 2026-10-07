export interface LanguageOption {
  id: string;
  name: string;
  judge0Id: number;
  monacoLang: string;
  defaultCode: string;
}

export const JUDGE0_BASE_URL = process.env.JUDGE0_URL || 'https://judge.bhasantar.com/judge0';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    id: 'python',
    name: 'Python (3.8.1)',
    judge0Id: 71,
    monacoLang: 'python',
    defaultCode: `# Python 3.8 Solution\ndef solution():\n    # Write your solution here\n    pass\n\nif __name__ == '__main__':\n    solution()\n`,
  },
  {
    id: 'cpp',
    name: 'C++ (GCC 9.2.0)',
    judge0Id: 54,
    monacoLang: 'cpp',
    defaultCode: `// C++ (GCC 9.2.0) Solution\n#include <iostream>\n#include <vector>\n#include <string>\n\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
  },
  {
    id: 'c',
    name: 'C (GCC 9.2.0)',
    judge0Id: 50,
    monacoLang: 'c',
    defaultCode: `// C (GCC 9.2.0) Solution\n#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
  },
  {
    id: 'java',
    name: 'Java (OpenJDK 13.0.1)',
    judge0Id: 62,
    monacoLang: 'java',
    defaultCode: `// Java (OpenJDK 13.0.1) Solution\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n`,
  },
];

export interface ExecutionResult {
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
  status: {
    id: number;
    description: string;
  };
}

export async function executeCode(
  languageId: number,
  sourceCode: string,
  stdin: string = '',
): Promise<ExecutionResult> {
  const url = `${JUDGE0_BASE_URL.replace(/\/+$/, '')}/submissions?base64_encoded=false&wait=true`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      language_id: languageId,
      source_code: sourceCode,
      stdin: stdin || '',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Judge0 execution failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return {
    stdout: data.stdout ?? null,
    stderr: data.stderr ?? null,
    compileOutput: data.compile_output ?? null,
    message: data.message ?? null,
    time: data.time ?? null,
    memory: data.memory ?? null,
    status: data.status ?? { id: 0, description: 'Unknown' },
  };
}
