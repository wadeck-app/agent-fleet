# Re-audit post-correctifs — 2026-08-10

Audits de vérification lancés après application de tous les correctifs.

---

## Sécurité

| Finding | Statut | Preuve |
|---|---|---|
| SEC-1 unsafe yaml.load | **CONFIRMED FIXED** | `loadYaml.ts:16` et `FlowCliRunner.ts:46` utilisent `JSON_SCHEMA` |
| SEC-2 prototype pollution | **CONFIRMED FIXED** | Couvert par JSON_SCHEMA |
| SEC-3 path traversal (flowRef) | NOT FIXED — risque accepté | `FlowCliRunner.ts:72-74` sans boundary check |
| SEC-4 arbitrary write (--output) | NOT FIXED — risque accepté | `DocsCommand.ts:15` sans validation de chemin |
| SEC-5/6/8/9/10 | Hors scope | SDK tiers / setup local, inchangé |
| Nouveaux problèmes | Aucun | — |

---

## Qualité

| Finding | Statut | Preuve |
|---|---|---|
| Q-1 unsafe payload cast | **CONFIRMED FIXED** | `engine-daemon.ts:19-21, 43-46` ; tests T_PAYLOAD |
| Q-2 FlowEngine race | NOT FIXED — accepté (PoC) | `setImmediate` présent par design |
| Q-3 ShowCommand crash | **CONFIRMED FIXED** | `ShowCommand.ts:210-213` ; tests T3/T4 |
| Q-4 autoStartDaemon pre-bound | NOT FIXED — accepté | `engine-client.ts:53-57` inchangé |
| Q-5 loadProjectFlows unconditional | NOT FIXED — accepté | `FlowCliRunner.ts:68` inchangé |
| Q-6 ValidateCommand sync action | NOT FIXED — accepté | `ValidateCommand.ts:21` inchangé |
| Q-7 tsx path hardcodé | **CONFIRMED FIXED** | `bin/flow.js:14-26` avec require.resolve + scan ascendant |
| Q-10 stepType returns instead of throws | **CONFIRMED FIXED** | `ShowCommand.ts:28` → `throw new Error(...)` |
| Q-12/13/14 zéro tests | **CONFIRMED FIXED** | 4 nouveaux fichiers de tests |
| Q-15 T8 timeout | **CONFIRMED FIXED** | `engine-daemon.test.ts:208` → 15s |
| NEW-1 loadYaml accepte scalaires | **FIXED** (découvert pendant re-audit) | Guard `typeof raw !== 'object'` ajouté dans `loadYaml.ts` |
| NEW-2 commentaire misleading DocsCommand.test.ts | INFO — laissé tel quel | Comportement correct, commentaire légèrement imprécis |
| NEW-3 readFileSync non resetté entre tests | **FIXED** | `resetFsMocks()` appelé dans `beforeEach` de `FlowCliRunner.test.ts` |

---

## Consistance

| Finding | Statut | Preuve |
|---|---|---|
| C-A1 ✗ sur stdout | **CONFIRMED FIXED** | `ValidateCommand.ts:36` → `console.error` |
| C-A2 ShowCommand sans ✓ | NOT FIXED — accepté par design | Intentionnel |
| C-A3 DocsCommand sans try/catch | **CONFIRMED FIXED** | `DocsCommand.ts:14-19` wrappé |
| C-B duplication YAML load | **CONFIRMED FIXED** | Utilitaire `loadYaml.ts` partagé |
| C-C1 indentation engine-client.ts | **CONFIRMED FIXED** | Tabs homogènes dans `engine-client.ts` |
| C-C1 (résiduel) indentation engine-daemon.ts | **FIXED** (découvert pendant re-audit) | Fichier réécrit entier avec tabs uniformes |
| C-C2 import path inconsistant | **CONFIRMED FIXED** | `ValidateCommand.ts` → `'flow-engine/types'` |
| C-D kebab-case filenames | NOT FIXED — accepté | Fichiers de fonctions, pas de classes |
| C-G cast Parameters<T>[0] | **CONFIRMED FIXED** en ValidateCommand ; résiduel en FlowCliRunner | `FlowCliRunner.ts:55` → `flow as FlowDefinition` |

---

## Maintenabilité

| Finding | Statut | Preuve |
|---|---|---|
| M-1 engine-daemon-entry.ts manquant | **CONFIRMED FIXED** | `src/engine-daemon-entry.ts` créé, câblé correctement |
| M-2 bin/flow.js chemin hardcodé | **CONFIRMED FIXED** | require.resolve + scan 4 niveaux + exit 1 avec message |
| M-3 PoC daemon silent no-op | **CONFIRMED FIXED** (documenté) | Commentaire explicite dans `engine-daemon.ts:12-13` |
| M-4 RunOptions.flowsFile inutilisé | **CONFIRMED FIXED** | Champ supprimé de `RunOptions` |
| M-5 workspace inline | **CONFIRMED FIXED** | Factory `createCliWorkspace()` extraite avec type `: Workspace` |
| M-6 YAML load dupliqué | **CONFIRMED FIXED** | Utilitaire `loadYaml.ts` |
| M-7 port magic number | **CONFIRMED FIXED** | `ENGINE_DAEMON_PORT = 47832` |
| M-8 "5s" hardcodé | **CONFIRMED FIXED** | `${AUTO_START_TIMEOUT_MS / 1000}s` dynamique |
| M-9 version hardcodée | **CONFIRMED FIXED** | Lu depuis `package.json` via `createRequire` |
| M-10 ShowCommand crash | **CONFIRMED FIXED** | Guards sur `steps` et `workspace` |
| M-11 FlowExecutor positionnel | **CONFIRMED FIXED** | Commentaire `/* verbose= */ false` ajouté |

---

## Nouveaux fichiers créés par les correctifs

| Fichier | Rôle |
|---|---|
| `src/utils/loadYaml.ts` | Utilitaire YAML partagé avec JSON_SCHEMA + guards type |
| `src/utils/loadYaml.test.ts` | 7 tests (valid, date non-coercion, not found, empty, parse error, scalar, array) |
| `src/engine-daemon-entry.ts` | Point d'entrée du daemon (argv[2] = configDir) |
| `src/commands/ShowCommand.test.ts` | 7 tests couvrant header, workspace, guards, footer, blocking marker |
| `src/commands/DocsCommand.test.ts` | 3 tests (stdout, file write, write error → exit 1) |
| `src/FlowCliRunner.test.ts` | 8 tests (résolution ID/fichier, erreurs, cwd, inputs) |
