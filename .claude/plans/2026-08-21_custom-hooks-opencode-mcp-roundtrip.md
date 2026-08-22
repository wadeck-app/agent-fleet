# Plan : Custom hooks + OpenCode MCP tool_call roundtrip

**Date:** 2026-08-21 (mis à jour 2026-08-22)
**Objectif:** Supporter les hooks custom (pre/post tool) pour Claude et OpenCode, et exposer les events tool_use d'OpenCode dans le flow engine.

## Contexte — Findings POC

- **OpenCode MCP** : OpenCode appelle les MCP servers **directement** — pas de roundtrip nécessaire depuis le flow engine. Il émet un event `tool_use` après complétion, ignoré par `processLine()`.
- **OpenCode NDJSON `tool_use`** : `{ type: "tool_use", part: { tool: "server_tool", callID, state: { status: "completed", input, output } } }`
- **Séquence** : `step_start → tool_use(completed) → step_finish(reason:"tool-calls") → step_start → text → step_finish(stop)`
- **Bug Windows** : les paths MCP doivent être en forward slashes Windows (`C:/App/nodejs/node.exe`), pas POSIX — `server status=failed` sinon
- **Claude `--settings`** : confirmé — accepte fichier ou JSON string, supporte les hooks. `--include-hook-events` inclut les events hooks dans le stream.
- **OpenCode hooks** : pas de clé `hooks` dans le JSON config — mais système de **plugins JS** dans `.opencode/plugins/` avec `tool.execute.before` / `tool.execute.after`

## Phase 1 — OpenCode : exposer les events `tool_use` dans le flow engine

**Objectif** : que le flow engine reçoive les tool_use events (observabilité, HITL futur, step insertion).

- [ ] Ajouter handler `tool_use` dans `OpenCodeModelProvider.processLine()`
    - Parser le `part.state` (status, input, output, tool name)
    - Émettre via `onStreamEvent` avec un type dédié `tool_use`
- [ ] Corriger le bug Windows dans `buildOpenCodeConfig` : convertir les paths MCP avec `path.replace(/\\/g, '/')`
- [ ] Ajouter simulation `tool_use` dans `opencode-mock.mjs` (avec `step_finish(reason:"tool-calls")`)
- [ ] Ajouter tests d'intégration dans `StepRunner.opencode.integration.test.ts`

**Fichiers impactés :**

- `packages/flow-engine/src/processing/OpenCodeModelProvider.ts`
- `packages/flow-engine/src/executor/mocks/opencode-mock.mjs`
- `packages/flow-engine/src/executor/StepRunner.opencode.integration.test.ts`

## Phase 2 — Claude : hooks injection via `--settings`

**Objectif** : pouvoir passer des hooks custom (pre/post tool) à chaque subprocess Claude.

- [ ] Ajouter `customHooks?: ClaudeHookConfig[]` dans `LaunchOptions` (types.ts)
- [ ] Dans `ClaudeLauncher` : générer un fichier temp settings JSON avec les hooks, passer `--settings <path>` + `--include-hook-events`
- [ ] Cleanup du fichier temp dans `finally`
- [ ] Ajouter parsing des hook events dans `StreamEventMapper` si `--include-hook-events` activé

**Fichiers impactés :**

- `packages/flow-engine/src/types.ts`
- `packages/flow-engine/src/processing/ClaudeLauncher.ts`
- `packages/flow-engine/src/processing/ClaudeModelProvider.ts`
- `packages/flow-engine/src/processing/StreamEventMapper.ts`

## Phase 3 — OpenCode : isolation subprocess + hooks via plugin npm

**Objectif** : isoler chaque subprocess OpenCode (parallel runs) et pouvoir injecter des hooks pre/post tool.

### 3a — Isolation via `XDG_CONFIG_HOME` (prérequis)

- [ ] Générer un `tempDir` unique par spawn (ex: `os.tmpdir()/opencode-run-<uuid>`)
- [ ] Passer `XDG_CONFIG_HOME=<tempDir>` dans `options.env` du subprocess
- [ ] Cleanup du `tempDir` dans `finally`
- [ ] `OPENCODE_CONFIG_DIR` est **additif** (non isolant) — ne pas utiliser pour l'isolation

> Note : `XDG_CONFIG_HOME` remplace complètement `~/.config/opencode/`. Confirmé sur Windows.

### 3b — Hooks via plugin npm (effort élevé)

> **Contrainte découverte** : les plugins OpenCode sont des **npm packages**, pas des fichiers JS bruts. Un `.mjs` placé dans `.opencode/plugins/` est ignoré silencieusement.

Options :

1. **Package npm local** : créer `packages/opencode-hook-plugin/` dans le monorepo, `npm install <path>` dans le `tempDir` avant spawn → le plus propre, réutilisable
2. **`npm install` à la volée** : lent, dépendance réseau potentielle

- [ ] Créer `packages/opencode-hook-plugin/` (package npm minimal avec `tool.execute.before/after`)
- [ ] Lors du spawn : `npm install --prefix <tempDir>/opencode <path/to/plugin>` dans le `tempDir`
- [ ] Passer le nom du package dans `plugin: [...]` de `OPENCODE_CONFIG_CONTENT`

**Fichiers impactés :**

- `packages/flow-engine/src/processing/OpenCodeModelProvider.ts`
- `packages/flow-engine/src/types.ts`
- `packages/opencode-hook-plugin/` (nouveau package)

## Phase 4 — Tests & validation

- [ ] Flow test end-to-end OpenCode + MCP server réel (tool_use event reçu et traité)
- [ ] Test hook `tool.execute.before` OpenCode via plugin temp
- [ ] Test hook pre/post tool Claude via `--settings`
- [ ] Mise à jour `kb/lessons-learned.md` avec findings OpenCode NDJSON + Windows path bug

## Décisions résolues

| Question                                 | Réponse                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Format NDJSON OpenCode pour tool calls ? | Event `tool_use` après complétion, pas de roundtrip                             |
| `claude --settings` supporté ?           | OUI — fichier ou JSON string                                                    |
| OpenCode hooks dans config JSON ?        | NON — mais plugin JS dans `.opencode/plugins/` avec `tool.execute.before/after` |
