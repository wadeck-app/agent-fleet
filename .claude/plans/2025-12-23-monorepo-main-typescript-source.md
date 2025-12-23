# Plan : Pointer "main" vers TypeScript source pour monorepo interne

**Date** : 2025-12-23
**Status** : À faire (une fois le projet stable)
**Raison** : Simplifier le dev en éliminant la nécessité de watcher explicitement les packages workspace

## Context

Actuellement, les packages workspace (orchestrator, orchestrator-adapters, shared-\*, flow-engine) pointent leur "main" vers `./dist/index.js` (code compilé). Ceci oblige à :

1. Lister explicitement les watch paths dans `nodemon.json`
2. Maintenir deux listes en sync (package.json dependencies vs nodemon.json watch)

## Solution

Changer "main" dans tous les packages workspace vers `./src/index.ts` (TypeScript source).

### Avantages

- En dev : tsx lit directement le source, détecte les changements, nodemon relance automatiquement
- Pas besoin de watcher explicitement les autres packages
- Aligned avec la pratique des gros monorepos internes (Meta, Google, Airbnb)
- Simplifie le dev experience

### Impact

- **Dev** : Simplifié, nodemon.json peut se limiter à `src`
- **Prod** : Aucun impact - esbuild compile et bundle le TypeScript source pareil
- **Packages à modifier** :
    - packages/orchestrator/package.json
    - packages/orchestrator-adapters/package.json
    - packages/shared-common/package.json
    - packages/shared-orch-worker/package.json
    - packages/shared-frontend-backend/package.json
    - packages/flow-engine/package.json

### Tasks

- [ ] Vérifier que tous les packages ont un `src/index.ts` valide
- [ ] Changer "main" de "./dist/index.js" à "./src/index.ts" dans tous les package.json
- [ ] Simplifier nodemon.json (enlever les watch paths des autres packages)
- [ ] Tester en dev que les changements dans les packages sont bien détectés
- [ ] Tester le build prod qu'il fonctionne toujours correctement
