# Audit initial — 2026-08-10

Quatre audits indépendants lancés en parallèle sur la version originale du code.

---

## Sécurité

| Sév.   | Fichier                                                              | Problème                                                                              |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| HIGH   | `FlowCliRunner.ts:34`, `ValidateCommand.ts:29`, `ShowCommand.ts:216` | `yaml.load()` sans `JSON_SCHEMA` — coercions de types YAML (Date, Buffer, etc.)       |
| HIGH   | Mêmes 3 fichiers                                                     | Pas de sanitisation des clés `__proto__`/`constructor` → prototype pollution possible |
| HIGH   | `FlowCliRunner.ts:61-63`, `RunCommand.ts:38-47`                      | Path traversal : `flowRef` non contraint → lecture arbitraire de fichiers             |
| MEDIUM | `DocsCommand.ts:14-16`                                               | `--output` sans validation → écriture arbitraire sur le filesystem                    |
| MEDIUM | SDK `health-server.js:114-123`                                       | `/version` non authentifié expose `config_dir`, `pid`, `port`                         |
| MEDIUM | `engine-client.ts:27-35`                                             | `configDir` non canonicalisé passé en argv au daemon                                  |
| MEDIUM | `engine-daemon.ts:17-29`                                             | Payload `run-flow`/`cancel` casté sans validation → état corrompu silencieux          |
| LOW    | SDK `health-server.js:93`                                            | `0o600` ignoré sur Windows → `health_token` lisible                                   |
| LOW    | `bin/flow.js:13`                                                     | `process.argv` brut forwardé (spawn, pas exec)                                        |
| LOW    | SDK `health-server.js:58-65`                                         | Pas de limite sur la taille du body HTTP → OOM possible                               |

**Décisions :** SEC-3 et SEC-4 (path traversal, --output) acceptés comme risques — CLI développeur local. SEC-5/6/8/9/10 hors scope (SDK tiers / setup local).

---

## Qualité

| Sév.   | Fichier                                                | Problème                                                                         |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| HIGH   | `engine-daemon.ts:18,39`                               | Cast `payload as {...}` sans runtime guard                                       |
| HIGH   | `engine-daemon.ts:26-30`                               | Race condition dans `setImmediate` (PoC, accepté)                                |
| HIGH   | `ShowCommand.ts:227`                                   | `raw as FlowDefinition` → crash TypeError si `workspace`/`steps` absents         |
| HIGH   | `engine-client.ts:55`                                  | Client retourné avant que le socket soit bound → ECONNREFUSED possible (accepté) |
| MEDIUM | `FlowCliRunner.ts:57`                                  | `loadProjectFlows()` inconditionnel (accepté)                                    |
| MEDIUM | `ValidateCommand.ts:21`                                | Action synchrone (accepté)                                                       |
| MEDIUM | `bin/flow.js:10`                                       | Chemin interne `tsx` hardcodé → casse sur upgrade                                |
| LOW    | `ShowCommand.ts:30`                                    | Fallback `return type` au lieu de `throw` — viole convention projet              |
| LOW    | `DocsCommand.ts:15`                                    | `writeFileSync` sans try/catch                                                   |
| LOW    | `RunCommand.ts:11,14`                                  | `parseInputs` appelle `process.exit` directement                                 |
| LOW    | `ShowCommand.ts`, `DocsCommand.ts`, `FlowCliRunner.ts` | Zéro tests unitaires                                                             |
| LOW    | `engine-daemon.test.ts:202`                            | T8 timeout trop serré (10s)                                                      |

---

## Consistance

| Sév.   | Fichier                                               | Problème                                                             |
| ------ | ----------------------------------------------------- | -------------------------------------------------------------------- |
| HIGH   | `engine-client.ts`, `engine-daemon.ts`                | Noms kebab-case (règle projet : PascalCase pour fichiers de classes) |
| MEDIUM | `ValidateCommand.ts:53`                               | Message `✗` sur stdout au lieu de stderr                             |
| MEDIUM | `ShowCommand.ts:214-226` = `ValidateCommand.ts:27-38` | Bloc YAML load dupliqué                                              |
| MEDIUM | `DocsCommand.ts:14-18`                                | Seule commande sans try/catch autour de l'I/O                        |
| LOW    | `ShowCommand.ts`                                      | Seule commande sans ligne `✓` sur succès (accepté par design)        |
| LOW    | `engine-client.ts`                                    | Indentation 2 espaces vs tabs partout ailleurs                       |
| LOW    | `ValidateCommand.ts:3`                                | Import type depuis `'flow-engine'` vs `'flow-engine/types'`          |
| LOW    | `ValidateCommand.ts:42`                               | Cast `Parameters<T>[0]` inutilement indirect                         |

**Décision :** C-D (renommage kebab → PascalCase) : la règle cible les fichiers de _classes exportées_ — `engine-client.ts` et `engine-daemon.ts` n'exportent que des fonctions. Skip justifié.

---

## Maintenabilité

| Sév.   | Fichier                                 | Problème                                                                 |
| ------ | --------------------------------------- | ------------------------------------------------------------------------ |
| HIGH   | `engine-client.ts:30`                   | `engine-daemon-entry.js` n'existe pas → `spawnDaemon` crash ENOENT       |
| HIGH   | `bin/flow.js:9-10`                      | Walk 3 niveaux hardcodé + chemin interne tsx                             |
| HIGH   | `engine-daemon.ts:17-44`                | Daemon PoC retourne `status: 'started'` sans exécuter — no-op silencieux |
| MEDIUM | `FlowCliRunner.ts:13`                   | `RunOptions.flowsFile` documenté mais jamais utilisé                     |
| MEDIUM | `FlowCliRunner.ts:76-84`                | `workspace` construit inline avec `usageCount` hors interface            |
| MEDIUM | `ShowCommand.ts` + `ValidateCommand.ts` | Bloc YAML load dupliqué                                                  |
| MEDIUM | `engine-daemon.ts:58`                   | Port `47832` magic number                                                |
| MEDIUM | `engine-client.ts:59`                   | Message d'erreur hardcode `"5s"`                                         |
| LOW    | `cli.ts:10`                             | Version `'1.0.0'` hardcodée                                              |
| LOW    | `ShowCommand.ts:227`                    | Pas de validation avant rendu                                            |
| LOW    | `FlowCliRunner.ts:26`                   | `FlowExecutor(false, registry)` positionnel sans commentaire             |
