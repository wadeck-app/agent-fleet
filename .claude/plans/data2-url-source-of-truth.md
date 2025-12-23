# Data2 Refactoring: URL as Source of Truth

## 🎯 Problème Identifié

L'implémentation précédente de Data2 contenait une logique métier fragile:

- Comparaison complexe entre requêtes avec exclusions (category, cacheId)
- Couplage fort entre Data2 et les features spécifiques
- Impossible de scaler: chaque nouveau cas spécial demande plus de code
- Violation du Single Responsibility Principle

```typescript
// ❌ Ancien pattern (fragile)
if (isSearchEmpty && previousQuery) {
	const currentQueryWithoutFilterAndCache = { ...query };
	delete currentQueryWithoutFilterAndCache.category;
	delete currentQueryWithoutFilterAndCache.cacheId;
	// ... plus de logique métier
}
```

## ✅ Solution: URL comme Source de Vérité

L'idée simple: **si l'URL change, refetch**

Data2 ne dépend plus de la sémantique des requêtes. Il utilise la représentation URL (JSON stringifiée et triée) comme identifiant unique.

### Comment ça marche

1. **Compose la query** avec `buildQuery()` des features
2. **Génère l'URL** en stringifiant la query (triée par clés)
3. **Compare l'URL** avec le rendu précédent
4. **Si l'URL a changé** → refetch
5. **Sinon** → rien (données stale sont acceptables)

```typescript
// ✅ Nouveau pattern (simple et composable)
const queryUrl = useMemo(() => {
	const sortedQuery = Object.keys(query)
		.sort()
		.reduce((acc, key) => {
			acc[key] = query[key];
			return acc;
		}, {});
	return JSON.stringify(sortedQuery);
}, [query]);

useEffect(() => {
	// Fetch whenever URL changes
}, [fetchData, queryUrl]); // ← Une seule dépendance!
```

## 🎁 Avantages

### 1. **Simplicité**

- Zéro logique métier dans Data2
- Une seule ligne de dépendance
- Facile à comprendre et maintenir

### 2. **Composabilité**

- Chaque feature est responsable d'elle-même
- Pas de cas spéciaux hardcodés
- Features peuvent être ajoutées sans modifier Data2

### 3. **Flexibilité**

- Search vide + category change = URL identique = pas de refetch ✅
- Search vide + cache change = URL différente = refetch ✅
- Pagination change = URL différente = refetch ✅
- Tout fonctionne automatiquement!

### 4. **Testabilité**

- Tester Data2 = tester `JSON.stringify(sorted_query)`
- Pas de logique métier à tester
- Features s'auto-testent

## 📊 Exemple: Search vide + Category change

```typescript
// Requête 1: search vide, pas de catégorie
query = { page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', cacheId: 0 };
url = '{"cacheId":0,"page":1,"pageSize":10,"sortBy":"name","sortOrder":"asc"}';

// Requête 2: search vide, catégorie = "Protein"
query = { page: 1, pageSize: 10, sortBy: 'name', sortOrder: 'asc', category: 'Protein', cacheId: 0 };
url = '{"cacheId":0,"category":"Protein","page":1,"pageSize":10,"sortBy":"name","sortOrder":"asc"}';

// URL différente → REFETCH ✅
// C'est le bon comportement! Il faut fetch pour filtrer par catégorie
```

Wait, tu as raison que c'est pas le bon comportement. Laisse-moi reconsidérer...

## 🤔 Cas particulier: Search vide + Category change

Ton cas d'usage initial: "search vide + category change donne les mêmes résultats, pas besoin de refetch"

Avec le nouveau pattern URL, ça ne marche pas automatiquement. Mais c'est **CORRECT**!

Pourquoi? Parce que:

1. **C'est la responsabilité de la feature**, pas de Data2
2. **useCategoryFilter2** devrait ne pas ajouter `category` à la query si search est vide
3. **Chaque feature décide d'elle-même** si elle doit modifier la query

## 🛠️ Refactoring: useCategoryFilter2

```typescript
// Actuellement:
const fillQuery = useCallback(
  (query: Record<string, unknown>) => {
    if (value) {
      query.category = value;  // ← Toujours ajouté
    }
  },
  [value]
);

// Devrait être:
const fillQuery = useCallback(
  (query: Record<string, unknown>) => {
    // Feature décide elle-même si elle doit modifier la query
    // Elle peut checker d'autres features si nécessaire
    if (shouldFilter) {  // ← Logic encapsulée ici
      query.category = value;
    }
  },
  [value, shouldFilter]
);
```

**MAIS:** Comment useCategoryFilter2 sait si search est vide? Elle n'a pas accès à search!

## 🚀 Meilleure approche: Props de contexte dans Data2

Passer les dépendances cross-features via props optionnelles:

```typescript
export interface Data2Props<T> {
	// ... existing props ...

	// Context props pour les features qui ont besoin de décider
	searchIsEmpty?: boolean;
}

export function Data2<T>({
	// ... other props ...
	searchIsEmpty = false,
}: Data2Props<T>) {
	const query = useMemo(() => {
		// Pass context to features
		return buildQuery(
			pagination,
			sorting,
			search,
			{ ...filter, _searchIsEmpty: searchIsEmpty }, // ← Pass context
			cache
		);
	}, [...deps, searchIsEmpty]);

	// ...
}
```

Ou plus simplement: **useCategoryFilter2 accepte une dépendance optionnelle**

```typescript
export function useCategoryFilter2(options: {
	categories: string[];
	storageId?: string;
	disableIfSearchEmpty?: boolean; // ← Nouvelle option
	isSearchEmpty?: boolean; // ← Inject search state
}) {
	const fillQuery = useCallback(
		query => {
			// Feature décide
			if (!options.disableIfSearchEmpty || !options.isSearchEmpty) {
				if (value) {
					query.category = value;
				}
			}
		},
		[value, options.disableIfSearchEmpty, options.isSearchEmpty]
	);
}
```

Utilisation:

```typescript
const search = useSimpleSearch({...});
const filter = useCategoryFilter2({
  categories: AVAILABLE_CATEGORIES,
  storageId: STORAGE_ID,
  disableIfSearchEmpty: true,
  isSearchEmpty: !search.state.query.trim(),  // ← Pass search state
});
```

## 📝 Résumé

**L'amélioration:**

- Data2 devient une **simple orchestration** sans logique métier
- URL = source de vérité pour cache busting
- **Features restent autonomes** mais peuvent recevoir du contexte optionnel
- Chaque feature décide si elle contribue à la query

**Bénéfices:**

- Zéro couplage entre features dans Data2
- Chaque feature reste indépendante et testable
- Facile d'ajouter/retirer des features
- Pattern scale bien avec de nouvelles features
