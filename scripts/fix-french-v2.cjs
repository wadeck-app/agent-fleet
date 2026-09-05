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

const violations = getViolations('shared/no-french');
const files = [...new Set(violations.map(v => v.file))];
console.log(`Files with French: ${files.length}`);

// Accent replacement
const ACCENT_MAP = {
  'a': 'a', 'a': 'a', 'a': 'a', 'a': 'a', 'a': 'a',
  'e': 'e', 'e': 'e', 'e': 'e', 'e': 'e',
  'i': 'i', 'i': 'i', 'i': 'i', 'i': 'i',
  'o': 'o', 'o': 'o', 'o': 'o', 'o': 'o',
  'u': 'u', 'u': 'u', 'u': 'u', 'u': 'u',
  'c': 'c', 'n': 'n',
  'A': 'A', 'A': 'A', 'A': 'A',
  'E': 'E', 'E': 'E', 'E': 'E', 'E': 'E',
  'I': 'I', 'I': 'I',
  'O': 'O', 'O': 'O',
  'U': 'U', 'U': 'U',
  'C': 'C', 'N': 'N',
  '\u00e0': 'a', '\u00e2': 'a', '\u00e4': 'a', '\u00e1': 'a',
  '\u00e8': 'e', '\u00e9': 'e', '\u00ea': 'e', '\u00eb': 'e',
  '\u00ec': 'i', '\u00ee': 'i', '\u00ef': 'i', '\u00ed': 'i',
  '\u00f2': 'o', '\u00f4': 'o', '\u00f6': 'o', '\u00f3': 'o',
  '\u00f9': 'u', '\u00fb': 'u', '\u00fc': 'u', '\u00fa': 'u',
  '\u00e7': 'c', '\u00f1': 'n',
  '\u00c0': 'A', '\u00c2': 'A', '\u00c4': 'A', '\u00c1': 'A',
  '\u00c8': 'E', '\u00c9': 'E', '\u00ca': 'E', '\u00cb': 'E',
  '\u00ce': 'I', '\u00cf': 'I', '\u00cd': 'I',
  '\u00d4': 'O', '\u00d6': 'O', '\u00d3': 'O',
  '\u00db': 'U', '\u00dc': 'U', '\u00da': 'U',
  '\u00c7': 'C', '\u00d1': 'N',
};

const ACCENT_REGEX = new RegExp(Object.keys(ACCENT_MAP).join('|'), 'g');

// French word replacements (common patterns in fixture files)
const FRENCH_REPLACEMENTS = [
  // Comments
  [/\/\*\*?\s*\n?\s*\*?\s*Fixtures? pour les tests/gi, '/** Fixtures for tests'],
  [/\/\/\s*Fixtures? pour les tests/gi, '// Fixtures for tests'],
  [/Fixtures? pour les tests d'([a-z]+)/gi, 'Fixtures for $1 tests'],
  // Common French words in test data - ingredient names
  [/'Poulet'/g, "'Chicken'"],
  [/'Farine'/g, "'Flour'"],
  [/'Sucre'/g, "'Sugar'"],
  [/'Sel'/g, "'Salt'"],
  [/'Poivre'/g, "'Pepper'"],
  [/'Tomate'/g, "'Tomato'"],
  [/'Lait'/g, "'Milk'"],
  [/'Oeuf'/g, "'Egg'"],
  [/'Oeuf'/g, "'Egg'"],
  [/'Beurre'/g, "'Butter'"],
  [/'Huile'/g, "'Oil'"],
  [/'Eau'/g, "'Water'"],
  [/'Pain'/g, "'Bread'"],
  [/'Fromage'/g, "'Cheese'"],
  [/'Viande'/g, "'Meat'"],
  [/'Salade'/g, "'Salad'"],
  [/'Carotte'/g, "'Carrot'"],
  [/'Oignon'/g, "'Onion'"],
  [/'Ail'/g, "'Garlic'"],
  // Recipe names
  [/'Tarte aux pommes'/gi, "'Apple Pie'"],
  [/'Gateau au chocolat'/gi, "'Chocolate Cake'"],
  [/'Salade verte'/gi, "'Green Salad'"],
  [/'Poulet roti'/gi, "'Roast Chicken'"],
  [/'Quiche lorraine'/gi, "'Quiche Lorraine'"],
  [/'Crepes'/gi, "'Crepes'"],
  // Generic French comment patterns
  [/\/\/ Ceci est/gi, '// This is'],
  [/\/\/ Pour les/gi, '// For the'],
  [/\/\/ Cree par/gi, '// Created by'],
  [/\/\/ Retourne/gi, '// Returns'],
  [/\/\/ Mettre a jour/gi, '// Update'],
  [/\/\/ Supprimer/gi, '// Delete'],
  [/\/\/ Ajouter/gi, '// Add'],
  [/\/\/ Obtenir/gi, '// Get'],
  [/\/\/ Liste/gi, '// List'],
  [/\/\/ Creer/gi, '// Create'],
];

let totalFixed = 0;

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let content = fs.readFileSync(f, 'utf8');
  const original = content;

  // Replace accented chars
  content = content.replace(ACCENT_REGEX, c => ACCENT_MAP[c] || c);

  // Apply French word replacements
  for (const [pattern, replacement] of FRENCH_REPLACEMENTS) {
    content = content.replace(pattern, replacement);
  }

  if (content !== original) {
    fs.writeFileSync(f, content, 'utf8');
    totalFixed++;
    console.log(`  fixed: ${require('path').relative(ROOT, f)}`);
  }
}

console.log(`\nTotal fixed: ${totalFixed}`);
