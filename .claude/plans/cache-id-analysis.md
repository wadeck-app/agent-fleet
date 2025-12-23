# Analyse: Ajouter un `cacheId` à la requête

## 📋 Contexte

Actuellement, l'architecture utilise:

- **Data2**: Composant d'orchestration qui gère les requêtes
- **buildQuery()**: Compose les queries à partir des features (pagination, search, filter, sorting)
- **fetchData()**: Callback qui lance la requête HTTP réelle
- **AbortController**: Pour annuler les requêtes en vol

Le système déclenche une nouvelle requête chaque fois que `query` change (dépendance du useEffect).

---

## 💡 Proposition: Ajouter un `cacheId`

### Qu'est-ce qu'un `cacheId`?

Un identifiant optionnel ajouté à la query qui change **sans dépendre des filtres métier**. C'est un **cache buster** explicite.

```typescript
// Avant:
const query = { page: 1, pageSize: 10, search: 'chicken' };

// Après:
const query = {
  page: 1,
  pageSize: 10,
  search: 'chicken',
  cacheId: 1  // ← Nouveau!
};
```

---

## ✅ Avantages majeurs

### 1. **Forcer le refresh des données (Bouton Refresh)**

```typescript
const [refreshCount, setRefreshCount] = useState(0);

const handleRefresh = () => {
  setRefreshCount(prev => prev + 1);
};

// Dans Data2, ajouter cacheId aux dépendances
// Quand refreshCount change → cacheId change → query change → refetch!

<button onClick={handleRefresh}>🔄 Refresh</button>
```

**Cas d'usage:**

- L'utilisateur sait que les données sont obsolètes
- Les données ont été modifiées externalement (autre utilisateur, API update)
- Forcer la synchronisation après une action asynchrone complexe

### 2. **Casser les caches HTTP (Cache Busting)**

**Problème actuel:**

- Si le serveur ou un CDN met en cache avec `Cache-Control: max-age=3600`
- Un changement de page revient avec les **mêmes données** (cache hit!)
- L'utilisateur ne voit pas les derniers changements

**Solution avec cacheId:**

```typescript
// Sans cacheId, URL:
GET /api/ingredients?page=1&pageSize=10&search=chicken

// Avec cacheId = 1:
GET /api/ingredients?page=1&pageSize=10&search=chicken&cacheId=1

// Avec cacheId = 2 (après refresh):
GET /api/ingredients?page=1&pageSize=10&search=chicken&cacheId=2
// URL différente → Cache MISS → Données fraîches!
```

**Cas d'usage:**

- Contourner les caches HTTP agressifs
- S'assurer que chaque refresh obtient des données fraîches
- Forcer le navigateur/CDN à re-valider

### 3. **Gestion fine des états de cache**

```typescript
// Hook personnalisé pour gérer le cacheId
function useCacheControl() {
  const [cacheId, setCacheId] = useState(0);

  return {
    cacheId,
    refresh: () => setCacheId(prev => prev + 1),  // Increment
    clear: () => setCacheId(0),                    // Reset
    set: (id: number) => setCacheId(id),           // Custom
  };
}

// Utilisation:
const cache = useCacheControl();

<button onClick={cache.refresh}>Refresh</button>
<button onClick={cache.clear}>Clear Cache</button>
```

### 4. **Éviter les doublons de requêtes**

Sans cacheId, si tu changes page deux fois rapidement:

- Page 1 → Requête lancée
- Page 2 → Requête lancée (abort Page 1)
- Page 1 → Requête lancée (abort Page 2)

Avec cacheId dans la query, **il n'y a pas de doublons** car chaque changement de page change aussi le cacheId implicitement.

### 5. **Analytics et Debugging**

```typescript
// Tracer les refreshes dans les logs
fetchData(query) {
  console.log(`[${query.cacheId}] Fetching:`, query);
  // Facile de voir combien de fois on demande les mêmes données
}
```

---

## 🏗️ Architecture implémentation

### Option 1: Dans `Data2` (Recommandée)

