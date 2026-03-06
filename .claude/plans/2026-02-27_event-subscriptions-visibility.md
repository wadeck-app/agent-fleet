# Plan: Event Subscriptions Visibility

**Date:** 2026-02-27
**Status:** ✅ COMPLETE

---

## Objectif

Surfacer les event subscriptions actives dans l'UI (Workers page) pour aider au debug "pourquoi mon flow ne s'est pas déclenché ?".

---

## Backend Changes

### 1. `packages/shared-frontend-backend/src/api/workers.contract.ts` ✅

- Ajout `EventSubscriptionSchema`, `EventSubscriptionItem`, `EventSubscriptionsResponseSchema`, `EventSubscriptionsResponse`
- Ajout route `GET /api/workers/event-subscriptions` dans `WORKERS_API_ROUTES`

### 2. `packages/web-backend/src/services/WorkersService.ts` ✅

- Ajout `getEventSubscriptions()` — lit depuis `EventSubscriptionRegistry`
- Strip des valeurs `undefined` (wildcards orchestrator) avant retour API

### 3. `packages/web-backend/src/controllers/WorkersController.ts` ✅

- Route `GET /api/workers/event-subscriptions` ajoutée **avant** `/:workerId`

---

## Frontend Changes

### 4. `packages/web-frontend/src/app/pages/workers/workers.api.ts` ✅

- Ajout `getEventSubscriptions()` via typed fetch

### 5. `packages/web-frontend/src/app/pages/workers/EventSubscriptionsPanel.tsx` ✅ (nouveau fichier)

- Empty state : "No active event subscriptions"
- Populated state : table compacte Event | Filter | Worker | Flow
- Auto-refresh sur `B2F_WORKER_CONNECTED` / `B2F_WORKER_DISCONNECTED`

### 6. `packages/web-frontend/src/app/pages/workers/WorkersPage.tsx` ✅

- `<EventSubscriptionsPanel />` ajouté sous le bloc `</Data2>`

---

## Verification

- `npm run check` → TypeScript ✅ (ESLint 1610 warnings + 10 Prettier = **pre-existants**, non liés)
- `npm run test:agent -- --exclude="E2E*"` → ✅ 5 suites, all passed

### Reste à faire manuellement

- [ ] **Test runtime** : démarrer un worker avec un flow `trigger.type: event`, naviguer vers `/workers`, vérifier que le panneau affiche bien la ligne de subscription
- [ ] **Test disconnect** : déconnecter le worker → panneau doit afficher "No active event subscriptions"
