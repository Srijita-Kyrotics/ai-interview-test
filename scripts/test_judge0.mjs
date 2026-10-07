async function testAll() {
  const tests = [
    { lang: 'C', id: 50, code: '#include <stdio.h>\nint main() { printf("Hello from C!\\n"); return 0; }' },
    { lang: 'C++', id: 54, code: '#include <iostream>\nint main() { std::cout << "Hello from C++!" << std::endl; return 0; }' },
    { lang: 'Java', id: 62, code: 'public class Main { public static void main(String[] args) { System.out.println("Hello from Java!"); } }' },
    { lang: 'Python', id: 71, code: 'print("Hello from Python!")' }
  ];

  for (const t of tests) {
    const res = await fetch('https://judge.bhasantar.com/judge0/submissions?base64_encoded=false&wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language_id: t.id,
        source_code: t.code,
      }),
    });
    const data = await res.json();
    console.log(`${t.lang}:`, data.status?.description, '->', data.stdout?.trim() || data.compile_output || data.stderr);
  }
}

testAll().catch(console.error);
