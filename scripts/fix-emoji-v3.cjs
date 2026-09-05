'use strict';
const fs = require('fs');
const { execSync } = require('child_process');
const ROOT = 'C:/Workspace_Tooling/agent-fleet';

function getViolations(rule) {
  try {
    const out = execSync('violations check', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    return out.split('\n').filter(l => l.includes(`[${rule}]`)).map(l => {
      const m = l.match(/^(.+?):(\d+)\s+/);
      return m ? { file: m[1], line: parseInt(m[2]) } : null;
    }).filter(Boolean);
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    return out.split('\n').filter(l => l.includes(`[${rule}]`)).map(l => {
      const m = l.match(/^(.+?):(\d+)\s+/);
      return m ? { file: m[1], line: parseInt(m[2]) } : null;
    }).filter(Boolean);
  }
}

// Combined: emoji + box drawing + other pictographic characters
const ALL_SPECIAL = /[\u2500-\u27BF\u2B00-\u2BFF\uFE00-\uFE0F\u{1F000}-\u{1FFFF}]|\p{Emoji}/gu;

const violations = getViolations('shared/no-emoji');
const files = [...new Set(violations.map(v => v.file))];
console.log(`Files to fix: ${files.length}`);

let fixed = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const orig = fs.readFileSync(f, 'utf8');
  const result = orig.replace(ALL_SPECIAL, '');
  if (result !== orig) {
    fs.writeFileSync(f, result, 'utf8');
    fixed++;
    console.log(`  fixed: ${require('path').relative(ROOT, f)}`);
  }
}
console.log(`Total: ${fixed} files fixed`);
