# Plan: Persist gitBranch in Workspace Metadata

**Date:** 2026-02-26

## Context

`gitBranch` n'est actuellement disponible que via le worker connecté (`workerInfo?.gitBranch`). Sans worker, le champ est `undefined` et la branche n'est pas affichée dans `WorkspacePanel`.

La branche est une propriété du dossier git du workspace (pas du worker). Elle doit donc être stockée dans les métadonnées du workspace pour être disponible quel que soit l'état du worker.

## Root Cause

Dans `WorkspaceMapper.mapEntityToApi()` (ligne 32) :
```ts
gitBranch: workerInfo?.gitBranch,  // undefined si pas de worker
```
`WorkspaceMetadataEntitySchema` ne contient pas `gitBranch` → jamais persisté.

De plus, à la création d'un workspace, le `gitBranch` issu de `WorkspaceCreationService` est passé via un faux `workerInfo` (ligne 307-309 dans `WorkspacesService`) mais n'est **pas persisté** dans l'entité.

## Approach

Ajouter `gitBranch` aux métadonnées persistées et le renseigner à 3 moments :
1. **Création** : déjà connu depuis `WorkspaceCreationService.createWorkspace()`, juste à persister
2. **Worker connect** : quand `workerInfo.gitBranch` diffère de la valeur stockée → mise à jour fire-and-forget
3. **Lazy init** : lors du listing, si `entity.gitBranch` est null et aucun worker connecté → lecture filesystem synchrone via `WorkspaceGitService.getGitState()` + persist

Dans `WorkspaceMapper`, utiliser `workerInfo?.gitBranch ?? entity.gitBranch` pour que la valeur persistée serve de fallback.

## Files to Modify

### 1. `packages/shared-frontend-backend/src/api/workspaces.contract.ts`
- Ajouter `gitBranch: z.string().optional()` dans `WorkspaceMetadataEntitySchema` (après `mode`)

### 2. `packages/web-backend/src/repositories/WorkspaceMetadataRepository.ts`
- Étendre le `Pick` dans `update()` (ligne 76) : ajouter `'gitBranch'`
- Idem dans `upsertByPath()` (ligne 90)

### 3. `packages/web-backend/src/services/WorkspaceMapper.ts`
- Changer ligne 32 :
  ```ts
  // Before:
  gitBranch: workerInfo?.gitBranch,
  // After:
  gitBranch: workerInfo?.gitBranch ?? entity.gitBranch,
  ```

### 4. `packages/web-backend/src/services/WorkspacesService.ts`
- Ajouter `WorkspaceGitService` comme dépendance (instancier dans le constructeur, même pattern que `WorkspaceCreationService`)
- **`createWorkspace()`** : après `metadataRepository.create()`, si `gitBranch` est défini, appeler `metadataRepository.update(entity.id, { gitBranch })` et supprimer le faux `workerInfo` passé au mapper
- **`buildWorkerInfoMap()`** : supprimer le cast `(ww as any).gitBranch` — vérifier si le type de retour de `getConnectedWorkersWorkspaces()` inclut déjà `gitBranch?` (oui d'après l'exploration), sinon typer correctement
- **Nouvelle méthode privée `refreshGitBranchesAsync()`** :
  ```ts
  private refreshGitBranchesAsync(
    entities: WorkspaceMetadataEntity[],
    workerByPath: Map<string, WorkerInfo>
  ): void {
    // Fire-and-forget: pour chaque entité, si worker a gitBranch différente → update
    // Si pas de worker et gitBranch null → lire filesystem via getGitState()
    // Swallow errors silently
  }
  ```
- Appeler `refreshGitBranchesAsync()` dans `getWorkspacesData()` et `getWorkspacesList()` après l'étape de mapping (fire-and-forget, pas d'await)
- Pour le **lazy init** (entities sans gitBranch et sans worker) : lire `getGitState()` **synchrone** dans le flow principal pour que la réponse courante contienne la valeur (première fois seulement, ensuite c'est stocké)

## Lazy init flow in getWorkspacesData / getWorkspacesList

```
entities without gitBranch AND without connected worker
  → Promise.all(getGitState(entity.path))
  → metadataRepository.update(id, { gitBranch: state.branch }) [fire-and-forget]
  → use state.branch in current response
```

```
entities with gitBranch from worker AND differs from entity.gitBranch
  → metadataRepository.update(id, { gitBranch }) [fire-and-forget]
```

## No Frontend Changes

Le frontend affiche déjà `workspace.gitBranch` quand il est défini (`WorkspacePanel.tsx:127`).

## Verification

1. Démarrer le backend
2. Appeler `GET /api/workspaces/` — vérifier que WS1 et WS2 ont `gitBranch` renseigné (lecture filesystem lazy)
3. Vérifier `data/workspaces.json` — les entrées doivent maintenant avoir le champ `gitBranch`
4. Accéder à `http://localhost:5030/projects-v2?...&workspaceId=<WS1>` — la branche doit s'afficher
5. Lancer `npm run test:agent` — tous les tests passent
6. Lancer skill `check` — aucune erreur TypeScript