```typescript
// Data2.tsx
export interface Data2Props<T> {
  fetchData: (query: Record<string, unknown>) => Promise<{...}>;

  // ← Nouvelle prop optionnelle
  cacheControl?: {
    cacheId: number;
  };

  pagination?: FeatureContract<any> | null;
  // ... autres props
}

export function Data2<T>({
  fetchData,
  cacheControl,  // ← Nouveau
  pagination,
  // ...
}: Data2Props<T>) {
  // Compose query from features
  const query = useMemo(() => {
    const baseQuery = buildQuery(pagination, sorting, search, filter);

    // Ajouter cacheId si fourni
    if (cacheControl?.cacheId !== undefined) {
      baseQuery.cacheId = cacheControl.cacheId;
    }

    return baseQuery;
  }, [pagination, sorting, search, filter, cacheControl?.cacheId]);

  // useEffect verra le cacheId comme dépendance
  // Si cacheId change → refetch!
  useEffect(() => {
    // ... refetch logic
  }, [fetchData, query]);  // ← query contient cacheId
}
```

**Utilisation:**

```typescript
const [refreshCount, setRefreshCount] = useState(0);

<Data2
  fetchData={fetchIngredients}
  cacheControl={{ cacheId: refreshCount }}
  pagination={pagination}
  sorting={sorting}
  search={search}
  filter={filter}
>
  <IngredientTable2 onRefresh={() => setRefreshCount(p => p + 1)} />
</Data2>
```

### Option 2: Hook personnalisé `useCacheControl`

```typescript
// hooks/useCacheControl.ts
export function useCacheControl(initialValue = 0) {
  const [cacheId, setCacheId] = useState(initialValue);

  const actions = useMemo(() => ({
    refresh: () => setCacheId(prev => prev + 1),
    reset: () => setCacheId(0),
    set: (id: number) => setCacheId(id),
  }), []);

  return {
    cacheId,
    actions,
    fstate: { cacheId },  // Pour Data2
  };
}

// Utilisation:
const cache = useCacheControl();

<Data2
  fetchData={fetchIngredients}
  cacheControl={{ cacheId: cache.cacheId }}
  pagination={pagination}
>
  <IngredientTable2 onRefresh={cache.actions.refresh} />
</Data2>
```

### Option 3: Hook spécialisé `useRefreshable`

```typescript
// hooks/useRefreshable.ts
export interface RefreshableFeature {
  cacheId: number;
  refresh: () => void;
}

export function useRefreshable(): RefreshableFeature {
  const [cacheId, setCacheId] = useState(0);

  return {
    cacheId,
    refresh: () => setCacheId(prev => prev + 1),
  };
}

// Utilisation:
const refreshable = useRefreshable();

<Data2
  cacheControl={{ cacheId: refreshable.cacheId }}
  pagination={pagination}
>
  {({ pagination: paginationProps, data, isLoading }) => (
    <>
      <button onClick={refreshable.refresh}>
        {isLoading ? 'Loading...' : 'Refresh'}
      </button>
      <Table data={data} {...paginationProps} />
    </>
  )}
</Data2>
```

---

## 🎯 Cas d'usage concrets

### 1. Refresh Table Button

```typescript
function IngredientsPage2() {
  const [refreshCount, setRefreshCount] = useState(0);

  return (
    <>
      <button onClick={() => setRefreshCount(p => p + 1)}>
        🔄 Refresh Data
      </button>

      <Data2
        cacheControl={{ cacheId: refreshCount }}
        fetchData={fetchIngredients}
        pagination={pagination}
      >
        <IngredientTable2 />
      </Data2>
    </>
  );
}
```

### 2. Auto-Refresh on Creation

```typescript
function IngredientsPage2() {
  const [refreshCount, setRefreshCount] = useState(0);
  const { createIngredient } = useIngredients();

  const handleCreate = async (data) => {
    await createIngredient(data);
    setRefreshCount(p => p + 1);  // ← Refresh list after create
  };

  return (
    <Data2
      cacheControl={{ cacheId: refreshCount }}
      fetchData={fetchIngredients}
      pagination={pagination}
    >
      <IngredientTable2 />
    </Data2>
  );
}
```

