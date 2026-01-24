# Plan: Système Générique de Gestion d'État URL pour Onglets

## Objectif

Créer un hook générique `useUrlState` pour gérer l'état dans l'URL de manière réutilisable pour TOUS les aspects de l'application (onglets, layout, filters, panels, etc.) avec un système de namespacing par groupe/composant.

## Problèmes Actuels

1. **Code répétitif**: `useProjectsV2State`, `usePanelLayout`, `useInterventionFilters` réimplémentent la même logique
2. **Incohérence**: Certains onglets ont URL state, d'autres non
3. **Complexité**: `usePanelLayout` fait 260 lignes pour gérer URL + layout
4. **Pas de nesting standardisé**: Pas de pattern clair pour les groupes d'onglets imbriqués

## Architecture Proposée

### 1. Hook Générique: `useUrlState<T>`

**Fichier**: `packages/web-frontend/src/framework/hooks/useUrlState.ts`

**API**:

```typescript
function useUrlState<T>(
	key: string, // Namespace key (ex: "ws.123.scripts.layout")
	defaultValue: T, // Valeur par défaut
	options?: {
		serialize?: (value: T) => string;
		deserialize?: (value: string) => T;
		debounce?: number; // Délai avant écriture URL (ms)
	}
): [T, (value: T) => void];
```

**Fonctionnalités**:

- ✅ Lecture/écriture automatique dans l'URL
- ✅ Serialization/deserialization customizable
- ✅ Debouncing optionnel
- ✅ Nettoyage automatique (supprime param quand = defaultValue)
- ✅ Sync bidirectionnel (URL → state, state → URL)

### 2. Cas d'Usage Génériques

`useUrlState` est utilisable pour TOUS les aspects d'état URL:

#### a) Onglets (Tabs)

```typescript
// Dans WorkspacePanel
const [view] = useUrlState(`workspace.${workspaceId}.view`, 'tasks');

// Wrapper optionnel pour Radix UI
<TabsWithUrlState groupId={`workspace.${workspaceId}.view`} defaultValue="tasks">
  <TabsList>
    <TabsTrigger value="tasks">Tasks</TabsTrigger>
    <TabsTrigger value="scripts">Scripts</TabsTrigger>
  </TabsList>
</TabsWithUrlState>
```

#### b) Layout Selector

```typescript
// Dans ScriptsPanel
const [layout, setLayout] = useUrlState(`workspace.${workspaceId}.scripts.layout`, 'full');

<LayoutSelector value={layout} onChange={setLayout} />
// Pas besoin de wrapper spécifique!
```

#### c) Filters / Search

```typescript
// Dans InterventionsPage
const [status] = useUrlState('interventions.filter.status', 'all');
const [search] = useUrlState('interventions.search', '', { debounce: 300 });

<FilterBar status={status} search={search} />
```

#### d) Panel States

```typescript
// Dans un composant quelconque
const [sidebarOpen] = useUrlState('app.sidebar.open', true, {
  serialize: (v) => v ? '1' : '0',
  deserialize: (s) => s === '1',
});

<Sidebar open={sidebarOpen} />
```

### 3. Composant Wrapper: `<TabsWithUrlState>` (Optionnel)

**Fichier**: `packages/web-frontend/src/framework/components/primitives/TabsWithUrlState.tsx`

**Important**: C'est juste un wrapper de convenance pour les onglets. `useUrlState` peut être utilisé directement dans n'importe quel composant.

**API**:

```typescript
interface TabsWithUrlStateProps {
  groupId: string;              // ID unique du groupe (ex: "workspace.123.view")
  defaultValue: string;         // Tab par défaut
  children: React.ReactNode;
  onValueChange?: (value: string) => void;  // Callback optionnel
}

// Usage simplifié pour onglets
<TabsWithUrlState groupId="workspace.123.view" defaultValue="tasks">
  <TabsList>
    <TabsTrigger value="tasks">Tasks</TabsTrigger>
    <TabsTrigger value="scripts">Scripts</TabsTrigger>
  </TabsList>
  <TabsContent value="tasks">...</TabsContent>
  <TabsContent value="scripts">...</TabsContent>
</TabsWithUrlState>
```

**Bénéfices**:

- Réduit le boilerplate pour les onglets Radix UI
- Namespace automatique via `groupId`
- Reste optionnel: on peut utiliser `useUrlState` directement

### 4. Structure URL avec Namespacing

**Format**: `?{groupId}={value}`

**Exemples Concrets**:

**Niveau 1 - Sélection projet** (top-level state):

```
?project.id=proj123
```

