'use strict';
const fs = require('fs');
const lines = fs.readFileSync('C:/Users/Wadeck/AppData/Local/Temp/em-dash-violations.txt', 'utf8').split('\n').filter(Boolean);
const files = new Set();
for (const line of lines) {
  const m = line.match(/^(C:[^:]+):\d+/);
  if (m) files.add(m[1]);
}
fs.writeFileSync('C:/Users/Wadeck/AppData/Local/Temp/em-dash-files.txt', [...files].join('\n') + '\n');
console.log('unique files:', files.size);
[...files].forEach(f => console.log(f));
