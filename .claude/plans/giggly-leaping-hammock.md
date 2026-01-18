# Plan: Interventions v2 - Page avec Table

## Objectif

Créer une nouvelle page "Interventions v2" qui affiche les interventions dans un tableau au lieu de cartes, en suivant les patterns modernes du codebase (Data2 + Table2).

## Approche Recommandée

Créer une page séparée à `/interventions-v2` (plutôt que remplacer l'existante) pour permettre :

- Migration progressive et tests A/B
- Réduction du risque (fonctionnalité existante intacte)
- Possibilité d'ajouter un toggle view plus tard

## Architecture

```
InterventionsV2Page (orchestrateur)
├── Data2 (gestion de données headless)
│   ├── usePagination2()
│   ├── useSorting2()
│   ├── useSimpleSearch()
│   ├── useCacheControl2()
│   ├── useInterventionFilters()
│   └── useMultiSelect2()
└── InterventionsTable (présentation pure)
    └── Table2 avec colonnes définies
```

## Fichiers à Créer

### 1. `InterventionsTable.tsx`

**Pattern:** Suivre `TasksTable.tsx` et `ProjectsTable.tsx`

Colonnes à implémenter :

- **Task ID** : Lien monospace vers `/tasks/:id/logs-stacked`, tronqué à 8 caractères
- **Type** : Icône emoji + Badge (approval/question/choice)
- **Title** : Titre en gras + description en petit texte gris (tronqué)
- **Status** : Badge coloré (pending=warning, answered=success, timeout=destructive, cancelled=secondary)
- **Blocking** : Badge Yes/No (destructive/secondary)
- **Created** : Temps relatif avec tooltip pour date exacte
- **Actions** : Menu dropdown avec View/Respond/Cancel

Réutiliser les helpers existants :

- `getInterventionTypeIcon()` de `interventions.helpers.ts`
- `getInterventionStatusVariant()` de `interventions.helpers.ts`
- `formatRelativeTime()` du framework

### 2. `InterventionsV2Page.tsx`

**Pattern:** Cloner `InterventionsPage.tsx`, ajouter CRUD comme `TasksPage.tsx`

Différences avec la page actuelle :

- Remplacer `<InterventionsCards>` par `<InterventionsTable>`
- Ajouter `useMultiSelect2()` pour sélection multiple
- Ajouter `useInterventionsCrud()` pour opérations cancel
- Ajouter états de dialogue (cancel, bulk cancel)
- Ajouter `<BulkActionBar>` pour actions en masse
- Ajouter gestionnaires pour cancel/bulk-cancel
- Row click → navigation vers `/interventions/:id`

Réutiliser intégralement :

- `InterventionFilters` (UI filtres)
- `useInterventionFilters()` (state filtres)
- `interventions.api.ts` (client API)
- `useRealtimeRefresh()` (mises à jour WebSocket)
- Tous les hooks Data2 existants

### 3. `useInterventionsCrud.ts`

**Pattern:** Suivre `useTasksCrud.ts`

Opérations à implémenter :

- `cancelIntervention(id)` - Annuler une intervention
- `bulkCancelInterventions(ids[])` - Annuler plusieurs interventions
- Gestion d'état pour cancelling/cancelled
- Toast de succès/erreur
- Callbacks pour refresh

API disponibles (déjà dans `interventions.api.ts`) :

- `cancelIntervention(id)`
- `bulkCancelInterventions(ids)`

### 4. `App.tsx`

**Modification minimale**

Ajouter route après la route `/interventions` existante (ligne ~63) :

```tsx
<Route path="/interventions-v2" element={<InterventionsV2Page />} />
```

## Composants Réutilisés (Aucune Modification)

- `InterventionFilters.tsx` - Filtres UI (status, type, blocking, taskId)
- `useInterventionFilters.ts` - Hook de state pour filtres
- `interventions.api.ts` - Client API
- `interventions.helpers.ts` - Helpers status colors/icons
- `InterventionDetailPage.tsx` - Page détail pour navigation

## Étapes d'Implémentation

1. **Créer `InterventionsTable.tsx`**
    - Définir colonnes avec `Table2Column<Intervention>[]`
    - Utiliser `ColumnHelpers` pour colonnes standard (id, dates)
    - Implémenter render custom pour type/status badges
    - Ajouter menu actions (View/Respond/Cancel)
    - Props : étendre `Table2Props<Intervention>`

2. **Créer `useInterventionsCrud.ts`**
    - Wrapper pour `interventions.api.cancelIntervention()`
    - Wrapper pour `interventions.api.bulkCancelInterventions()`
    - États : `isCancelling`, `cancellingIds`
    - Toasts avec `useCrudSuccessToast()` et `useErrorToast()`

3. **Créer `InterventionsV2Page.tsx`**
    - Copier structure de `InterventionsPage.tsx`
    - Ajouter hooks : `useMultiSelect2()`, `useInterventionsCrud()`
    - Remplacer render : `<InterventionsCards>` → `<InterventionsTable>`
    - Ajouter dialogs : Cancel confirmation, Bulk cancel workflow
    - Ajouter handlers : `handleCancel()`, `handleBulkCancel()`
    - Ajouter `<BulkActionBar>` avec count + bulk cancel button

4. **Ajouter route dans `App.tsx`**
    - Ligne ~63 après route `/interventions`
    - Import : `import { InterventionsV2Page } from './pages/interventions/InterventionsV2Page'`

5. **Tester manuellement**
    - Affichage colonnes
    - Tri sur colonnes sortables
    - Recherche et filtres
    - Pagination
    - Click row → navigation
    - Cancel individuel
    - Sélection multiple + bulk cancel
    - Mises à jour temps réel

6. **Lancer `/check` pour vérifier erreurs TypeScript/ESLint**

## Fichiers Critiques

**À créer :**

- `packages/web-frontend/src/app/pages/interventions/InterventionsTable.tsx`
- `packages/web-frontend/src/app/pages/interventions/InterventionsV2Page.tsx`
- `packages/web-frontend/src/app/pages/interventions/useInterventionsCrud.ts`

**À modifier :**

- `packages/web-frontend/src/app/App.tsx` (ajouter route)

**À référencer :**

- `packages/web-frontend/src/app/pages/tasks/TasksTable.tsx` (pattern table)
- `packages/web-frontend/src/app/pages/projects/ProjectsPage.tsx` (pattern CRUD)
- `packages/web-frontend/src/app/pages/tasks/useTasksCrud.ts` (pattern hook CRUD)

## Décisions UX

**Click comportement :**

- Click sur row entière → navigation vers `/interventions/:id` (cohérent avec cards)
- Menu actions séparé pour Cancel/Respond

**Actions disponibles :**

- View Details : Toujours disponible
- Respond : Seulement si `status === 'pending'` (navigue vers detail page)
- Cancel : Seulement si `status === 'pending'`
- Bulk Cancel : Pour interventions pending sélectionnées

**Avantages Table vs Cards :**

- Meilleure vue d'ensemble pour comparer
- Colonnes triables
- Plus compact (plus d'items visibles)
- Meilleures opérations en masse

## Vérification End-to-End

1. Démarrer l'app : `npm run dev` (si pas déjà lancé)
2. Naviguer vers `/interventions-v2`
3. Vérifier affichage table avec données
4. Tester tri sur colonnes cliquables
5. Tester recherche et filtres
6. Tester pagination
7. Tester click row → detail page
8. Créer intervention via workflow → vérifier apparition temps réel
9. Tester cancel individuel
10. Tester sélection multiple + bulk cancel
11. Lancer `npm run check` pour TypeScript/ESLint
12. Lancer `npm run test:agent` pour tests unitaires (si applicable)

## Notes Techniques

- **Data2 architecture** : Composition de hooks réutilisables (pagination, sort, search, filters, cache)
- **Table2** : Composant headless moderne qui implémente `QueryResultDisplayerProps<T>`
- **PascalCase** : Respecter la convention de nommage (fichiers = classes exportées)
- **Single Responsibility** : Chaque composant/hook a un rôle clair
- **Type Safety** : TypeScript strict activé, types pour toutes les props
- **Real-time** : WebSocket events `B2F_INTERVENTION_CREATED` et `B2F_INTERVENTIONS_UPDATED` gérés par `useRealtimeRefresh`
- **Persistence** : Pagination et tri stockés dans localStorage avec `storageId: 'interventions-v2'`
