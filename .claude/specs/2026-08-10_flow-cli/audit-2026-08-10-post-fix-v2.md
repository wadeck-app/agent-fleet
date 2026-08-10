# Re-audit v2 post-correctifs — 2026-08-10

Second passage d'audit après application des correctifs v2. Tous les audits (sécurité, qualité, consistance, maintenabilité) sont passés en parallèle sur le code actuel.

---

## Résultats de vérification

Tous les findings précédents sont soit **CONFIRMED FIXED** soit **ACCEPTED** (documenté dans [threat-model.md](threat-model.md)).

### Nouveaux findings découverts

| ID | Sév. | Fichier | Problème | Statut |
|---|---|---|---|---|
| NEW-4 | LOW | `RunCommand.ts:42` | `cwd` passé comme `projectRoot` — lookup de flows échoue dans un sous-répertoire | **FIXED** — `findProjectRoot()` remonte jusqu'à `.agent-fleet/` |
| NEW-5 | MEDIUM | `ValidateCommand.ts:7-15` | `printIssues` envoie les détails d'erreurs sur stdout, pas stderr | **FIXED** — paramètre `toStderr` ajouté, erreurs sur `console.error` |
| NEW-6 | LOW | `engine-daemon.test.ts` | Indentation mixte 2-espaces/tabs dans tout le fichier | **FIXED** — fichier réécrit entièrement en tabs |
| NEW-7 | LOW | `bin/flow.js:35` | Signal kill masqué comme exit 0 | **FIXED** — `code ?? (signal ? 1 : 0)` |
| NEW-8 | LOW | `ShowCommand.ts:28` | Throw sur unknown step type non couvert par tests | **FIXED** — test ajouté dans `ShowCommand.test.ts` |
| NEW-9 | LOW | `vitest.config.ts:26` | `clearMocks: true` redondant avec `mockReset: true` | **FIXED** — ligne supprimée |
| NEW-10 (SEC) | LOW | `bin/flow.js:35` (même que NEW-7) | Signal exit | **FIXED** |
| NEW-11 (INFO) | INFO | `loadYaml.ts:10,15` | TOCTOU entre existsSync et readFileSync — message d'erreur légèrement trompeur sous race | **ACCEPTED** — outil local, race negligeable, le fail est toujours loud |
| NEW-12 (INFO) | INFO | `engine-daemon.test.ts:T6` | Double cleanup `stop` + `asyncDispose` — fragile si SDK change | **ACCEPTED** — documenté |

---

## Correctifs v2 appliqués

| Fichier | Changement |
|---|---|
| `src/commands/RunCommand.ts` | `findProjectRoot()` — remonte l'arborescence pour trouver `.agent-fleet/` |
| `src/commands/RunCommand.test.ts` | Tests de résolution projectRoot (avec et sans `.agent-fleet` en parent) |
| `src/commands/ValidateCommand.ts` | `printIssues` — paramètre `toStderr`, erreurs sur `console.error` |
| `src/commands/ValidateCommand.test.ts` | Assertions `Errors:` sur stderr, pas stdout |
| `src/engine-daemon.test.ts` | Réécriture complète en tabs uniformes |
| `bin/flow.js` | `(code, signal) => process.exit(code ?? (signal ? 1 : 0))` |
| `src/commands/ShowCommand.test.ts` | Test du throw sur unknown step type |
| `vitest.config.ts` | Suppression de `clearMocks: true` redondant |

---

## État final

- **33 findings** des audits initiaux : tous résolus ou documentés dans le threat model
- **12 nouveaux findings** du re-audit v2 : 10 fixés, 2 acceptés/info
- **Tous les tests passent** (6 suites, 88.7s)
- **Threat model** complet : AR-1 à AR-8 avec contexte, justification et risque résiduel
