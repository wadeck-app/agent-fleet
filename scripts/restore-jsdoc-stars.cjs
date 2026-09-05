'use strict';
/**
 * Restores asterisks removed from JSDoc comments by the emoji regex.
 * The \p{Emoji} regex incorrectly removed * (U+002A) from JS/TS files.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = 'C:/Workspace_Tooling/agent-fleet';

// Get affected TS/JS files from git diff
const diffOutput = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8', windowsHide: true });
const changedFiles = diffOutput.split('\n').filter(f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'));

let fixed = 0;

for (const rel of changedFiles) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) continue;

  const content = fs.readFileSync(f, 'utf8');

  // Check if file has broken JSDoc (lines with / ... / instead of /** ... */)
  if (!content.includes('/** ') && content.includes('/ ') && content.includes(' /')) {
    // Might have lost asterisks. Get the original from git.
    try {
      const original = execSync(`git show HEAD:${rel}`, { cwd: ROOT, encoding: 'utf8', windowsHide: true });

      // For each line in the current file, check if it lost a * compared to original
      // Strategy: restore JSDoc comment lines that lost their asterisks
      const currentLines = content.split('\n');
      const originalLines = original.split('\n');

      if (currentLines.length === originalLines.length) {
        let changed = false;
        const restoredLines = currentLines.map((line, i) => {
          const origLine = originalLines[i] || '';
          // If original line has * but current doesn't, and they're otherwise similar
          // (ignoring *), restore it
          const origWithoutStar = origLine.replace(/\*/g, '');
          const currWithoutStar = line.replace(/\*/g, '');

          if (origLine.includes('*') && !line.includes('*') && origWithoutStar === currWithoutStar) {
            changed = true;
            return origLine;
          }
          return line;
        });

        if (changed) {
          fs.writeFileSync(f, restoredLines.join('\n'), 'utf8');
          fixed++;
          console.log(`restored: ${rel}`);
        }
      }
    } catch (e) {
      // File might not exist in HEAD, skip
    }
  }
}

console.log(`\nRestored ${fixed} files`);
