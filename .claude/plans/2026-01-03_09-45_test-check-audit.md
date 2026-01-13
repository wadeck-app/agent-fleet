# Audit des Tests et Checks - 2026-01-03_09-45

## Résumé Exécutif

**État Global:** ❌ Échecs critiques détectés

- **Tests:** 6/7 suites échouées (1 seule suite E2E Component réussie)
- **TypeScript:** 7 erreurs de compilation
- **ESLint:** 1250 problèmes (17 erreurs, 206 warnings)
- **Prettier:** 34 fichiers mal formatés

---

## 1. Erreurs TypeScript (7 erreurs) 🔴

### Origine

Toutes les erreurs proviennent de **fichiers récemment créés** (selon git status):

- `packages/web-frontend/src/framework/hooks/useDialogActionConfirmation.test.ts` ✅ Nouveau
- `packages/web-frontend/src/framework/hooks/useDialogDeleteConfirmation.test.ts` ✅ Nouveau
- `packages/web-frontend/src/framework/hooks/useDialogDeleteConfirmation.ts` ✅ Nouveau

### Détails des erreurs

#### Fichier: `useDialogActionConfirmation.test.ts`

```
Line 139: error TS1005: '>' expected.
Line 404: error TS1005: '>' expected.
Line 405: error TS1005: ',' expected.
```

#### Fichier: `useDialogDeleteConfirmation.test.ts`

```
Line 179: error TS1005: ',' expected. (3 consecutive errors)
Line 179: Type expected error
```

#### Fichier: `useDialogDeleteConfirmation.ts`

```
Line 173: error TS1005: '>' expected.
```

### Analyse

**Type d'erreur:** Erreurs de syntaxe TypeScript liées aux paramètres génériques (generic types)

**Pertinence:** ❌ **NON - Ces erreurs bloquent la compilation**

- Ces fichiers ont été récemment ajoutés pour gérer les dialogues de confirmation
- Les erreurs de syntaxe empêchent la compilation du projet
- **Action requise immédiate:** Corriger la syntaxe des génériques TypeScript

**Recommandation:**

1. Vérifier les définitions de types génériques sur les lignes identifiées
2. S'assurer que les chevrons `<>` sont correctement fermés
3. Vérifier les virgules dans les listes de paramètres de type

---

## 2. Erreurs ESLint (1250 problèmes) 🟡

### Répartition par catégorie

#### A. Warnings Tailwind CSS (159 fixables automatiquement)

- **Type:** `better-tailwindcss/enforce-consistent-line-wrapping`
- **Type:** `better-tailwindcss/enforce-consistent-class-order`
- **Quantité:** ~180+ warnings

**Pertinence:** ✅ **OUI mais non-bloquant**

- Ces warnings assurent la cohérence du code CSS
- Fixables automatiquement avec `npm run lint -- --fix`

#### B. Erreurs Critiques (17 erreurs)

##### B.1. Native `<input>` interdits (3 erreurs)

**Fichier:** `FlowEditorPropertiesPanel.tsx`

```
Line 458: Native <input> is forbidden. Use <Input> from @/components/ui/Input
Line 512: Native <input> is forbidden
Line 632: Native <input> is forbidden
```

**Pertinence:** ✅ **OUI - Violation d'architecture**

- Le projet a une règle pour utiliser les composants UI uniformes
- Les inputs natifs contournent les styles et validations du design system
- **Action requise:** Remplacer par le composant `<Input>`

##### B.2. Couleurs de thème non respectées (8 erreurs)

**Fichiers:** Nodes du FlowEditor (`ModelStepNode`, `ScriptStepNode`, `SubFlowStepNode`, `UserInterventionNode`)

```
Use theme colors (bg-primary, bg-secondary, bg-accent, bg-destructive, bg-muted) instead
```

**Pertinence:** ✅ **OUI - Cohérence du design system**

- Utilisation de couleurs hardcodées au lieu des tokens de thème
- Empêche le bon fonctionnement du dark mode
- **Action requise:** Remplacer par les couleurs du thème