### 3. Polling / Periodic Refresh

```typescript
function IngredientsPage2() {
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(
      () => setRefreshCount(p => p + 1),
      30000  // Refresh every 30 seconds
    );

    return () => clearInterval(interval);
  }, []);

  return (
    <Data2
      cacheControl={{ cacheId: refreshCount }}
      fetchData={fetchIngredients}
      pagination={pagination}
    >
      <IngredientTable2 />
    </Data2>
  );
}
```

### 4. Cache Busting für HTTP Caches

```typescript
// Backend
app.get('/api/ingredients', (req, res) => {
	// Ignore cacheId for logic, it's just for HTTP cache busting
	const { cacheId, ...filterParams } = req.query;

	res.set('Cache-Control', 'public, max-age=3600');
	// cacheId en URL query string force un nouveau GET
	// même si le contenu est identique

	return res.json(getIngredients(filterParams));
});
```

---

## ⚖️ Avantages vs Inconvénients

### ✅ Avantages

1. **Flexibilité**: Permet au user de forcer un refresh quand il le souhaite
2. **Cache busting**: Résout les problèmes de cache HTTP/CDN
3. **Simple**: Juste un nombre incrementé dans la query
4. **Non-invasif**: Optionnel, n'affecte pas les autres features
5. **Performant**: Une simple comparaison numérique (cacheId !== prevCacheId)
6. **Observable**: Facile à tracer dans les logs/analytics

### ❌ Inconvénients

1. **Peut encourager les refreshes inutiles**: Si abusé
2. **URLs lourdes**: Chaque cacheId change l'URL (pas idéal pour le bookmarking)
3. **Confus avec query params**: Pas clair si c'est du cache ou un filtre

### 🛡️ Mitigation

- Documenter clairement que `cacheId` n'est **pas** un paramètre métier
- Ne pas exposer directement dans la query string UI
- Intégrer dans `buildQuery()` **après** les features métier

---

## 📊 Comparaison avec alternatives

| Approche              | Avantage                      | Inconvénient               |
| --------------------- | ----------------------------- | -------------------------- |
| **cacheId** (Proposé) | Contrôle explicite du refresh | Ajoute un param à la query |
| **etag + 304**        | Standard HTTP                 | Complexe à implémenter     |
| **Query polling**     | Simple                        | Consomme des ressources    |
| **WebSocket**         | Temps réel                    | Overhead réseau            |
| **Service Worker**    | Cache avancé                  | Complexité navigateur      |
| **React Query / SWR** | Cache automatique             | Dépendance externe         |

---

## 🚀 Implémentation recommandée

### Phase 1: Ajouter support dans `Data2`

- Ajouter `cacheControl?: { cacheId: number }` à `Data2Props`
- Intégrer `cacheId` dans la query composée

### Phase 2: Créer hook `useCacheControl`

```typescript
// Simplifie l'utilisation et permet des cas avancés
function useCacheControl(initialValue = 0): {
	cacheId: number;
	actions: { refresh: () => void; reset: () => void };
};
```

### Phase 3: Ajouter aux pages

- `Ingredients2Page`: Ajouter bouton Refresh
- Tester avec HTTP cache (DevTools Network)
- Valider que les refreshes forcent un nouveau GET

### Phase 4: Documentation

- Documenter le pattern dans `.claude/docs/`
- Exemples avec polling, auto-refresh, manual refresh

---

## 📝 Résumé

**Un `cacheId` apporte:**

1. ✅ Contrôle explicite du refresh pour l'utilisateur
2. ✅ Cache busting HTTP/CDN
3. ✅ Gestion fine des requêtes dupliquées
4. ✅ Debugging/Analytics amélioré
5. ✅ Pattern simple et composable

**C'est une excellente addition** à l'architecture headless composable car:

- Orthogonal aux autres features (pagination, search, filter, sort)
- Optionnel (par défaut = 0, pas de changement)
- Type-safe avec TypeScript
- Facile à tester et documenter