**Niveau 2 - Workspace dans projet** (dépend de projet):

```
?project.id=proj123&project.proj123.workspace.id=ws456
```

**Niveau 3 - View dans workspace** (dépend de workspace):

```
?project.id=proj123
&project.proj123.workspace.id=ws456
&project.proj123.workspace.ws456.view=scripts
```

**Niveau 4 - Layout + Panels** (état spécifique au composant ScriptsPanel):

```
?project.id=proj123
&project.proj123.workspace.id=ws456
&project.proj123.workspace.ws456.view=scripts
&project.proj123.workspace.ws456.scripts.layout=split
&project.proj123.workspace.ws456.scripts.panels=dev:backend,dev:frontend
```

**Note**: Le `layout` et `panels` sont gérés par `useUrlState` dans le composant `ScriptsPanel`, PAS par un wrapper d'onglet. Chaque composant peut utiliser `useUrlState` pour son propre état.

### 5. Groupes Isolés vs Imbriqués

**Isolés** (pas de dépendance):

```typescript
// Groupe A: Thème global
const [theme] = useUrlState('app.theme', 'light');

// Groupe B: Sidebar state (indépendant de A)
const [sidebarOpen] = useUrlState('app.sidebar.open', true);

// URL: ?app.theme=dark&app.sidebar.open=false
```

**Imbriqués** (B dépend de A):

```typescript
// Groupe A: Project selection
const [projectId] = useUrlState('project.id', null);

// Groupe B: Workspace dans project (namespace dynamique)
const wsNs = projectId ? `project.${projectId}.workspace` : 'project._.workspace';
const [workspaceId] = useUrlState(`${wsNs}.id`, null);

// Quand projectId change → wsNs change → workspaceId reset automatique
// URL: ?project.id=p1&project.p1.workspace.id=w1
```

## Phase 1: Implémentation Core

### Fichier 1: `useUrlState.ts`

**Path**: `packages/web-frontend/src/framework/hooks/useUrlState.ts`

**Code**:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useUrlState<T>(
	key: string,
	defaultValue: T,
	options: {
		serialize?: (value: T) => string;
		deserialize?: (value: string) => T;
		debounce?: number;
	} = {}
): [T, (value: T) => void] {
	const [searchParams, setSearchParams] = useSearchParams();

	const serialize = options.serialize || (v => String(v));
	const deserialize = options.deserialize || (s => s as unknown as T);
	const debounceMs = options.debounce || 0;

	// Read from URL
	const [value, setValue] = useState<T>(() => {
		const urlValue = searchParams.get(key);
		if (urlValue === null) return defaultValue;
		try {
			return deserialize(urlValue);
		} catch {
			return defaultValue;
		}
	});

	// Debounced write to URL
	const timeoutRef = useRef<NodeJS.Timeout>();

	const updateUrl = useCallback(
		(newValue: T) => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);

			timeoutRef.current = setTimeout(() => {
				setSearchParams(
					prev => {
						const next = new URLSearchParams(prev);

						if (newValue === defaultValue || newValue === null || newValue === undefined) {
							next.delete(key); // Clean URL
						} else {
							next.set(key, serialize(newValue));
						}

						return next;
					},
					{ replace: true }
				);
			}, debounceMs);
		},
		[key, serialize, defaultValue, debounceMs, setSearchParams]
	);

	// Sync with external URL changes
	useEffect(() => {
		const urlValue = searchParams.get(key);
		if (urlValue === null) {
			setValue(defaultValue);
		} else {
			try {
				setValue(deserialize(urlValue));
			} catch {
				setValue(defaultValue);
			}
		}
	}, [searchParams, key, defaultValue, deserialize]);

	// Custom setter
	const setValueAndUrl = useCallback(
		(newValue: T) => {
			setValue(newValue);
			updateUrl(newValue);
		},
		[updateUrl]
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	return [value, setValueAndUrl];
}
```

### Fichier 2: `TabsWithUrlState.tsx`

**Path**: `packages/web-frontend/src/framework/components/primitives/TabsWithUrlState.tsx`

**Code**:

```typescript
import { useUrlState } from '@framework/hooks/useUrlState';
import { Tabs } from './tabs';

interface TabsWithUrlStateProps {
  groupId: string;
  defaultValue: string;
  children: React.ReactNode;
  onValueChange?: (value: string) => void;
  className?: string;
}

