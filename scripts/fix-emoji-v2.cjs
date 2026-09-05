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

// More comprehensive emoji regex using Unicode property escapes
// This removes all emoji/pictographic/symbol characters
const EMOJI_PATTERN = /\p{Emoji}/gu;

const violations = getViolations('shared/no-emoji');
const files = [...new Set(violations.map(v => v.file))];
console.log(`Files to fix: ${files.length}`);

let fixed = 0;
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const orig = fs.readFileSync(f, 'utf8');
  // Remove emoji using unicode property escape
  const result = orig.replace(EMOJI_PATTERN, '');
  if (result !== orig) {
    fs.writeFileSync(f, result, 'utf8');
    fixed++;
    console.log(`  fixed: ${require('path').relative(ROOT, f)}`);
  }
}
console.log(`Total: ${fixed} files fixed`);
