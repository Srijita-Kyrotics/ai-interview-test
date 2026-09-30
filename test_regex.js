const text = `0:I[123]
6:E{"digest":"NEXT_REDIRECT;replace;/student/dashboard;307;"}
7:something`;
const errorRows = [...text.matchAll(/(?:^|\n)\d+:E\{([^\n]*)/g)].map(m => m[1]);
const realErrors = errorRows.filter(row => !row.includes('NEXT_REDIRECT'));
console.log("errorRows:", errorRows);
console.log("realErrors:", realErrors);