export function TabsWithUrlState({
  groupId,
  defaultValue,
  children,
  onValueChange,
  className,
}: TabsWithUrlStateProps) {
  const [activeTab, setActiveTab] = useUrlState(groupId, defaultValue);

  const handleValueChange = (value: string) => {
    setActiveTab(value);
    onValueChange?.(value);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleValueChange} className={className}>
      {children}
    </Tabs>
  );
}
```

## Phase 2: Tests Complets

### Fichier: `useUrlState.test.tsx`

**Path**: `packages/web-frontend/src/framework/hooks/useUrlState.test.tsx`

**Scénarios obligatoires**:

1. **Groupe simple**:
    - ✅ Lecture valeur depuis URL
    - ✅ Écriture valeur vers URL
    - ✅ Fallback sur defaultValue si absent
    - ✅ Nettoyage URL quand = defaultValue

2. **Deux groupes isolés**:
    - ✅ Gestion de 2 keys indépendantes
    - ✅ Pas d'interférence entre groupes

3. **Deux groupes imbriqués**:
    - ✅ Reset enfant quand parent change
    - ✅ Préservation enfant si parent inchangé

4. **Trois groupes imbriqués**:
    - ✅ Cascade de 3 niveaux
    - ✅ Reset tous enfants quand root change

5. **Serialization complexe**:
    - ✅ Arrays: `serialize: (arr) => arr.join(',')`, `deserialize: (s) => s.split(',')`
    - ✅ Objects: `serialize: JSON.stringify`, `deserialize: JSON.parse`
    - ✅ Custom encoding: `encodeURIComponent` pour caractères spéciaux

6. **Edge cases**:
    - ✅ Debouncing: Pas d'écriture avant délai
    - ✅ Erreurs de parsing: Fallback sur defaultValue
    - ✅ Valeurs null/undefined: Nettoyage URL

## Phase 3: Migration des Hooks Existants

### 3.1 Simplifier `usePanelLayout`

**Fichier**: `packages/web-frontend/src/app/pages/workspaces/scripts/usePanelLayout.ts`

**AVANT** (260 lignes complexes):

```typescript
export function usePanelLayout({ workspaceId }: Options) {
	// 260 lignes de gestion URL + state + effects...
}
```

**APRÈS** (50 lignes simples):

```typescript
export function usePanelLayout({ workspaceId }: Options) {
	const ns = `workspace.${workspaceId}.scripts`;

	// Layout: utilisé directement avec LayoutSelector (pas d'onglet!)
	const [mode, setLayoutMode] = useUrlState(`${ns}.layout`, 'full' as LayoutMode);

	// Panels: serialization custom pour gérer arrays
	const [panels, setPanels] = useUrlState<PanelState[]>(
		`${ns}.panels`,
		[{ id: generatePanelId(), scriptName: null }],
		{
			serialize: panels => {
				const names = panels.map(p => p.scriptName).filter(Boolean);
				return names.join(',');
			},
			deserialize: str => {
				const names = str.split(',').filter(Boolean);
				return names.map(name => ({ id: generatePanelId(), scriptName: name }));
			},
		}
	);

	// Reste: fonctions add/remove panels (pas de gestion URL - c'est automatique!)
	const addPanel = () => {
		setPanels([...panels, { id: generatePanelId(), scriptName: null }]);
	};

	const removePanel = (id: string) => {
		setPanels(panels.filter(p => p.id !== id));
	};

	return { mode, setLayoutMode, panels, addPanel, removePanel };
}
```

**Utilisation dans ScriptsPanel**:

```typescript
function ScriptsPanel({ workspaceId }) {
  const { mode, setLayoutMode, panels } = usePanelLayout({ workspaceId });

  return (
    <>
      {/* Layout selector: utilise useUrlState sous le capot */}
      <LayoutSelector value={mode} onChange={setLayoutMode} />

      {/* Panels grid: affiche selon le layout */}
      <div className={getLayoutClass(mode)}>
        {panels.map(panel => <ScriptPanel key={panel.id} {...panel} />)}
      </div>
    </>
  );
}
```

### 3.2 Simplifier `useProjectsV2State`

**Fichier**: `packages/web-frontend/src/app/hooks/useProjectsV2State.ts`

**AVANT** (190 lignes):

```typescript
export function useProjectsV2State() {
	// Logique complexe pour project + workspace + view
	// + localStorage fallback
	// + auto-selection
}
```

**APRÈS** (80 lignes):

```typescript
export function useProjectsV2State() {
	const [projectId, setProjectId] = useUrlState('project.id', null as string | null);

	const ns = projectId ? `project.${projectId}` : 'project._';
	const [workspaceId, setWorkspaceId] = useUrlState(`${ns}.workspace.id`, null as string | null);
	const [view, setView] = useUrlState(`${ns}.view`, 'tasks' as WorkspaceView);

	// Auto-selection logic (conservé)
	// localStorage fallback (optionnel, peut être retiré)
	// ...
}
```

### 3.3 Migrer `WorkspaceTabs`

**Fichier**: `packages/web-frontend/src/app/pages/projects2/WorkspaceTabs.tsx`

**AVANT** (custom TabButton + onClick):

```typescript
<TabButton
  active={activeView === 'tasks'}
  onClick={() => onViewChange('tasks')}
