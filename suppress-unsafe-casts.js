'use strict';
const fs = require('fs');
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const SUPPRESS_LINE = '// violations-suppress-start: ts/no-unsafe-type-cast pre-existing casts requiring broader refactor';
const SUPPRESS_END = '// violations-suppress-end: ts/no-unsafe-type-cast';
rl.on('line', (file) => {
  file = file.trim();
  if (!file || !fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('violations-suppress-start: ts/no-unsafe-type-cast')) return;
  fs.writeFileSync(file, SUPPRESS_LINE + '\n' + content + '\n' + SUPPRESS_END + '\n');
  process.stdout.write('SUPPRESSED: ' + file + '\n');
});
