# CLI Status & Next Steps -- Implementation Plan

> Spec canonique : `.claude/specs/2026-08-22_15-59_cli-status-and-next/`
> Decisions D-1 a D-17 documentees dans la spec. Ce fichier est le plan d'execution.

---

## Etat des taches

### Terminees

| Tache | Description                                                                                      | Date       |
| ----- | ------------------------------------------------------------------------------------------------ | ---------- |
| T1    | `ConfigDir.get(appName)` parametre + `~/.config` sur Windows + `migrateIfNeeded`                 | 2026-08-22 |
| T2    | Validation end-to-end flow-cli + task-cli (`flow cli self-check` 7/7, `task cli self-check` 6/6) | 2026-08-22 |
| T3    | violations-framework CI : `npm pkg set version=` (evite EBADPLATFORM)                            | 2026-08-22 |
| T10   | Monorepo scrappers cree -- `@wadeck/shared-scrapper` (5 classes), 3 scrappers migres             | 2026-08-22 |

---

## Prochaines etapes

### Phase 1 -- Infrastructure partagee (debloque tout le reste)

#### T-NEW : Creer le repo `@wadeck/shared-cli`

- **Repo** : `C:\Workspace_Tooling\shared-cli` / `https://github.com/Wadeck/shared-cli`
- **Source** : migrer `packages/shared-cli/` depuis agent-fleet
- **Contenu additionnel** : documentation bonnes pratiques CLI, guiding principles, attentes
- **CI** : CalVer identique a flow-cli (`1.YYYYMMDDHHMMSS.BUILD`), publish GitLab registry
- **Breaking** : supprimer `packages/shared-cli/` de agent-fleet, updater les consumers (flow-cli, task-cli) pour dependre du package publie
- **Dependances** : aucune
- **Effort** : ~3h

#### T5 -- SDK singleton-daemon-kit : support XDG (breaking change)

- **Spec** : `.claude/specs/2026-08-22_15-59_cli-status-and-next/sdk-xdg.md`
- **Changement** : SDK calcule `~/.config/<appName>` au lieu de `~/.<defaultConfigDir>`; `--config <dir>` override preserve
- **Breaking** : consumers doivent mettre a jour `launcher.config.json` (`"defaultConfigDir": "flow"` au lieu de `"flow-cli"`)
- **Apres publish** : T6 (flow-cli/task-cli launcher.config.json), T9 (wdrive)
- **Effort** : ~2h SDK + publish CalVer

#### T6 -- flow-cli / task-cli : adopter XDG dans launcher.config.json

- **Changement** : `"defaultConfigDir": "flow-cli"` -> `"flow"` ; `"defaultConfigDir": "task-cli"` -> `"task"`
- **Dependances** : T5
- **Effort** : 10 min

---

### Phase 2 -- violations-framework (T4)

> Spec : `.claude/specs/2026-08-22_15-59_cli-status-and-next/violations-migration.md`

1. Ajouter `@wadeck/shared-cli` comme dependance
2. `scripts/bundle.ts` esbuild (pattern flow-cli) -> `dist-bundle/violations.cjs`
3. `tsc --noEmit` uniquement (plus d'emission de fichiers)
4. Remplacer `runVersionCheckInBackground()` par `UpdateManager.scheduleBackgroundUpdate()`
5. Cache version-check -> `~/.config/violations/` via `ConfigDir.get('violations')`
6. `package.json` bin -> `dist-bundle/violations.cjs`

- **Dependances** : T-NEW (shared-cli publie)
- **Effort** : ~3h

---

### Phase 3 -- wdrive (differee)

#### T7 -- wdrive Phase 1 : dead code cleanup

- `bundle.ts` : supprimer externals inutiles, `sharp` -> devDeps
- Supprimer fonctions systray deprecees
- **Dependances** : aucune (independant)
- **Effort** : ~2h

#### T8 -- SDK : `UpdateCmd` pour wdrive Windows update

- Nouveau champ dans launcher config ; launcher spawne la commande en detache (SW_HIDE) et exit avant que npm ecrase le `.exe`
- **Dependances** : T5 publie
- **Effort** : ~3h SDK + publish

#### T9 -- wdrive Phase 2 : migration npm complete

- **Spec** : `.claude/specs/2026-08-22_15-59_cli-status-and-next/wdrive-migration.md`
- Creer `@wadeck/wdrive` + 3 platform packages
- JS shim `bin/wdrive.js`
- Remplacer `Updater` custom par `UpdateManager` de shared-cli
- Migrer `~/.wdrive` -> `~/.config/wdrive` via `migrateIfNeeded('wdrive')`
- Supprimer GitHub Releases + PHP server upload
- **Dependances** : T5, T7, T8
- **Effort** : ~1j

---

### Phase 4 -- scrapers (differee)

#### T-SCRAPERS : Adopter shared-cli dans les scrappers

- Ajouter `@wadeck/shared-cli` comme dependance dans chaque scrapper
- Remplacer les chemins project-local par `ConfigDir.get('<scrapper-name>')`
- Data par defaut dans `~/.config/<name>/data/` (co-localise, configurable via `--data-dir`)
- **Dependances** : T-NEW
- **Effort** : ~2h

---

## Chemins cibles `~/.config/xxx` (toutes plateformes)

| CLI                | Actuel                | Cible                  | Statut            |
| ------------------ | --------------------- | ---------------------- | ----------------- |
| flow (Node bundle) | `~/.config/flow`      | `~/.config/flow`       | OK                |
| flow (launcher)    | `~/.flow-cli`         | `~/.config/flow`       | Attend T5+T6      |
| task (Node bundle) | `~/.config/task`      | `~/.config/task`       | OK (corrige T1)   |
| task (launcher)    | `~/.task-cli`         | `~/.config/task`       | Attend T5+T6      |
| wdrive             | `~/.wdrive`           | `~/.config/wdrive`     | Attend T5+T8+T9   |
| violations         | `.violations/.cache/` | `~/.config/violations` | Attend T4         |
| scrapers           | project-local         | `~/.config/<name>/`    | Attend T-SCRAPERS |

---

## Sequence

```
T-NEW (shared-cli repo)
    |
    +-> T5 (SDK XDG) -> T6 (flow/task launcher) -> T9 (wdrive npm)
    |                    |
    |                    T8 (SDK UpdateCmd) --+
    |                                         |
    +-> T4 (violations)              T7 (wdrive cleanup) -+-> T9
    |
    +-> T-SCRAPERS (scrapers ConfigDir)
```

T7 peut commencer immediatement (independant).

---

## TODO futur

- CI hook sur shared-cli pour notifier les consumers locaux qu'une nouvelle version est disponible (D-8)
- T-05 threat model : verifier que les CLIs ne tournent pas en root/admin dans le self-check