>
  Tasks
</TabButton>
```

**APRÈS** (TabsWithUrlState):

```typescript
<TabsWithUrlState groupId={`workspace.${workspaceId}.view`} defaultValue="tasks">
  <TabsList>
    <TabsTrigger value="tasks">Tasks</TabsTrigger>
    <TabsTrigger value="scripts">Scripts</TabsTrigger>
  </TabsList>
  <TabsContent value="tasks"><TasksPanel /></TabsContent>
  <TabsContent value="scripts"><ScriptsPanel /></TabsContent>
</TabsWithUrlState>
```

## Phase 4: Exemples d'Intégration

### Exemple 1: Page ProjectsV2 (3 niveaux imbriqués)

```typescript
function ProjectsV2Page() {
  // Niveau 1: Project
  const [projectId] = useUrlState('project.id', null);

  // Niveau 2: Workspace (dépend de project)
  const wsNs = projectId ? `project.${projectId}.workspace` : 'project._.workspace';
  const [workspaceId] = useUrlState(`${wsNs}.id`, null);

  // Niveau 3: View dans workspace (dépend de workspace)
  const viewNs = workspaceId ? `${wsNs}.${workspaceId}` : `${wsNs}._`;

  return (
    <div>
      <ProjectSelector value={projectId} onChange={setProjectId} />

      {projectId && (
        <>
          <WorkspaceSelector value={workspaceId} onChange={setWorkspaceId} />

          {workspaceId && (
            <TabsWithUrlState groupId={`${viewNs}.view`} defaultValue="tasks">
              <TabsList>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="scripts">Scripts</TabsTrigger>
              </TabsList>
              <TabsContent value="tasks"><TasksPanel /></TabsContent>
              <TabsContent value="scripts"><ScriptsPanel /></TabsContent>
            </TabsWithUrlState>
          )}
        </>
      )}
    </div>
  );
}
```

### Exemple 2: Deux Groupes Isolés

```typescript
function SettingsPage() {
	// Groupe A: Section sélectionnée (indépendant)
	const [section] = useUrlState('settings.section', 'general');

	// Groupe B: Thème (indépendant de A)
	const [theme] = useUrlState('settings.theme', 'light');

	// URL: ?settings.section=profile&settings.theme=dark
}
```

## Vérification E2E

### Test 1: Groupe Simple

1. Naviguer vers `/projects-v2`
2. Sélectionner un projet
3. **Vérifier URL**: `?project.id=proj123`
4. Refresh page (F5)
5. **Vérifier**: Projet toujours sélectionné

### Test 2: Deux Groupes Isolés

1. Aller sur `/settings`
2. Sélectionner section "Profile"
3. Changer thème vers "Dark"
4. **Vérifier URL**: `?settings.section=profile&settings.theme=dark`
5. Refresh
6. **Vérifier**: Les deux états préservés

### Test 3: Deux Groupes Imbriqués

1. `/projects-v2`: Sélectionner project `proj123`
2. Sélectionner workspace `ws456`
3. **Vérifier URL**: `?project.id=proj123&project.proj123.workspace.id=ws456`
4. Changer de projet → `proj789`
5. **Vérifier URL**: `?project.id=proj789` (workspace.id supprimé!)
6. **Vérifier**: Workspace reset automatiquement

### Test 4: Trois Groupes Imbriqués

1. Sélectionner project → workspace → onglet Scripts → layout Split
2. **Vérifier URL complète**:
    ```
    ?project.id=p1
    &project.p1.workspace.id=w1
    &project.p1.workspace.w1.view=scripts
    &project.p1.workspace.w1.scripts.layout=split
    &project.p1.workspace.w1.scripts.panels=dev:backend,dev:frontend
    ```
3. Changer de workspace → `w2`
4. **Vérifier**: `view`, `layout`, `panels` disparaissent de l'URL
5. **Vérifier**: ScriptsPanel réinitialisé

### Test 5: URL Share

1. Configurer un état complexe (3 niveaux)
2. Copier l'URL
3. Ouvrir dans nouvel onglet
4. **Vérifier**: État exactement restauré
5. **Vérifier**: Tous les niveaux imbriqués corrects

### Test 6: Debouncing

1. Créer un input avec debounce: `useUrlState('search', '', { debounce: 300 })`
2. Taper rapidement "hello"
3. **Vérifier**: URL ne change qu'après 300ms
4. **Vérifier**: Pas de flood d'updates

## Fichiers Critiques

### Nouveaux Fichiers

**Core**:

- `packages/web-frontend/src/framework/hooks/useUrlState.ts` (120 lignes)
- `packages/web-frontend/src/framework/hooks/useUrlState.test.tsx` (500 lignes - tests complets)

**Composants**:

- `packages/web-frontend/src/framework/components/primitives/TabsWithUrlState.tsx` (40 lignes)

### Fichiers à Modifier

**Hooks existants** (simplification):

- `packages/web-frontend/src/app/pages/workspaces/scripts/usePanelLayout.ts` (260→50 lignes)
- `packages/web-frontend/src/app/hooks/useProjectsV2State.ts` (190→80 lignes)

**Composants tabs** (migration):

- `packages/web-frontend/src/app/pages/projects2/WorkspaceTabs.tsx`
- `packages/web-frontend/src/app/pages/projects2/WorkspacePanel.tsx`

### Fichiers à Retirer (optionnel)

- `packages/web-frontend/src/app/pages/interventions/useInterventionFilters.ts` (peut être remplacé par useUrlState direct)

## Ordre d'Exécution

1. **Phase 1**: Implémenter `useUrlState` + `TabsWithUrlState`
2. **Phase 2**: Écrire tests complets (tous les scénarios)
3. **Phase 3**: Migrer `usePanelLayout` (plus gros impact)
4. **Phase 4**: Migrer `useProjectsV2State`
5. **Phase 5**: Migrer `WorkspaceTabs` / `WorkspacePanel`
6. **Phase 6**: Tests E2E + validation

## Critères de Succès

1. ✅ Tous les tests unitaires passent (6 scénarios)
2. ✅ `usePanelLayout` réduit de 260 → 50 lignes
3. ✅ `useProjectsV2State` réduit de 190 → 80 lignes
4. ✅ URL refresh preserves state (tous niveaux)
5. ✅ Changement parent reset enfants automatiquement
6. ✅ URL propres (pas de params par défaut)
7. ✅ Pas de régression sur fonctionnalités existantes

## Risques et Mitigations

### Risque 1: Breaking changes URL

**Impact**: URLs existantes (bookmarks, historique) deviennent invalides
**Mitigation**:

- Garder backward compat avec ancien format pendant migration
- Ajouter parsing fallback dans `useUrlState`

### Risque 2: Performance (trop de rerenders)

**Impact**: useEffect qui écoute searchParams peut causer rerenders
**Mitigation**:

- Debouncing intégré
- Utiliser `replace: true` pour éviter historique pollué
- Memoization dans composants

### Risque 3: localStorage conflict

**Impact**: Ancien code utilisait localStorage + URL
**Mitigation**:

- Décider: URL = source de vérité, localStorage = cache
- Ou: Retirer complètement localStorage

## Notes Additionnelles

### Choix de Design

**Namespace separator**: `.` (ex: `project.123.workspace.id`)

- ✅ Lisible, standard
- ✅ Facile à parser
- ❌ Conflit potentiel si ID contient `.` (rare)

**Debounce par défaut**: `0ms`

- ✅ Updates immédiats par défaut
- ✅ Opt-in si besoin (ex: search input)

**localStorage**: Retiré

- URL = seule source de vérité
- Simplifie l'architecture
- Meilleure shareability

### API Alternative Considérée (Rejetée)

```typescript
// Approche "provider" (trop complexe)
<UrlStateProvider namespace="workspace.123">
  <TabsWithUrlState key="view" defaultValue="tasks">
    ...
  </TabsWithUrlState>
</UrlStateProvider>
```

**Pourquoi rejetée**:

- Trop de boilerplate
- Moins flexible pour nesting dynamique
- Pattern "string key" plus simple et direct

## Conclusion

Ce plan crée un système générique et testable pour gérer l'état URL à travers toute l'application, avec support complet pour:

- ✅ Groupes isolés
- ✅ Groupes imbriqués (2-3 niveaux)
- ✅ Serialization custom
- ✅ Debouncing
- ✅ Nettoyage automatique URL
- ✅ Integration transparente avec Radix UI tabs

Le code sera plus maintenable, plus testable, et plus cohérent.
