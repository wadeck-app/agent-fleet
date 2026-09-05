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

const violations = getViolations('ts/no-err-message-direct');
const files = [...new Set(violations.map(v => v.file))];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let content = fs.readFileSync(f, 'utf8');
  const original = content;

  // Fix previous incorrect replacements: (err instanceof Error ? err.message : String(err)) -> String(err)
  content = content.replace(/\(\w+ instanceof Error \? \w+\.message : String\(\w+\)\)/g, m => {
    const varMatch = m.match(/\((\w+) instanceof Error/);
    return varMatch ? `String(${varMatch[1]})` : m;
  });

  // Fix remaining direct .message access patterns
  // Pattern: (err as Error).message -> String(err)
  content = content.replace(/\((\w+)\s+as\s+Error\)\.message/g, 'String($1)');

  // Pattern: err.message, error.message, e.message, etc.
  content = content.replace(/\b(err|error|e|ex|exception|cause|catchErr|err2|err3)\.message\b/g, 'String($1)');

  if (content !== original) {
    fs.writeFileSync(f, content, 'utf8');
    console.log(`fixed: ${require('path').relative(ROOT, f)}`);
  }
}
console.log('Done');
