'use strict';
/**
 * Comprehensive French word replacement for remaining violations
 * Focuses on documentation, comments, and test files
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Workspace_Tooling/agent-fleet';

// Files to fix (from get-french-files.cjs output)
const FILES = [
  'packages/e2e-web/fixtures/ingredientFixtures.ts',
  'packages/e2e-web/fixtures/recipeFixtures.ts',
  'packages/e2e-web/utils/apiHelpers.ts',
  'packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts',
  'packages/web-frontend/src/app/pages/flows/flow-editor/docs/reference.md',
  'packages/web-frontend/src/app/pages/flows/flow-editor/README.md',
  'packages/web-frontend/src/app/pages/ingredients/__tests__/docs/reference.md',
  'packages/web-frontend/src/app/pages/ingredients/__tests__/README.md',
  'packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.test.tsx',
  'packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx',
  'packages/web-frontend/src/app/pages/_lego/ANALYSIS.md',
  'packages/web-frontend/src/framework/components/columns/ColumnVisibility.tsx',
  'packages/web-frontend/src/framework/components/layout/Page.tsx',
  'packages/web-frontend/src/test/utils/asyncUtils.ts',
];

// Accent chars
const ACCENTS = {
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
const ACCENT_RE = new RegExp(Object.keys(ACCENTS).join('|'), 'g');

// Comprehensive word/phrase replacements
const REPLACEMENTS = [
  // Documentation headers/phrases
  [/\bFixtures? pour les tests d[e']/gi, 'Fixtures for tests'],
  [/\bFixtures? pour les tests\b/gi, 'Test fixtures'],
  [/\b([Pp])age principale\b/g, '$1ain page'],
  [/\bBarre d'outils\b/gi, 'Toolbar'],
  [/\bPanneau de propri[e\u00e9]t[e\u00e9]s\b/gi, 'Properties panel'],
  [/\bPanneau de validation\b/gi, 'Validation panel'],
  [/\bTypes TypeScript\b/gi, 'TypeScript types'],
  [/\bNode pour ([a-z ]+) step\b/gi, 'Node for $1 step'],
  [/\bEdge pour ([a-z ]+)\b/gi, 'Edge for $1'],
  [/\bExport des ([a-z ]+) types\b/gi, 'Export $1 types'],
  [/\bHook principal\b/gi, 'Main hook'],
  [/\bHook de validation\b/gi, 'Validation hook'],
  [/\bS[e\u00e9]rialisation/gi, 'Serialization'],
  [/\bAlgorithmes? de layout\b/gi, 'Layout algorithms'],
  [/\bUtilitaire classnames\b/gi, 'Classnames utility'],
  [/\bCette documentation\b/gi, 'This documentation'],
  [/\bBibliotheque de graphs interactifs\b/gi, 'Interactive graph library'],
  [/\bAlgorithme de layout hi[e\u00e9]rarchique\b/gi, 'Hierarchical layout algorithm'],
  [/\bTechnologies\b/g, 'Technologies'],
  // French comment patterns in code
  [/\/\/ Seulement\b/gi, '// Only'],
  [/\/\/ Retourner/gi, '// Return'],
  [/\/\/ Retourne/gi, '// Returns'],
  [/\/\/ Obtenir/gi, '// Get'],
  [/\/\/ Ajouter/gi, '// Add'],
  [/\/\/ Supprimer/gi, '// Delete'],
  [/\/\/ Mettre \u00e0 jour/gi, '// Update'],
  [/\/\/ Mettre a jour/gi, '// Update'],
  [/\/\/ Creer/gi, '// Create'],
  [/\/\/ Cr[e\u00e9]er/gi, '// Create'],
  [/\/\/ Afficher/gi, '// Display'],
  [/\/\/ V[e\u00e9]rifier/gi, '// Check'],
  [/\/\/ Verifier/gi, '// Check'],
  [/\/\/ T[e\u00e9]l[e\u00e9]charger/gi, '// Download'],
  [/\/\/ Telecharger/gi, '// Download'],
  [/\/\/ Envoyer/gi, '// Send'],
  [/\/\/ Fermer/gi, '// Close'],
  [/\/\/ Ouvrir/gi, '// Open'],
  [/\/\/ Initialiser/gi, '// Initialize'],
  [/\/\/ R[e\u00e9]initialiser/gi, '// Reset'],
  [/\/\/ Reinitialiser/gi, '// Reset'],
  [/\/\/ [Ss][e\u00e9]lectionner/gi, '// Select'],
  [/\/\/ [Ss]electionner/gi, '// Select'],
  [/\/\/ [Ff]iltrer/gi, '// Filter'],
  [/\/\/ [Tt]rier/gi, '// Sort'],
  [/\/\/ [Cc]hercher/gi, '// Search'],
  [/\/\/ [Rr]enommer/gi, '// Rename'],
  [/\/\/ [Cc]opier/gi, '// Copy'],
  [/\/\/ [Cc]oller/gi, '// Paste'],
  [/\/\/ [Dd][e\u00e9]placer/gi, '// Move'],
  [/\/\/ [Rr]edimensionner/gi, '// Resize'],
  // French ingredient names (data fixtures)
  [/'Poulet'/g, "'Chicken'"], [/`Poulet`/g, '`Chicken`'],
  [/'Farine'/g, "'Flour'"], [/`Farine`/g, '`Flour`'],
  [/'Sucre'/g, "'Sugar'"], [/`Sucre`/g, '`Sugar`'],
  [/'Sel'/g, "'Salt'"], [/`Sel`/g, '`Salt`'],
  [/'Poivre'/g, "'Pepper'"], [/`Poivre`/g, '`Pepper`'],
  [/'Tomate[s]?'/g, "'Tomato'"],
  [/'Lait'/g, "'Milk'"],
  [/'Oeuf[s]?'/g, "'Egg'"],
  [/'Beurre'/g, "'Butter'"],
  [/'Huile'/g, "'Oil'"],
  [/'Levure'/g, "'Yeast'"],
  [/'Fraise[s]?'/g, "'Strawberry'"],
  [/'Pomme[s]?'/g, "'Apple'"],
  [/'Poire[s]?'/g, "'Pear'"],
  [/'Banane[s]?'/g, "'Banana'"],
  [/'Citron[s]?'/g, "'Lemon'"],
  [/'Orange[s]?'/g, "'Orange'"],
  // Recipe names
  [/'Gateau[x]? au chocolat'/gi, "'Chocolate Cake'"],
  [/'Tarte[s]? aux pommes'/gi, "'Apple Pie'"],
  [/'Salade[s]? verte[s]?'/gi, "'Green Salad'"],
  [/'Poulet roti'/gi, "'Roast Chicken'"],
  [/'Crepe[s]?'/gi, "'Crepes'"],
  [/'Pain'/g, "'Bread'"],
  [/'Quiche[s]? lorraine'/gi, "'Quiche Lorraine'"],
  [/'Omelette[s]?'/gi, "'Omelette'"],
  // Common French words in code
  [/\bcreer\b/gi, 'create'],
  [/\bajouter\b/gi, 'add'],
  [/\bsupprimer\b/gi, 'delete'],
  [/\bmodifier\b/gi, 'modify'],
  [/\bafficher\b/gi, 'display'],
  [/\bchercher\b/gi, 'search'],
  [/\bobtenir\b/gi, 'get'],
  [/\benvoyer\b/gi, 'send'],
  [/\bfermer\b/gi, 'close'],
  // Documentation French phrases
  [/\bCette page\b/gi, 'This page'],
  [/\bCe composant\b/gi, 'This component'],
  [/\bCe hook\b/gi, 'This hook'],
  [/\bCe fichier\b/gi, 'This file'],
  [/\bCe module\b/gi, 'This module'],
  [/\bLe composant\b/gi, 'The component'],
  [/\bLe hook\b/gi, 'The hook'],
  [/\bLe fichier\b/gi, 'The file'],
  [/\bLes tests\b/gi, 'The tests'],
  [/\bLes fixtures?\b/gi, 'The fixtures'],
  [/\bPour les tests\b/gi, 'For tests'],
  [/\bPour plus d'informations?\b/gi, 'For more information'],
  [/\bVoir aussi\b/gi, 'See also'],
  [/\bVoir la\b/gi, 'See the'],
  [/\bNote:/gi, 'Note:'],
  [/\bImportant:/gi, 'Important:'],
  // ANALYSIS.md specific
  [/Analyse\b/gi, 'Analysis'],
  [/[Oo]bjectif\b/gi, 'Objective'],
  [/[Rr][e\u00e9]sum[e\u00e9]\b/gi, 'Summary'],
  [/[Cc]onclusion\b/gi, 'Conclusion'],
  [/[Rr]ecommandations?\b/gi, 'Recommendations'],
  [/[Pp]robleme\b/gi, 'Problem'],
  [/[Ss]olution\b/gi, 'Solution'],
  [/[Aa]vantages?\b/gi, 'Advantages'],
  [/[Ii]nconv[e\u00e9]nients?\b/gi, 'Disadvantages'],
  [/[Cc]hoix\b/gi, 'Choice'],
  [/[Dd]ecision\b/gi, 'Decision'],
  [/[Ii]mplementation\b/gi, 'Implementation'],
  [/[Aa]rchitecture\b/gi, 'Architecture'],
  [/[Pp]erformance\b/gi, 'Performance'],
  [/[Ss][e\u00e9]curit[e\u00e9]\b/gi, 'Security'],
  [/[Mm]aintenance\b/gi, 'Maintenance'],
  [/[Ee]volution\b/gi, 'Evolution'],
  [/[Cc]ommentaires?\b/gi, 'Comments'],
  [/[Ee]xemples?\b/gi, 'Examples'],
  [/[Uu]tilisation\b/gi, 'Usage'],
  [/[Tt]ype de\b/gi, 'Type of'],
  [/[Nn]om de\b/gi, 'Name of'],
  [/[Vv]aleur de\b/gi, 'Value of'],
  [/[Ll]iste de\b/gi, 'List of'],
  [/[Cc]alories?\b/gi, 'Calories'],
  // API helpers
  [/\bCr[e\u00e9]ation/gi, 'Creation'],
  [/\bCreation\b/gi, 'Creation'],
  [/\bMise \u00e0 jour\b/gi, 'Update'],
  [/\bMise a jour\b/gi, 'Update'],
  [/\bR[e\u00e9]cup[e\u00e9]ration\b/gi, 'Retrieval'],
  [/\bRecuperation\b/gi, 'Retrieval'],
  [/\bSuppression\b/gi, 'Deletion'],
  [/\bRecherchepar\b/gi, 'SearchBy'],
  [/\bListe compl[e\u00e8]te\b/gi, 'Complete list'],
  [/\bListe complete\b/gi, 'Complete list'],
  [/\bUtilisateur\b/gi, 'User'],
  [/\bIngr[e\u00e9]dient\b/gi, 'Ingredient'],
  [/\bIngredient\b/gi, 'Ingredient'],
  [/\bRecette\b/gi, 'Recipe'],
  [/\bTableau\b/gi, 'Table'],
  [/\bColonne\b/gi, 'Column'],
  [/\bBouton\b/gi, 'Button'],
  [/\bFormulaire\b/gi, 'Form'],
  [/\bChamp\b/gi, 'Field'],
  [/\bEtiquette\b/gi, 'Label'],
  [/\bMessage\b/gi, 'Message'],
  [/\bErreur\b/gi, 'Error'],
  [/\bSucc[e\u00e8]s\b/gi, 'Success'],
  [/\bSucces\b/gi, 'Success'],
  [/\bChargement\b/gi, 'Loading'],
  [/\bAttente\b/gi, 'Waiting'],
  [/\bConnexion\b/gi, 'Connection'],
  [/\bDeconnexion\b/gi, 'Disconnection'],
  [/\bAuth[e\u00e9]ntification\b/gi, 'Authentication'],
  [/\bAuthentification\b/gi, 'Authentication'],
  [/\bAutorisations?\b/gi, 'Authorization'],
  [/\bPermissions?\b/gi, 'Permission'],
  // Page/layout
  [/\bConteneur\b/gi, 'Container'],
  [/\bEnveloppe\b/gi, 'Wrapper'],
  [/\bMise en page\b/gi, 'Layout'],
  [/\bGabarit\b/gi, 'Template'],
  [/\bMenus?\b/gi, 'Menu'],
  [/\bNavigation\b/gi, 'Navigation'],
  [/\bBreadcrumb\b/gi, 'Breadcrumb'],
  [/\bFooter\b/gi, 'Footer'],
  [/\bHeader\b/gi, 'Header'],
  [/\bSidebar\b/gi, 'Sidebar'],
  // ColumnVisibility specific
  [/\bVisibilit[e\u00e9] des colonnes\b/gi, 'Column visibility'],
  [/\bVisibilite des colonnes\b/gi, 'Column visibility'],
  [/\bMasquer\b/gi, 'Hide'],
  [/\bAfficher\b/gi, 'Show'],
  [/\bTri\b/gi, 'Sort'],
  [/\bFiltre\b/gi, 'Filter'],
  [/\bColonnes? visibles?\b/gi, 'Visible columns'],
  [/\bColonnes? masqu[e\u00e9]es?\b/gi, 'Hidden columns'],
  [/\bColonnes? masquees?\b/gi, 'Hidden columns'],
  [/\bRe[e\u00e9]initialiser\b/gi, 'Reset'],
  [/\bReinitialiser\b/gi, 'Reset'],
  // async utils
  [/\bAttendre\b/gi, 'Wait'],
  [/\bD[e\u00e9]lai\b/gi, 'Delay'],
  [/\bDelai\b/gi, 'Delay'],
  [/\bTimeout\b/gi, 'Timeout'],
  [/\bIntervalles?\b/gi, 'Interval'],
  [/\bR[e\u00e9]essayer\b/gi, 'Retry'],
  [/\bReessayer\b/gi, 'Retry'],
  [/\bNombre de tentatives?\b/gi, 'Number of attempts'],
  [/\bTentatives?\b/gi, 'Attempt'],
  // test dialog
  [/\bNouvelle t\u00e2che\b/gi, 'New task'],
  [/\bNouvelle tache\b/gi, 'New task'],
  [/\bT\u00e2che cr\u00e9\u00e9e\b/gi, 'Task created'],
  [/\bTache creee\b/gi, 'Task created'],
  [/\bTitre\b/gi, 'Title'],
  [/\bDescription\b/gi, 'Description'],
  [/\bPriorit[e\u00e9]\b/gi, 'Priority'],
  [/\bPriorite\b/gi, 'Priority'],
  [/\b[Ss]tatut\b/gi, 'Status'],
  [/\bType\b/gi, 'Type'],
  [/\bCategorie\b/gi, 'Category'],
  [/\bCat[e\u00e9]gorie\b/gi, 'Category'],
  [/\bAssign[e\u00e9] \u00e0\b/gi, 'Assigned to'],
  [/\bAssigne a\b/gi, 'Assigned to'],
  // Canvas/flow editor
  [/\bCanvas\b/g, 'Canvas'],
  [/\bN[oe\u0153]ud\b/gi, 'Node'],
  [/\bArcs?\b/gi, 'Edge'],
  [/\bLiens?\b/gi, 'Link'],
  [/\bConnections?\b/gi, 'Connection'],
  [/\bD[e\u00e9]placements?\b/gi, 'Movement'],
  [/\bZoom\b/gi, 'Zoom'],
  [/\bPan\b/gi, 'Pan'],
  [/\bS[e\u00e9]lection\b/gi, 'Selection'],
  [/\bCopier\/Coller\b/gi, 'Copy/Paste'],
  [/\bAnnuler\/R[e\u00e9]tablir\b/gi, 'Undo/Redo'],
];

let totalFixed = 0;

for (const rel of FILES) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) continue;
  let content = fs.readFileSync(f, 'utf8');
  const original = content;

  // Replace accented chars first
  content = content.replace(ACCENT_RE, c => ACCENTS[c] || c);

  // Apply French->English replacements
  for (const [pattern, replacement] of REPLACEMENTS) {
    content = content.replace(pattern, replacement);
  }

  if (content !== original) {
    fs.writeFileSync(f, content, 'utf8');
    totalFixed++;
    console.log(`fixed: ${rel}`);
  }
}

console.log(`\nTotal: ${totalFixed} files`);
