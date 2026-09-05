'use strict';
/**
 * Fix ts/no-switch-default-break: add throw to switch default cases that silently break/return
 */
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = 'C:/Workspace_Tooling/agent-fleet';

function getViolations(rule) {
  try {
    const out = execSync('violations check', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    return out.split('\n').filter(l => l.includes(`[${rule}]`)).map(l => {
      const m = l.match(/^(.+?):(\d+)\s+/);
      if (!m) return null;
      return { file: m[1], line: parseInt(m[2]) };
    }).filter(Boolean);
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    return out.split('\n').filter(l => l.includes(`[${rule}]`)).map(l => {
      const m = l.match(/^(.+?):(\d+)\s+/);
      if (!m) return null;
      return { file: m[1], line: parseInt(m[2]) };
    }).filter(Boolean);
  }
}

const violations = getViolations('ts/no-switch-default-break');
const byFile = {};
for (const v of violations) {
  if (!byFile[v.file]) byFile[v.file] = [];
  byFile[v.file].push(v.line);
}

let totalFixed = 0;

for (const [filePath, lines] of Object.entries(byFile)) {
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const fileLines = content.split('\n');

  let modified = false;
  // Process each violation line (flagged line is where default: starts)
  for (const lineNum of lines.sort((a, b) => b - a)) { // reverse order to not shift indices
    const idx = lineNum - 1;
    const line = fileLines[idx];
    if (!line) continue;

    // Find the default: line
    if (!/^\s*default\s*:/.test(line)) continue;

    const indent = line.match(/^(\s*)/)?.[1] ?? '';
    const bodyIndent = indent + '  ';

    // Check what comes after default:
    // Look at next non-empty lines until we hit case or }
    let j = idx + 1;
    let hasBody = false;
    let insertIdx = idx + 1;

    while (j < fileLines.length) {
      const nextLine = fileLines[j].trim();
      if (nextLine === '' || nextLine.startsWith('//')) { j++; continue; }
      if (nextLine === 'break;' || nextLine === 'return;' || nextLine.startsWith('return ')) {
        // Replace silent break/return with throw
        fileLines[j] = fileLines[j].replace(/\bbreak\s*;/, `throw new Error(\`Unexpected switch value\`);`);
        fileLines[j] = fileLines[j].replace(/\breturn\s*;/, `throw new Error(\`Unexpected switch value\`);`);
        fileLines[j] = fileLines[j].replace(/\breturn\s+[^;]+;/, `throw new Error(\`Unexpected switch value\`);`);
        modified = true;
        hasBody = true;
      } else if (nextLine.startsWith('case ') || nextLine === '}') {
        // Insert throw before the next case or closing brace
        if (!hasBody) {
          fileLines.splice(j, 0, `${bodyIndent}throw new Error(\`Unexpected switch value\`);`);
          modified = true;
        }
      }
      break;
    }

    if (!hasBody && j >= fileLines.length) {
      // No body found, inline after default:
      fileLines[idx] = `${indent}default:\n${bodyIndent}throw new Error(\`Unexpected switch value\`);`;
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, fileLines.join('\n'), 'utf8');
    totalFixed++;
    console.log(`fixed: ${require('path').relative(ROOT, filePath)}`);
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
