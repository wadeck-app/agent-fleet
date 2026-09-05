'use strict';
/**
 * Batch fix script for violations:
 * - shared/no-emoji: remove emoji chars
 * - shared/no-french: remove accented chars
 * - ts/no-err-message-direct: replace .message access
 * - ts/no-locale-date: replace locale date methods
 */
const fs = require('fs');
const path = require('path');
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

function fixFile(filePath, transformer) {
  if (!fs.existsSync(filePath)) return false;
  const original = fs.readFileSync(filePath, 'utf8');
  const fixed = transformer(original);
  if (fixed !== original) {
    fs.writeFileSync(filePath, fixed, 'utf8');
    return true;
  }
  return false;
}

let totalFixed = 0;

// ===== 1. shared/no-emoji =====
console.log('\n=== Fixing shared/no-emoji ===');
const emojiViolations = getViolations('shared/no-emoji');
const emojiFiles = [...new Set(emojiViolations.map(v => v.file))];
console.log(`Files with emoji: ${emojiFiles.length}`);

// Unicode emoji ranges - comprehensive
const EMOJI_REGEX = /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u2702-\u27B0]|[\u2704-\u2705]|[\u2708-\u270D]|\u270F|\u2712|\u2714|\u2716|\u271D|\u2721|\u2728|\u2733-\u2734|\u2744|\u2747|\u274C|\u274E|\u2753-\u2755|\u2757|\u2763-\u2764|\u2795-\u2797|\u27A1|\u27B0|\u27BF|\u2934-\u2935|\u2B05-\u2B07|\u2B1B-\u2B1C|\u2B50|\u2B55|\u231A-\u231B|\u2328|\u23CF|\u23E9-\u23F3|\u23F8-\u23FA|\u24C2|\u25AA-\u25AB|\u25B6|\u25C0|\u25FB-\u25FE|\u2600-\u2604|\u260E|\u2611|\u2614-\u2615|\u2618|\u261D|\u2620|\u2622-\u2623|\u2626|\u262A|\u262E-\u262F|\u2638-\u263A|\u2640|\u2642|\u2648-\u2653|\u265F-\u2660|\u2663|\u2665-\u2666|\u2668|\u267B|\u267E-\u267F|\u2692-\u2697|\u2699|\u269B-\u269C|\u26A0-\u26A1|\u26AA-\u26AB|\u26B0-\u26B1|\u26BD-\u26BE|\u26C4-\u26C5|\u26CE-\u26CF|\u26D1|\u26D3-\u26D4|\u26E9-\u26EA|\u26F0-\u26F5|\u26F7-\u26FA|\u26FD|\u2702|\u2705|\u2708-\u270D|\u270F|\u2712|\u2714|\u2716|\u271D|\u2721|\u2728|\u2733-\u2734|\u2744|\u2747|\u274C|\u274E|\u2753-\u2755|\u2757|\u2763-\u2764|\u2795-\u2797|\u27A1|\u27B0|\u27BF/gu;

for (const f of emojiFiles) {
  const changed = fixFile(f, content => content.replace(EMOJI_REGEX, ''));
  if (changed) {
    totalFixed++;
    console.log(`  fixed: ${path.relative(ROOT, f)}`);
  }
}

// ===== 2. shared/no-french =====
console.log('\n=== Fixing shared/no-french (accented chars) ===');
const frenchViolations = getViolations('shared/no-french');
const frenchFiles = [...new Set(frenchViolations.map(v => v.file))];
console.log(`Files with french/accented: ${frenchFiles.length}`);

const ACCENT_MAP = {
  'à': 'a', 'â': 'a', 'ä': 'a', 'á': 'a', 'ã': 'a',
  'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
  'ì': 'i', 'î': 'i', 'ï': 'i', 'í': 'i',
  'ò': 'o', 'ô': 'o', 'ö': 'o', 'ó': 'o', 'õ': 'o',
  'ù': 'u', 'û': 'u', 'ü': 'u', 'ú': 'u',
  'ç': 'c', 'ñ': 'n',
  'À': 'A', 'Â': 'A', 'Ä': 'A', 'Á': 'A',
  'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
  'Î': 'I', 'Ï': 'I', 'Í': 'I',
  'Ô': 'O', 'Ö': 'O', 'Ó': 'O',
  'Û': 'U', 'Ü': 'U', 'Ú': 'U',
  'Ç': 'C', 'Ñ': 'N',
};

const ACCENT_REGEX = new RegExp(Object.keys(ACCENT_MAP).join('|'), 'g');

for (const f of frenchFiles) {
  const changed = fixFile(f, content => content.replace(ACCENT_REGEX, c => ACCENT_MAP[c] || c));
  if (changed) {
    totalFixed++;
    console.log(`  fixed: ${path.relative(ROOT, f)}`);
  }
}

// ===== 3. ts/no-err-message-direct =====
console.log('\n=== Fixing ts/no-err-message-direct ===');
const errViolations = getViolations('ts/no-err-message-direct');
const errFiles = [...new Set(errViolations.map(v => v.file))];
console.log(`Files with err.message: ${errFiles.length}`);

for (const f of errFiles) {
  const changed = fixFile(f, content => {
    // Replace (err as Error).message -> (err instanceof Error ? err.message : String(err))
    let fixed = content;
    // Pattern: (err as Error).message or (error as Error).message
    fixed = fixed.replace(/\((\w+)\s+as\s+Error\)\.message/g, '($1 instanceof Error ? $1.message : String($1))');
    // Pattern: err.message where err is likely an error variable
    fixed = fixed.replace(/\b(err|error|e|ex|exception|cause)\.message\b/g, (match, varName) => {
      return `(${varName} instanceof Error ? ${varName}.message : String(${varName}))`;
    });
    return fixed;
  });
  if (changed) {
    totalFixed++;
    console.log(`  fixed: ${path.relative(ROOT, f)}`);
  }
}

// ===== 4. ts/no-locale-date =====
console.log('\n=== Fixing ts/no-locale-date ===');
const dateViolations = getViolations('ts/no-locale-date');
const dateFiles = [...new Set(dateViolations.map(v => v.file))];
console.log(`Files with locale dates: ${dateFiles.length}`);

for (const f of dateFiles) {
  const changed = fixFile(f, content => {
    let fixed = content;
    // Replace .toLocaleDateString() -> .toISOString().slice(0, 10)
    fixed = fixed.replace(/\.toLocaleDateString\([^)]*\)/g, '.toISOString().slice(0, 10)');
    // Replace .toLocaleTimeString() -> .toISOString().slice(11, 19)
    fixed = fixed.replace(/\.toLocaleTimeString\([^)]*\)/g, '.toISOString().slice(11, 19)');
    // Replace .toLocaleString() -> .toISOString().replace('T', ' ').slice(0, 19)
    fixed = fixed.replace(/\.toLocaleString\([^)]*\)/g, ".toISOString().replace('T', ' ').slice(0, 19)");
    return fixed;
  });
  if (changed) {
    totalFixed++;
    console.log(`  fixed: ${path.relative(ROOT, f)}`);
  }
}

console.log(`\nTotal files modified: ${totalFixed}`);
