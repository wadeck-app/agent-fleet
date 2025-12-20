# Rapport d'audit qualité des tests

**Date**: 2025-12-19
**Scope**: Tests unitaires Agent Fleet

## Résumé Exécutif

✅ **Points forts**:
- Test-utils bien architecturés (factories/mocks/helpers séparés)
- Tests bien structurés avec describe/it
- Bonne couverture des cas d'erreur

⚠️ **Problème principal**:
- **Sous-utilisation massive des test-utils** : Seulement 6 tests sur ~35 utilisent les utilitaires disponibles
- Duplication de code dans les tests

## 1. Adoption des test-utils

### Statistiques
- **34 tests** utilisent `vi.spyOn(console...)` directement
- **6 tests seulement** utilisent `setupTest()` ou `setupConsoleMocks()`
- **Ratio d'adoption** : ~15% ❌

### Impact
- Code dupliqué dans chaque test
- Maintenance difficile
- Risque d'oubli de cleanup

### Exemples de bonne pratique
```typescript
// ✅ BON (TaskManager.test.ts)
import { setupTest, createMockTask, createMockStateManager } from '../../test-utils';

beforeEach(() => {
  cleanup = setupTest(); // Setup console + clear mocks
  mockStateManager = createMockStateManager();
});

afterEach(() => {
  cleanup(); // Cleanup automatique
});
```

### Exemples à corriger
```typescript
// ❌ MAUVAIS (ClaudeLauncher.test.ts:52)
vi.spyOn(console, 'warn').mockImplementation(() => {});
// Devrait utiliser setupTest() ou setupConsoleMocks()

// ❌ MAUVAIS (RestAPI.test.ts:36-48)
const createMockTask = (id: string, overrides?: Partial<Task>): Task => ({...});
// Devrait utiliser createMockTask de test-utils
```

## 2. Duplication de code

### Problèmes identifiés

#### 2.1 createMockTask redéfini localement
**Fichiers concernés**:
- `src/orchestrator/core/RestAPI.test.ts:36-48`
- `src/shared/Storage.test.ts:52-60`

**Solution**: Utiliser `createMockTask` de `test-utils`

#### 2.2 Mocks créés manuellement
Plusieurs tests créent des mocks manuellement au lieu d'utiliser les helpers disponibles :

```typescript
// ❌ MAUVAIS (RestAPI.test.ts:54-68)
mockStateManager = {
  emitTaskCreated: vi.fn(),
  emitTaskUpdated: vi.fn(),
  // ... 15 lignes
} as any;

// ✅ BON
import { createMockStateManager } from '../../test-utils';
mockStateManager = createMockStateManager();
```

#### 2.3 Console mocks répétitifs
Pattern répété dans **34 fichiers** :
```typescript
// ❌ MAUVAIS - Pattern dupliqué partout
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});
```

## 3. Helpers manquants

Les patterns suivants apparaissent mais ne sont pas dans test-utils :

### 3.1 Mock de child_process
```typescript
// Pattern répété dans ClaudeLauncher.test.ts, ScriptExecutor.test.ts
vi.mock('child_process');
vi.spyOn(child_process, 'execSync').mockReturnValue('...');
vi.spyOn(child_process, 'spawn').mockReturnValue(mockProcess);
```

**Recommandation** : Ajouter `createMockChildProcess()` dans `mocks.ts`

### 3.2 Mock de process.platform
```typescript
// Pattern répété
vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
```

**Recommandation** : Ajouter `mockPlatform(platform)` dans `helpers.ts`

### 3.3 Mock de Workspace
```typescript
// Pattern répété dans StepRunner.test.ts, FlowExecutor.test.ts
testWorkspace = {
  id: 'test-workspace',
  mode: 'isolated',
  path: '/test/workspace',
  concurrency: { key: 'test', activeTasks: new Set(), locked: false },
  createdAt: new Date().toISOString(),
  lastUsedAt: new Date().toISOString(),
  usageCount: 0,
};
```

**Note** : `createMockWorkspace` existe déjà mais n'est pas utilisé ❌

## 4. Tests utiles vs redondants

### ✅ Tous les tests sont utiles
Après analyse, **aucun test redondant identifié**. Chaque test vérifie un comportement spécifique :

- Tests unitaires : comportement isolé (FlowExecutor, TaskManager)
- Tests d'intégration : interaction entre composants (SubFlowStep.integration.test.ts)
- Tests de validation : règles métier (FlowValidator, GraphValidator, SemanticValidator)
- Tests d'infrastructure : WebSocket, REST API, Storage

**Pas de doublons** ✅

## 5. Refactoring recommandés

### 5.1 Migration prioritaire (Impact élevé)

#### Action 1 : Migrer tous les tests vers `setupTest()`
**Effort** : 2-3h
**Impact** : ⭐⭐⭐⭐⭐

