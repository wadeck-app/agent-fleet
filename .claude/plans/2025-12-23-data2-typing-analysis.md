# Data2.tsx - Analyse du Typing des Features

**Date**: 2025-12-23  
**Observation initiale**: L'utilisation massive de `Record<string, unknown>` perd les informations de type et rend les changements de features non-détectables à la compilation.

---

## 🔴 PROBLÈMES IDENTIFIÉS

### 1. **Data2Props - Features typées comme `FeatureContract<any>`** (lignes 80-88)

```typescript
// ❌ ACTUEL
export interface Data2Props<T> {
	pagination?: FeatureContract<any> | null; // any = perte totale de type
	sorting?: FeatureContract<any> | null;
	search?: FeatureContract<any> | null;
	filter?: FeatureContract<any> | null;
	cache?: FeatureContract<any> | null;
}
```

**Impact**:

- Pas de validation des propriétés de chaque feature
- Si tu changes `usePagination2()` et ajoutes une nouvelle propriété, `Data2` ne le saura jamais
- TypeScript ne peut pas t'avertir si tu renommes `sortConfigs` → `sortConfig`

---

### 2. **Query construite avec `Record<string, unknown>`** (ligne 131)

```typescript
// ❌ ACTUEL
const query = useMemo(() => {
	return buildQuery(pagination, sorting, search, filter) as Record<string, unknown>;
}, [pagination, sorting, search, filter]);
```

**Problème**:

- `Record<string, unknown>` = objet avec clés string arbitraires
- Aucune structure garantie
- Mutations dangereuses plus tard (lignes 156-159): `delete (currentQueryWithoutFilter as any).category;`

---

### 3. **Accès aux propriétés avec `as any`** (lignes 156-159)

```typescript
// ❌ ACTUEL
const currentQueryWithoutFilter = { ...query };
delete (currentQueryWithoutFilter as any).category; // ← casting dangereux

const prevQueryWithoutFilter = { ...previousQuery };
delete (prevQueryWithoutFilter as any).category;
```

**Problème**: Les casts `as any` contournent TypeScript complètement.

---

### 4. **Injection de props - features avec `Record<string, unknown>`** (lignes 229-232)

```typescript
// ❌ ACTUEL
props.features = {
	search: search?.state, // type = unknown
	filter: filter?.state, // type = unknown
};
```

Et dans `QueryResultDisplayerContract.ts` (ligne 120):

```typescript
features?: Record<string, unknown>;  // ← perte totale de type des features custom
```

**Problème**: Le composant `Table2` reçoit `features.search` mais ne sait pas quelles propriétés il a.

---

### 5. **`fstate` et `state` sont en doublon!** ⚠️

Dans `FeatureContract.ts` (lignes 50 + 64):

```typescript
export interface FeatureContract<TState> {
	state: TState; // Current UI state
	fstate: TState; // Frozen state reference (même type!)
	// ...
}
```

Et dans `useSorting2.ts` (ligne 144):

```typescript
const fstate = state; // Juste une copie!
```

**Data2 n'utilise que `state`** → `fstate` est inutilisé!

**Problème conceptuel**: Si `fstate` et `state` ont le même type `TState`, pourquoi deux propriétés?

La raison: "Object dependencies in useEffect cause infinite loops". Mais techniquement, c'est à **chaque feature** de s'assurer que son `state` est memoized, pas à `FeatureContract` d'avoir un doublon!

---

## ✅ SOLUTION PROPOSÉE

### Principe: Décentralisation du typage

Plutôt qu'un fichier centralisé `FeatureStateTypes.ts`:

1. **Chaque feature exporte son propre type**
2. **Data2 importe les types des features**
3. **Éliminer `fstate` du contrat** (chaque hook memoize son `state`)
4. **Créer `BaseListQuery` pour typer la query backend**

---

### Étape 1: Chaque feature exporte son state type

```typescript
// hooks2/usePagination2.ts
export interface PaginationState {
	currentPage: number;
	pageSize: number;
}

// Type alias pour clarté
export type PaginationContract = FeatureContract<PaginationState>;

export function usePagination2(options: UsePagination2Options = {}): PaginationContract {
	// ...
}
```

Même pattern pour `useSorting2`, `useSearch2`, `useCategoryFilter2`, etc.

---

### Étape 2: Simplifier FeatureContract - éliminer `fstate`

```typescript
// ❌ AVANT
export interface FeatureContract<TState> {
	state: TState;
	fstate: TState; // Doublon inutile
	actions: Record<string, (...args: any[]) => void>;
	fillQuery: (query: Record<string, unknown>) => void;
}

// ✅ APRÈS
export interface FeatureContract<TState> {
	state: TState; // Chaque hook s'assure que c'est memoized
	actions: Record<string, (...args: any[]) => void>;
	fillQuery: (query: Record<string, unknown>) => void;
}
```

Chaque feature s'assure que `state` est memoized:

```typescript
// useSorting2.ts (simplifiée)
const state = useMemo(
  () => ({
    sortConfigs,
    getSortInfo,
  }),
  [sortConfigs, getSortInfo]
);

return {
  state,            // Memoized stable reference
  actions,
  fillQuery,
};
```

---

### Étape 3: Créer BaseListQuery

```typescript
// types/BaseListQuery.ts
/**
 * Schema de la query backend pour les opérations de liste.
 * Regroupe toutes les clés possibles que les features peuvent remplir.
 */
export interface BaseListQuery {
	page?: number;
	pageSize?: number;
	sortBy?: string;
	sortOrder?: string;
	q?: string;
	category?: string;
	// ← TypeScript détecte si tu oublies une clé ou la renommes
}
```