##### B.3. Dépendances d'objets dans hooks (2 erreurs)

**Fichier:** `useDialog.ts`

```
Line 177: Likely object "{{name}}" in hook dependencies
Line 182: Likely object "{{name}}" in hook dependencies
```

**Pertinence:** ✅ **OUI - Potentiel bug de performance**

- Les objets dans les dépendances de hooks causent des re-renders infinis
- Doit extraire les propriétés primitives
- **Action requise:** Refactorer pour utiliser des primitives

##### B.4. Variables inutilisées (1 erreur)

**Fichier:** `InterventionsPage.tsx`

```
Line 35: 'error' is assigned a value but never used
```

**Pertinence:** ⚠️ **Mineur**

- Variable destructurée mais non utilisée
- Doit être préfixée avec `_` selon la convention du projet

##### B.5. Parsing Errors (3 erreurs)

**Fichiers:**

- `useDialogActionConfirmation.test.ts` (Line 139)
- `useDialogDeleteConfirmation.test.ts` (Line 179)
- `useDialogDeleteConfirmation.ts` (Line 173)

**Pertinence:** ❌ **NON - Dupliqué avec erreurs TypeScript**

- Ces erreurs sont déjà identifiées dans la section TypeScript
- Seront résolues en corrigeant les erreurs TS

#### C. Warnings `@typescript-eslint/no-explicit-any` (47+ occurrences)

**Pertinence:** ⚠️ **Mineur mais à surveiller**

- Utilisation de `any` qui contourne le typage TypeScript
- Acceptable temporairement mais à remplacer progressivement par des types précis
- Ne bloque pas le fonctionnement

---

## 3. Échecs de Tests (6 suites échouées) 🔴

### Vue d'ensemble

| Suite             | Fichiers              | Tests                  | Statut |
| ----------------- | --------------------- | ---------------------- | ------ |
| Backend Unit      | 11 failed / 34 total  | 27 failed / 521 total  | ❌     |
| Frontend Unit     | 25 failed / 105 total | 80 failed / 1663 total | ❌     |
| Worker Unit       | 2 failed / 2 total    | N/A                    | ❌     |
| Orchestrator Unit | 8 failed / 14 total   | 2 failed / 174 total   | ❌     |
| Shared Front/Back | Failed                | N/A                    | ❌     |
| E2E Application   | Failed                | N/A                    | ❌     |
| E2E Component     | Passed                | Passed                 | ✅     |

### 3.1. Backend Unit Tests (27 tests échoués)

#### A. TransportsController (7 tests échoués)

**Tests affectés:**

- `batchSubscriptions` - should subscribe to multiple events
- `batchSubscriptions` - should return 401 if no client ID in cookie
- `batchSubscriptions` - should return 401 if session not found
- `subscribeToEvent` - should subscribe to single event with filters
- `unsubscribeFromEvent` - should unsubscribe from single event
- `getSubscriptions` - should return current subscriptions
- `getStatus` - should return transport status with queued events count

**Origine:** Tests pour le système de transport/WebSocket

**Pertinence:** ⚠️ **À INVESTIGUER**

- Ces tests concernent une fonctionnalité critique (communication temps réel)
- Possiblement liés aux modifications récentes du système d'événements
- **Question:** Ces fonctionnalités sont-elles encore utilisées dans l'application ?

#### B. TasksService (9 tests échoués)

**Tests affectés:**

- `getTasksData` - Various test scenarios (fetch, transform, filter)

**Erreur commune:**

```
TypeError: this.orchestratorRepository.getTasks is not a function
```

**Origine:** Problème d'interface/mock entre TasksService et OrchestratorRepository

**Pertinence:** ❌ **NON - Tests obsolètes ou mal configurés**

- L'erreur indique que la méthode `getTasks` n'existe pas/plus
- Soit le repository a changé d'API
- Soit les mocks des tests ne sont pas à jour
- **Action requise:** Synchroniser les tests avec l'implémentation actuelle