Remplacer dans **34 fichiers** :
```typescript
// Avant
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

// Après
beforeEach(() => {
  cleanup = setupTest();
});

afterEach(() => {
  cleanup();
});
```

#### Action 2 : Utiliser les factories existantes
**Effort** : 1h
**Impact** : ⭐⭐⭐⭐

Remplacer les `createMockTask` locaux par l'import de test-utils dans :
- `src/orchestrator/core/RestAPI.test.ts`
- `src/shared/Storage.test.ts`

#### Action 3 : Utiliser les mocks existants
**Effort** : 2h
**Impact** : ⭐⭐⭐⭐

Remplacer les mocks manuels par les helpers dans :
- `src/orchestrator/core/RestAPI.test.ts` (StateManager, TaskManager)
- `src/flow/executor/StepRunner.test.ts` (Workspace)

### 5.2 Améliorations futures (Impact moyen)

#### Action 4 : Ajouter helpers manquants
**Effort** : 1h
**Impact** : ⭐⭐⭐

Dans `src/test-utils/mocks.ts` :
```typescript
export function createMockChildProcess(overrides?: Partial<MockChildProcess>) {
  return new MockChildProcess(overrides);
}

export function createMockExecSync(returnValue: string | Error) {
  return vi.fn(() => {
    if (returnValue instanceof Error) throw returnValue;
    return returnValue;
  });
}
```

Dans `src/test-utils/helpers.ts` :
```typescript
export function mockPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform;
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
  return () => {
    Object.defineProperty(process, 'platform', {
      value: original,
      configurable: true,
    });
  };
}
```

## 6. Plan d'action recommandé

### Phase 1 : Migration immédiate (4-5h)
1. ✅ Migrer tous les tests vers `setupTest()` - **Priorité 1**
2. ✅ Remplacer les `createMockTask` locaux - **Priorité 1**
3. ✅ Utiliser les mocks existants - **Priorité 2**

### Phase 2 : Améliorations (2h)
4. Ajouter helpers manquants (child_process, platform)
5. Documenter les bonnes pratiques dans CLAUDE.md

### ROI attendu
- **Avant** : ~150 lignes de setup dupliqué
- **Après** : ~30 lignes centralisées
- **Gain** : 80% de réduction du code de setup
- **Maintenabilité** : ⭐⭐⭐⭐⭐

## 7. Exemples de migration

### Exemple 1 : FlowExecutor.test.ts
```diff
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
  import { FlowExecutor, FlowExecutionError } from './FlowExecutor.js';
+ import { setupTest } from '../../test-utils';

  describe('FlowExecutor', () => {
+   let cleanup: () => void;
+
    beforeEach(() => {
-     vi.clearAllMocks();
-     vi.spyOn(console, 'log').mockImplementation(() => {});
-     vi.spyOn(console, 'warn').mockImplementation(() => {});
+     cleanup = setupTest();
    });

    afterEach(() => {
-     vi.restoreAllMocks();
+     cleanup();
    });
```

### Exemple 2 : RestAPI.test.ts
```diff
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import request from 'supertest';
  import { RestAPI } from './RestAPI.js';
+ import { createMockTask, createMockStateManager, setupTest } from '../../test-utils';

  describe('RestAPI', () => {
-   // Helper to create a mock task
-   const createMockTask = (id: string, overrides?: Partial<Task>): Task => ({
-     id,
-     description: 'Test task',
-     status: TaskStatus.BACKLOG,
-     // ... 10 lignes
-   });

    beforeEach(() => {
-     vi.clearAllMocks();
-     mockStateManager = {
-       emitTaskCreated: vi.fn(),
-       emitTaskUpdated: vi.fn(),
-       // ... 15 lignes
-     } as any;
+     cleanup = setupTest();
+     mockStateManager = createMockStateManager();
    });
```

## 8. Conclusion

### Verdict : ⭐⭐⭐ (3/5)

**Points forts** :
- Architecture test-utils excellente
- Tests bien écrits et complets
- Aucun test redondant

**Points faibles** :
- Adoption très faible des test-utils (15%)
- Duplication importante du code de setup
- Helpers manquants

**Recommandation** : Migration prioritaire vers `setupTest()` dans tous les tests. Le ROI est très élevé (5h d'effort pour 80% de réduction de code dupliqué et meilleure maintenabilité).

### Impact estimé de la migration
- **Avant** : Chaque test = 5-10 lignes de setup boilerplate
- **Après** : Chaque test = 2 lignes (`cleanup = setupTest()`)
- **Maintenance** : Changements centralisés dans test-utils au lieu de 34 fichiers

---

**Prochaines étapes** :
1. Valider avec l'équipe
2. Planifier la migration (peut être fait fichier par fichier)
3. Documenter les patterns dans CLAUDE.md
