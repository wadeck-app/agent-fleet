'use strict';
const fs = require('fs');
const path = require('path');
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

// Build a map of file -> violation lines
const fileViolations = {};
for (const v of violations) {
  if (!fileViolations[v.file]) fileViolations[v.file] = [];
  fileViolations[v.file].push(v.line);
}

// For each file, read and get the actual content at the violation lines
// Then build targeted replacements
const PATTERNS = [
  // Flow editor reference.md
  [/\bTous les nodes affichent\b/gi, 'All nodes display'],
  [/\bNom du step\b/gi, 'Step name'],
  [/\bIndicateurs? conditionnels?\b/gi, 'Conditional indicators'],
  [/\bErreurs? de validation\b/gi, 'Validation errors'],
  [/\bHandles? de Connection\b/gi, 'Connection handles'],
  [/\bLigne pleine pour dependances?\b/gi, 'Solid line for dependencies'],
  [/\bLigne pointillee animee pour loops?\b/gi, 'Animated dashed line for loops'],
  [/\bEtats? de Validation\b/gi, 'Validation States'],
  [/\bPas d[e']\s*Error\b/gi, 'No errors'],
  [/\bErreurs? critiques?\b/gi, 'Critical errors'],
  [/\bConvertit les?\b/gi, 'Converts'],
  [/\ben nodes? Xyflow\b/gi, 'to Xyflow nodes'],
  [/\ben edges? de dependance\b/gi, 'to dependency edges'],
  [/\ben edges? de loop\b/gi, 'to loop edges'],
  [/\bCalcule les? positions? automatiquement\b/gi, 'Automatically calculates positions'],
  [/\bLigne pleine\b/gi, 'Solid line'],
  [/\bLigne pointillee\b/gi, 'Dashed line'],
  [/\bAnimee\b/gi, 'Animated'],
  [/\bNoeud\b/gi, 'Node'],
  [/\bNoeuds?\b/gi, 'Nodes'],
  // CreateTaskDialog
  [/\bNouvelle tache\b/gi, 'New task'],
  [/\bCr[e]er une tache\b/gi, 'Create a task'],
  [/\bTitre de la tache\b/gi, 'Task title'],
  [/\bDescription de la tache\b/gi, 'Task description'],
  [/\bTache cr[e]ee\b/gi, 'Task created'],
  [/\bOuverture\b/gi, 'Opening'],
  [/\bFermeture\b/gi, 'Closing'],
  [/\bSoumettre\b/gi, 'Submit'],
  [/\bAnnuler\b/gi, 'Cancel'],
  [/\bEnregistrer\b/gi, 'Save'],
  [/\bModifier\b/gi, 'Edit'],
  [/\bSupprimer\b/gi, 'Delete'],
  [/\bCreer\b/gi, 'Create'],
  [/\bAjouter\b/gi, 'Add'],
  [/\bRechercher\b/gi, 'Search'],
  // ANALYSIS.md
  [/\bAnalyse\b/gi, 'Analysis'],
  [/\bObjectif\b/gi, 'Objective'],
  [/\bResume\b/gi, 'Summary'],
  [/\bConclusion\b/gi, 'Conclusion'],
  [/\bRecommandations?\b/gi, 'Recommendations'],
  [/\bProbleme\b/gi, 'Problem'],
  [/\bSolution\b/gi, 'Solution'],
  [/\bAvantages?\b/gi, 'Advantages'],
  [/\bInconvenients?\b/gi, 'Disadvantages'],
  [/\bChoix\b/gi, 'Choice'],
  [/\bDecision\b/gi, 'Decision'],
  [/\bImplementation\b/gi, 'Implementation'],
  [/\bContexte\b/gi, 'Context'],
  [/\bHistorique\b/gi, 'History'],
  [/\bSituation actuelle\b/gi, 'Current situation'],
  [/\bEtat actuel\b/gi, 'Current state'],
  [/\bPoints? cles?\b/gi, 'Key points'],
  [/\bPoints? forts?\b/gi, 'Strengths'],
  [/\bPoints? faibles?\b/gi, 'Weaknesses'],
  [/\bAmeliorations? possibles?\b/gi, 'Possible improvements'],
  [/\bTravail futur\b/gi, 'Future work'],
  [/\bProchainees? etapes?\b/gi, 'Next steps'],
  [/\bEtapes? suivantes?\b/gi, 'Next steps'],
  // ColumnVisibility
  [/\bVisibilite des colonnes\b/gi, 'Column visibility'],
  [/\bColonnes? visibles?\b/gi, 'Visible columns'],
  [/\bColonnes? cachees?\b/gi, 'Hidden columns'],
  [/\bColonnes? masquees?\b/gi, 'Hidden columns'],
  [/\bTout afficher\b/gi, 'Show all'],
  [/\bTout masquer\b/gi, 'Hide all'],
  [/\bReinitialiser\b/gi, 'Reset'],
  // Page.tsx / layout
  [/\bMise en page\b/gi, 'Layout'],
  [/\bConteneur\b/gi, 'Container'],
  [/\bEnveloppe\b/gi, 'Wrapper'],
  [/\bNavigation principale\b/gi, 'Main navigation'],
  [/\bContenu principal\b/gi, 'Main content'],
  [/\bPied de page\b/gi, 'Footer'],
  [/\bEn-tete\b/gi, 'Header'],
  [/\bBarre laterale\b/gi, 'Sidebar'],
  // asyncUtils
  [/\bAttendre\b/gi, 'Wait'],
  [/\bDelai\b/gi, 'Delay'],
  [/\bExpiration\b/gi, 'Timeout'],
  [/\bIntervalle\b/gi, 'Interval'],
  [/\bReessayer\b/gi, 'Retry'],
  [/\bNombre de tentatives\b/gi, 'Number of attempts'],
  [/\bTentatives?\b/gi, 'Attempts'],
  [/\bDure\b/gi, 'Duration'],
  [/\bMS\b/g, 'ms'],
  // Ingredients README/reference
  [/\bTests? d'integration\b/gi, 'Integration tests'],
  [/\bTests? unitaires?\b/gi, 'Unit tests'],
  [/\bTests? end-to-end\b/gi, 'End-to-end tests'],
  [/\bStructure du repertoire\b/gi, 'Directory structure'],
  [/\bFichiers? de test\b/gi, 'Test files'],
  [/\bMocks? et fixtures?\b/gi, 'Mocks and fixtures'],
  [/\bCouverture de test\b/gi, 'Test coverage'],
  // Generic remaining French
  [/\bvoici\b/gi, 'here is'],
  [/\bVoici\b/gi, 'Here is'],
  [/\bpour\b(?=\s+(les|la|le|l[e'"]))/gi, 'for'],
  [/\bsans\b/gi, 'without'],
  [/\bavec\b/gi, 'with'],
  [/\bou\b(?!\w)/gi, 'or'],
  [/\bet\b(?!\w)/gi, 'and'],
  [/\bune?\b(?!\w)/gi, 'a'],
  [/\bles?\b(?!\w)/gi, 'the'],
  [/\bdu\b(?!\w)/gi, 'of the'],
  [/\bdes\b(?!\w)/gi, 'of the'],
  [/\bde\b(?!\w)/gi, 'of'],
  [/\bpar\b(?!\w)/gi, 'by'],
  [/\bsur\b(?!\w)/gi, 'on'],
  [/\bdans\b(?!\w)/gi, 'in'],
  [/\bsont\b(?!\w)/gi, 'are'],
  [/\best\b(?!\w)/gi, 'is'],
  [/\bc'est\b/gi, "it's"],
  [/\bce\b(?!\w)/gi, 'this'],
  [/\bcet\b(?!\w)/gi, 'this'],
  [/\bcette\b(?!\w)/gi, 'this'],
  [/\bqui\b(?!\w)/gi, 'that'],
  [/\bque\b(?!\w)/gi, 'that'],
  [/\bcomme\b(?!\w)/gi, 'as'],
  [/\bnon\b(?!\w)/gi, 'no'],
  [/\boui\b(?!\w)/gi, 'yes'],
  [/\btout\b(?!\w)/gi, 'all'],
  [/\btous\b(?!\w)/gi, 'all'],
  [/\bpas\b(?!\w)/gi, 'not'],
  [/\bplus\b(?!\w)/gi, 'more'],
  [/\btre\b/gi, ''],
];

let totalFixed = 0;

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  let content = fs.readFileSync(f, 'utf8');
  const original = content;

  for (const [pattern, replacement] of PATTERNS) {
    content = content.replace(pattern, replacement);
  }

  if (content !== original) {
    fs.writeFileSync(f, content, 'utf8');
    totalFixed++;
    console.log(`fixed: ${path.relative(ROOT, f)}`);
  }
}

console.log(`Total: ${totalFixed} files`);
