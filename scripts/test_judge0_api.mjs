import { executeCode, SUPPORTED_LANGUAGES } from '../src/lib/judge0.ts';

async function testAllLanguages() {
  console.log('Testing Judge0 Execution Helper for C, C++, Java, and Python...\n');

  const tests = [
    {
      name: 'Python (3.8.1)',
      langId: 71,
      code: 'def add(a, b):\n    return a + b\n\nprint("Result:", add(10, 25))',
      stdin: '',
      expected: 'Result: 35',
    },
    {
      name: 'C++ (GCC 9.2.0)',
      langId: 54,
      code: '#include <iostream>\nusing namespace std;\nint main() {\n    int x, y;\n    if (cin >> x >> y) {\n        cout << "Sum: " << (x + y) << endl;\n    } else {\n        cout << "No input" << endl;\n    }\n    return 0;\n}',
      stdin: '12 18',
      expected: 'Sum: 30',
    },
    {
      name: 'C (GCC 9.2.0)',
      langId: 50,
      code: '#include <stdio.h>\nint main() {\n    int a = 7, b = 8;\n    printf("Product: %d\\n", a * b);\n    return 0;\n}',
      stdin: '',
      expected: 'Product: 56',
    },
    {
      name: 'Java (OpenJDK 13.0.1)',
      langId: 62,
      code: 'import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.hasNextInt() ? sc.nextInt() : 5;\n        System.out.println("Factorial of " + n + " is 120");\n    }\n}',
      stdin: '5',
      expected: 'Factorial of 5 is 120',
    },
  ];

  let passed = 0;
  for (const t of tests) {
    process.stdout.write(`Testing ${t.name}... `);
    try {
      const res = await executeCode(t.langId, t.code, t.stdin);
      if (res.status.description === 'Accepted' && res.stdout?.includes(t.expected)) {
        console.log(`PASS (${res.time}s, ${res.memory}KB) -> "${res.stdout.trim()}"`);
        passed++;
      } else {
        console.log(`FAIL (Status: ${res.status.description}) -> stdout: "${res.stdout}", stderr: "${res.stderr}", compile: "${res.compileOutput}"`);
      }
    } catch (e) {
      console.log(`FAIL with error: ${e.message}`);
    }
  }

  console.log(`\nResults: ${passed}/${tests.length} tests passed.`);
  if (passed !== tests.length) process.exit(1);
}

testAllLanguages();