#### C. TransportSessionManager (3 tests échoués)

**Tests affectés:**

- `validateSession` - should reject validation for expired session
- `time until expiration` - should return 0 for expired session
- `cleanup expired sessions` - should cleanup expired sessions when cleanup runs

**Origine:** Tests de gestion des sessions de transport

**Pertinence:** ⚠️ **À INVESTIGUER**

- Fonctionnalité de sécurité importante
- Les tests échouent sur la gestion de l'expiration
- Potentiel problème de timing dans les tests

#### D. Event Broadcasting Integration (2 tests échoués)

**Erreur:**

```
[EventBroadcaster] No transport server found for type: websocket
```

**Origine:** Tests d'intégration pour le broadcasting d'événements

**Pertinence:** ⚠️ **À INVESTIGUER**

- Tests d'intégration qui nécessitent un serveur WebSocket mocké
- L'infrastructure de test n'est pas correctement configurée
- **Question:** Le système de broadcasting est-il encore utilisé ?

#### E. Session Security Tests (5 tests échoués)

**Tests affectés:**

- Token expiration enforcement tests
- Session validation tests
- Fail secure principles tests

**Origine:** Tests de sécurité des sessions

**Pertinence:** ✅ **OUI - Sécurité critique**

- Ces tests vérifient des aspects de sécurité
- Les échecs pourraient indiquer des vulnérabilités
- **Action requise:** Priorité haute pour investigation

#### F. Autres tests backend

- `DataStoreFactory.test.ts` - Factory pattern tests
- `OrchestratorEventBridge.test.ts` - Event bridge tests
- `TransportRouter.test.ts` - Routing tests
- `websocket-auth-flow.test.ts` - Authentication flow tests
- `WebSocketTransportServer.test.ts` - WebSocket server tests
- `IngredientsService.test.ts` - Edge case test (1 échec)

**Pertinence:** ⚠️ **À INVESTIGUER**

- Tests liés à l'infrastructure de transport
- Beaucoup concernent WebSocket et système d'événements

### 3.2. Frontend Unit Tests (80 tests échoués)

#### A. Tests de parsing (3 échecs)

**Fichiers:**

- `useDialogActionConfirmation.test.ts`
- `useDialogDeleteConfirmation.test.ts`

**Origine:** Nouveaux fichiers avec erreurs de syntaxe TypeScript

**Pertinence:** ❌ **NON - Bloqués par erreurs TS**

- Ces tests ne peuvent pas s'exécuter à cause des erreurs de syntaxe
- Seront corrigés avec les erreurs TypeScript

#### B. Tests d'intégration Transport (6+ échecs)

**Fichiers:**

- `TransportManager.test.ts` (5 tests)
- `HttpPollingTransportClient.test.ts` (3 tests)
- `transport-integration.test.tsx` (4 tests)

**Erreurs communes:**

- `Error: Failed to fetch tasks`
- Session storage issues with `connId`
- Transport connection/disconnection problems

**Origine:** Tests du système de transport côté client

**Pertinence:** ⚠️ **À INVESTIGUER**

- Mirrors des problèmes backend
- Le système de transport semble avoir des changements non reflétés dans les tests
- **Question:** Ces transports (WebSocket, HTTP Polling) sont-ils toujours utilisés activement ?

#### C. Tests de composants UI (5+ échecs)

**Fichiers:**

- `App.test.tsx`
- `IngredientTable.test.tsx`
- `BooksPage.test.tsx`
- `BookTable.test.tsx`
- `CrudTable.test.tsx`

**Erreurs communes:**

```
Error: Not implemented: navigation (except hash changes)
Error loading books: Error: Failed to load books
Error creating/updating/deleting: Various failures
```

**Origine:** Tests de composants React avec des appels API

**Pertinence:** ⚠️ **TESTS MAL CONFIGURÉS**

