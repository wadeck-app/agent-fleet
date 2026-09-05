'use strict';
const fs = require('fs');

const filesPath = 'C:/Users/Wadeck/AppData/Local/Temp/em-dash-files.txt';
const files = fs.readFileSync(filesPath, 'utf8').split('\n').filter(Boolean);

let fixed = 0;
let skipped = 0;

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    // Replace em-dash (U+2014) and en-dash (U+2013) with hyphen
    const updated = content
      .replace(/\u2014/g, '--')
      .replace(/\u2013/g, '-');
    if (updated !== content) {
      fs.writeFileSync(file, updated, 'utf8');
      fixed++;
      console.log('fixed:', file);
    } else {
      skipped++;
    }
  } catch (e) {
    console.error('error:', file, e.message);
  }
}

console.log(`\nFixed: ${fixed}, Skipped: ${skipped}`);