---

### Étape 4: Data2 importe les types des features

```typescript
// components2/data/Data2.tsx
import type { FilterContract } from '@framework/hooks2/useCategoryFilter2';
import type { PaginationContract } from '@framework/hooks2/usePagination2';
import type { SearchContract } from '@framework/hooks2/useSearch2';
import type { SortingContract } from '@framework/hooks2/useSorting2';
import type { BaseListQuery } from '@framework/types/BaseListQuery';

export interface Data2Props<T> {
	fetchData: (query: BaseListQuery) => Promise<{
		items: T[];
		pagination?: PaginationData;
	}>;

	// ✅ Types importés directement des features
	pagination?: PaginationContract | null;
	sorting?: SortingContract | null;
	search?: SearchContract | null;
	filter?: FilterContract | null;

	children: ReactElement<QueryResultDisplayerProps<T>> | ((props: QueryResultDisplayerProps<T>) => ReactNode);
	loadingComponent?: ReactNode;
	errorComponent?: (error: string) => ReactNode;
}
```

**Avantage**: Si `useSorting2` exporte un nouveau type `SortingContract`, la compilation échoue si tu oublies de le mettre à jour!

---

### Étape 5: QueryResultDisplayerProps récupère les state types

```typescript
// types/QueryResultDisplayerContract.ts
import type { FilterContract } from '@framework/hooks2/useCategoryFilter2';
import type { SearchContract } from '@framework/hooks2/useSearch2';
import type { FeatureState } from '@framework/types/FeatureContract';

export interface QueryResultDisplayerProps<T> {
	data: T[];
	isLoading: boolean;
	error: string | null;

	pagination?: PaginationInfo;
	sorting?: SortingInfo;

	// ✅ Features fortement typées, extraites du contrat
	features?: {
		search?: FeatureState<SearchContract>; // = SearchState
		filter?: FeatureState<FilterContract>; // = FilterState
	};
}
```

---

### Étape 6: Éliminer les `as any` et `Record`

```typescript
// Data2.tsx - ligne 131
// ❌ AVANT
const query = useMemo(() => {
  return buildQuery(pagination, sorting, search, filter) as Record<string, unknown>;
}, [pagination, sorting, search, filter]);

// ✅ APRÈS
const query = useMemo(() => {
  return buildQuery(pagination, sorting, search, filter);  // Type = BaseListQuery
}, [pagination, sorting, search, filter]);
```

```typescript
// Data2.tsx - lignes 156-159
// ❌ AVANT
const currentQueryWithoutFilter = { ...query };
delete (currentQueryWithoutFilter as any).category;

// ✅ APRÈS
const currentQueryWithoutFilter: BaseListQuery = { ...query };
delete currentQueryWithoutFilter.category;  // TypeScript OK
```

---

### Étape 7: Typer buildQuery()

```typescript
// utils2/buildQuery.ts
import type { FilterContract } from '@framework/hooks2/useCategoryFilter2';
import type { PaginationContract } from '@framework/hooks2/usePagination2';
import type { SearchContract } from '@framework/hooks2/useSearch2';
import type { SortingContract } from '@framework/hooks2/useSorting2';
import type { BaseListQuery } from '@framework/types/BaseListQuery';

export function buildQuery(
	pagination: PaginationContract | undefined,
	sorting: SortingContract | undefined,
	search: SearchContract | undefined,
	filter: FilterContract | undefined
): BaseListQuery {
	const query: BaseListQuery = {};

	pagination?.fillQuery(query);
	sorting?.fillQuery(query);
	search?.fillQuery(query);
	filter?.fillQuery(query);

	return query;
}
```

---

## 🎯 BÉNÉFICES

| Problème                            | Avant                   | Après                      |
| ----------------------------------- | ----------------------- | -------------------------- |
| Changements de features détectables | ❌ Runtime              | ✅ Compile-time            |
| Loss of type info                   | ❌ `Record<unknown>`    | ✅ `BaseListQuery`         |
| Casts dangereux                     | ❌ `as any` partout     | ✅ Aucun cast              |
| IntelliSense                        | ❌ Inutile              | ✅ Complet                 |
| Doublon inutile                     | ❌ `fstate` + `state`   | ✅ Juste `state`           |
| Maintenance centralisée             | ❌ Un fichier pour tous | ✅ Chaque feature son type |

---

## 📋 PLAN D'EXÉCUTION

### Phase 1: Préparation

1. Éliminer `fstate` de `FeatureContract.ts`
2. Créer `types/BaseListQuery.ts`
3. Ajouter les types à chaque feature hook

### Phase 2: Refactorisation

4. Mettre à jour `Data2.tsx` avec les types importés
5. Mettre à jour `QueryResultDisplayerContract.ts`
6. Mettre à jour `buildQuery()` dans `utils2/buildQuery.ts`
7. Éliminer tous les `as any` et `Record<string, unknown>`

### Phase 3: Validation

8. Vérifier que tout compile (tsc)
9. Exécuter les tests
10. Vérifier qu'il n'y a pas de régressions

---

## 🚀 IMPACT

- **Avant**: Si `usePagination2()` change, tu le découvres au runtime (data incorrecte, crash)
- **Après**: TypeScript t'avertit immédiatement à la compilation

Ce pattern rend le code maintenable, refactorisable et type-safe.