- Les mocks d'API ne sont pas correctement configurés
- Les erreurs de navigation suggèrent des problèmes avec jsdom/testing-library
- Ces tests testent probablement trop de choses à la fois (UI + API)
- **Action requise:** Revoir la stratégie de test (séparer unit tests et integration tests)

#### D. Tests de hooks (6+ échecs)

**Fichiers:**

- `useCacheControl2.test.ts`
- `useCategoryFilter2.test.ts`
- `usePagination2.test.ts`
- `useSorting2.test.ts`
- `useDashboard.test.ts`

**Origine:** Tests de custom hooks React

**Pertinence:** ⚠️ **À INVESTIGUER**

- Tests qui vérifient le contrat des hooks (shape, state)
- Possiblement cassés après refactoring
- **Question:** Ces hooks ont-ils été modifiés récemment ?

#### E. Tests de LocalStorage (3+ échecs)

**Erreurs:**

```
[LocalStorageAdapter] Failed to get: test-table-column-order
SyntaxError: Unexpected token 'i', "invalid-json{" is not valid JSON
```

**Origine:** Tests utilisant le localStorage avec des données invalides

**Pertinence:** ✅ **OUI - Tests de robustesse**

- Ces tests vérifient que l'app gère les données corrompues
- Les erreurs sont **attendues** et doivent être catchées
- **Action requise:** Vérifier que le code gère correctement ces erreurs

### 3.3. Worker & Orchestrator Unit Tests

**Pertinence:** ⚠️ **MANQUE D'INFORMATION**

- Les logs ne montrent pas assez de détails
- Besoin d'investigation approfondie
- **Action requise:** Relancer les tests individuellement pour plus de détails

### 3.4. Shared Front/Back & E2E Application Tests

**Pertinence:** ⚠️ **MANQUE D'INFORMATION**

- Aucun détail sur les échecs
- **Action requise:** Investigation nécessaire

---

## 4. Problèmes de Formatting (34 fichiers) 🟡

**Pertinence:** ✅ **OUI mais non-bloquant**

- Fixable automatiquement avec `npm run format`
- N'affecte pas le fonctionnement

---

## 5. Analyse de Pertinence Globale

### Tests qui ne font PLUS sens (à supprimer/refactorer) ❌

1. **TasksService backend tests** - L'API a changé, les tests ne sont plus à jour
2. **Tests de transport WebSocket** - Si le système de transport n'est plus utilisé activement
3. **Tests d'event broadcasting** - Si cette fonctionnalité a été retirée/remplacée

### Tests qui font ENCORE sens (à corriger) ✅

1. **Session Security tests** - Sécurité critique
2. **Tests de validation de formulaires** - Fonctionnalité core
3. **Tests de composants UI de base** - Une fois les mocks corrigés
4. **Tests de hooks custom** - Après refactoring

### Tests bloqués par des erreurs de code ⛔

1. **Tous les tests des nouveaux fichiers de dialogue** - Bloqués par erreurs TS
2. **Tests ESLint qui parsent les fichiers** - Bloqués par syntaxe invalide

---

## 6. Plan d'Action Recommandé

### Phase 1: Déblocage (URGENT) 🔴

1. **Corriger les 7 erreurs TypeScript**
    - Fichiers: `useDialog*.ts` et `useDialog*.test.ts`
    - Impact: Débloque la compilation et ~10 tests
    - Priorité: **CRITIQUE**
    - Effort: ~30 min

2. **Corriger les 17 erreurs ESLint critiques**
    - Native inputs → Composant `<Input>` (3 erreurs)
    - Theme colors dans nodes (8 erreurs)
    - Hook dependencies (2 erreurs)
    - Parsing errors (déjà couverts par TS)
    - Priorité: **HAUTE**
    - Effort: ~1-2h

### Phase 2: Nettoyage (COURT TERME) 🟡

3. **Investiguer et décider pour les tests de transport**
    - Question: Le système WebSocket/transport est-il encore utilisé ?
    - Si OUI: Mettre à jour les tests
    - Si NON: Supprimer les tests obsolètes
    - Impact: ~40 tests
    - Priorité: **MOYENNE**
    - Effort: 2-4h (investigation) + implémentation

4. **Corriger les tests TasksService**
    - Synchroniser avec la nouvelle API du repository
    - Impact: 9 tests
    - Priorité: **MOYENNE**
    - Effort: 1-2h

5. **Fixer le formatting**
    - Commande: `npm run format`
    - Impact: 34 fichiers
    - Priorité: **BASSE**
    - Effort: 5 min

### Phase 3: Amélioration (MOYEN TERME) 🟢

6. **Refactorer les tests de composants UI**
    - Séparer unit tests et integration tests
    - Améliorer les mocks d'API
    - Impact: ~20 tests
    - Priorité: **BASSE**
    - Effort: 4-8h

7. **Corriger les warnings `any` TypeScript**
    - Remplacer progressivement par des types précis
    - Impact: 47+ warnings
    - Priorité: **BASSE**
    - Effort: Variable (quelques heures réparties)

8. **Fixer les warnings Tailwind CSS**
    - Commande: `npm run lint -- --fix`
    - Impact: ~159 warnings
    - Priorité: **BASSE**
    - Effort: 5 min

---

## 7. Métriques

### Avant corrections

- ✅ Tests passing: 41% (1 suite sur 7, ~2240 tests sur ~2358 total)
- ❌ Tests failing: 59%
- ⚠️ TypeScript: 7 erreurs bloquantes
- ⚠️ ESLint: 17 erreurs + 206 warnings
- ⚠️ Prettier: 34 fichiers

### Objectif après Phase 1

- ✅ Tests passing: 45-50% (déblocage des tests de dialogue)
- ❌ Tests failing: 50-55%
- ✅ TypeScript: 0 erreur
- ⚠️ ESLint: 0 erreur + 206 warnings
- ⚠️ Prettier: 34 fichiers

### Objectif après Phase 2

- ✅ Tests passing: 70-80%
- ❌ Tests failing: 20-30%
- ✅ TypeScript: 0 erreur
- ✅ ESLint: 0 erreur + warnings non critiques
- ✅ Prettier: 0 problème

---

## 8. Questions à clarifier avec l'équipe

1. **Système de transport WebSocket:**
    - Est-il encore utilisé activement dans l'application ?
    - Doit-on maintenir HTTP Polling, Long Polling, SSE et WebSocket ?
    - Ou a-t-on migré vers un seul système ?

2. **Event Broadcasting:**
    - Le système d'événements broadcast est-il encore nécessaire ?
    - A-t-il été remplacé par une autre solution ?

3. **TasksService:**
    - Quelle est la nouvelle signature de l'API OrchestratorRepository ?
    - Les tests doivent-ils être mis à jour ou supprimés ?

4. **Session Security:**
    - Les échecs de tests de sécurité sont-ils acceptables ?
    - Y a-t-il eu des changements volontaires dans la gestion de session ?

---

## 9. Conclusion

### État actuel

Le projet a **des problèmes critiques qui bloquent la compilation** (7 erreurs TypeScript) ainsi qu'un **nombre significatif de tests échoués** (59%). Cependant, beaucoup de ces échecs semblent provenir de:

1. Fichiers récemment ajoutés avec des erreurs de syntaxe
2. Tests non synchronisés avec l'implémentation actuelle
3. Infrastructure de test mal configurée pour certains domaines

### Bonne nouvelle

- Une seule suite de tests (E2E Component) passe complètement
- La majorité des warnings ESLint sont auto-fixables
- Les erreurs TypeScript sont localisées dans 3 fichiers seulement

### Recommandation finale

**Commencer immédiatement par la Phase 1** pour débloquer la compilation, puis investiguer le système de transport (Phase 2) car il représente la majorité des échecs de tests. Cela permettra de clarifier rapidement si les tests doivent être mis à jour ou supprimés.
