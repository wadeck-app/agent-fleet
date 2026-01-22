# Audit Complet: Pages et Composants

## Objectif

Auditer toutes les pages et composants du projet pour vérifier leur conformité aux principes architecturaux:

1. **Hiérarchie des composants** (Base → Intermédiaire → End)
2. **Distribution du CSS** (Maximum → Minimal → Quasi none)
3. **Séparation des responsabilités**
4. **Composition via hooks**
5. **Principes antifragiles**

## Critères de Notation

### Pages (app/pages/\*)

- [ ] 0-5 classes CSS max (quasi none)
- [ ] Utilisation de hooks composables
- [ ] Pas de logique métier directe
- [ ] Délégation styling aux composants
- [ ] Gestion d'état via hooks

### Composants Base (primitives, forms)

- [ ] Styling centralisé (CVA ou équivalent)
- [ ] Zéro logique métier
- [ ] Réutilisables
- [ ] Composables
- [ ] Documentation/types clairs

### Composants Intermédiaires (layouts, domain, hooks)

- [ ] Styling minimal (structural only)
- [ ] Logique métier encapsulée
- [ ] Composent les composants base
- [ ] Pas de dépendances pages

### Note Globale

- A+ (95-100%): Parfait, exemple à suivre
- A (85-94%): Très bon, quelques améliorations mineures
- B (75-84%): Bon, améliorations recommandées
- C (65-74%): Acceptable, améliorations nécessaires
- D (<65%): Non conforme, refactoring requis

---

## Phase 1: Exploration en parallèle ✅ TERMINÉ

3 agents Explore lancés en parallèle - Résultats compilés ci-dessous.

---

# RAPPORT D'AUDIT CONSOLIDÉ

## Résumé Exécutif

**Audit complet effectué sur:**

- **20 pages** (app/pages/\*)
- **38 composants de base** (primitives, forms, fields)
- **30+ composants intermédiaires** (layouts, domain, navigation)
- **21 hooks framework** (framework/hooks/)

**Score Global du Projet: A (91/100)**

### Distribution des Notes

#### Pages (20 total)

- **A+ (Excellent)**: 8 pages (40%)
- **A (Très bon)**: 8 pages (40%)
- **B à C+ (À améliorer)**: 4 pages (20%)

#### Composants Base (38 total)

- **A+ (Excellent)**: 24 composants (63%)
- **A (Très bon)**: 12 composants (32%)
- **B+ à C+ (À améliorer)**: 2 composants (5%)

#### Composants Intermédiaires & Hooks (30+ total)

- **A+ (Excellent)**: 22 composants/hooks (73%)
- **A (Très bon)**: 8 composants (27%)
- **Aucun en dessous de A**

---

## SECTION 1: AUDIT DES PAGES (20 pages)

### Pages Nécessitant Amélioration (Priorité Haute)

#### 1. FlowEditorPage - Grade C+ (70%)

**Fichier:** `app/pages/flows/flow-editor/FlowEditorPage.tsx`

**Problèmes CSS (Grade D):**

- 16+ classes Tailwind (violations: layout flex/grid, styling inline)
- Classes: `mb-6`, `flex`, `items-center`, `gap-3`, `text-3xl`, `font-bold`, `h-[calc(100vh-12rem)]`, `rounded-lg`, `border`, `bg-card`, etc.

**Problèmes Logique (Grade C):**

- Logique d'édition de flow dans la page (mutations directes lines 84-92)
- Gestion d'erreur manuelle avec useEffect pour toast
- State tracking via ref (anti-pattern React)
- Heavy use of "any" type casts

**Recommandations:**

1. Extraire FlowEditor orchestration vers composant layout séparé
2. Déplacer error state dans useFlowEditor hook
3. Remplacer ref-based state tracking par React state propre
4. Créer composant wrapper présentationnel pur

---

#### 2. InterventionDetailPage - Grade C (68%)

**Fichier:** `app/pages/interventions/InterventionDetailPage.tsx`

**Problèmes CSS (Grade B):**

- 7 classes (acceptable mais mixe structural + utility)

**Problèmes Logique CRITIQUES (Grade D):**

- **Appels API directs dans useEffect (line 53)** ❌
- Gestion manuelle loading/error state
- Logique de soumission dans page
- console.error pour gestion d'erreur
- Skeleton hardcodé avec Array.from loops

**Recommandations URGENTES:**

1. **Créer useInterventionDetail hook** pour API/state management
2. Déplacer skeleton vers LoadingState component
3. Implémenter error boundary propre
4. Ajouter caching/memoization

---

#### 3. ProjectsV2Page - Grade B- (78%)

**Fichier:** `app/pages/projects2/ProjectsV2Page.tsx`

**Problèmes CSS (Grade C+):**

- 16+ classes avec layout components (flex, grid, color utilities)
- Heavy inline JSX pour empty states

**Problèmes Logique (Grade C):**

- **Appels API directs** via projectsApi (lines 69-98) ❌
- Logique localStorage inline (lines 37-58)
- State management complexe éparpillé
- Helper functions définies dans page

**Recommandations:**

1. Extraire vers useProjects hook avec API/state
2. Extraire vers useProjectWorkspaces hook
3. Déplacer localStorage logic vers custom hook
4. Extraire empty state components
5. Simplifier avec pattern useMutationCleanup

---

#### 4. LoginPage - Grade B+ (82%)

**Fichier:** `app/pages/auth/LoginPage.tsx`

**Problèmes CSS (Grade B):**

- 11-15 classes (mostly structural mais nombreuses)

**Problèmes Logique (Grade B):**

- Validation de formulaire dans page (lines 52-68)
- Clearing d'erreur manuel dans useEffect
- Inline form JSX lourd

**Recommandations:**

1. Extraire validation vers custom hook
2. Utiliser form library (React Hook Form, Formik)
3. Extraire form JSX vers FormComponent

---

### Pages Excellentes (Références à Suivre)

#### TOP 3 - Implémentations de Référence (A+)

**1. IngredientsV5Page - Grade A+ (97%) 🏆**
**Fichier:** `app/pages/ingredients5/IngredientsV5Page.tsx`

- **CSS:** 5 classes (structural only) ✅
- **Hooks:** Utilise `useCrudPage` (composite hook remplaçant massive boilerplate)
- **Logique:** Parfaitement séparée, page purement présentationnelle
- **Pourquoi A+:** **Gold standard** - utilise le pattern composite hook le plus avancé

**2. InterventionsV2Page - Grade A+ (96%) 🏆**
**Fichier:** `app/pages/interventions/InterventionsV2Page.tsx`

- **CSS:** 3 classes ✅
- **Hooks:** 16+ hooks composables parfaitement orchestrés
- **Logique:** useInterventionsCrud + useInterventionFilters
- **Pourquoi A+:** CRUD complexe avec bulk actions, filtering parfait

**3. ProjectsPage - Grade A+ (95%) 🏆**
**Fichier:** `app/pages/projects/ProjectsPage.tsx`

- **CSS:** 3 classes ✅
- **Hooks:** 14+ hooks composables
- **Logique:** Séparation parfaite
- **Pourquoi A+:** Pattern de référence pour pages CRUD complexes

#### Autres Pages A+ (5 pages)

- **BooksPage** (95%) - Référence originale
- **IngredientsPage** (94%) - Référence originale
- **Ingredients3GridPage** (93%) - Grid layout avec hooks composables
- **Ingredients2TablePage** (93%) - Table layout avec hooks composables
- **DashboardPage** (93%) - Dashboard composition pattern

#### Pages A (Très Bonnes - 8 pages)

- TasksPage (94%) - CRUD avec domain filters
- WorkspacesPage (93%) - Data2 table pattern
- WorkersPage (93%) - Data2 table pattern
- InterventionsPage (92%) - Data2 card layout
- Ingredients4CarouselPage (90%) - Infinite scroll
- TaskDetailStackedPage (90%) - Detail page real-time
- TaskDetailSplitPage (89%) - Detail page split layout
- ProjectBoardPage (87%) - Kanban board pattern

---

## SECTION 2: AUDIT COMPOSANTS BASE (38 composants)

### Composants à Déplacer (CRITIQUE)

#### 1. EditableText.tsx - Grade C+ (70%) ⚠️ MAL PLACÉ

**Localisation Actuelle:** `/components/forms/EditableText.tsx`
**Localisation Correcte:** `/features/inline-editing/EditableText.tsx`

**Problèmes CRITIQUES:**

- **Logique métier significative:** edit state, validation, error handling, async save
- **État complexe:** isEditing, editValue, isSaving, error
- **Messages validatio hardcodés:** "Name cannot be empty", etc.
- **onSave callback** avec async error handling
- **C'est une feature domain, pas un composant base**

**Actions URGENTES:**

1. ✅ Déplacer vers `/features/inline-editing/`
2. ✅ Extraire state management vers custom hook `useEditableText()`
3. ✅ Extraire validation vers utility function
4. ✅ Rendre error messages personnalisables via props

---

#### 2. SearchBar.tsx - Grade B+ (81%) ⚠️ MAL PLACÉ

**Localisation Actuelle:** `/components/forms/SearchBar.tsx`
**Localisation Correcte:** `/features/search/SearchBar.tsx`

**Problèmes:**

- Domain-specific (search bar spécifiquement)
- Logique de conditional rendering (clear button)
- Pas un primitive form component

**Actions:**

1. ✅ Déplacer vers `/features/search/`
2. ✅ Documenter comme feature-level, pas primitive

---

### Composants Base Excellents (TOP 10)

**Tous les composants suivants sont A/A+ - Implémentations exemplaires:**

#### Primitives (Grade A+)

1. **Button.tsx** (95%) - CVA avec 6 variants × multiple sizes, 90+ classes gérées
2. **Badge.tsx** (94%) - CVA avec 9 variants (success, warning, info, alert, etc.)
3. **Toggle.tsx** (92%) - CVA avec 2 variants × 3 sizes
4. **TabButton.tsx** (93%) - CVA avec support icon/badge

#### Forms (Grade A)

5. **Input.tsx** (90%) - Base input avec type safety
6. **Checkbox.tsx** (91%) - Support indeterminate state
7. **Switch.tsx** (91%) - 2 size variants (sm/default)
8. **Select.tsx** (91%) - 10 sub-components pour composition

#### Feature Inputs (Grade A)

9. **TextInput.tsx** (92%) - Uses BASE_INPUT_CLASSES, type-safe
10. **ComboboxInput.tsx** (89%) - Searchable select avec filtering

#### Feature Fields (Grade A+)

11. **IntegerField.tsx** (93%) - Convenience wrapper excellent
12. **TextField.tsx** (92%) - Complete field avec label/error
13. **SwitchField.tsx** (91%) - Excellent use de FieldDescription

### Métriques de Qualité - Composants Base

| Métrique                             | Score | Status        |
| ------------------------------------ | ----- | ------------- |
| **Styling Centralization**           | 92%   | ✅ Excellent  |
| **Zero Business Logic (Primitives)** | 100%  | ✅ Perfect    |
| **Type Safety**                      | 95%   | ✅ Excellent  |
| **Reusability**                      | 91%   | ✅ Excellent  |
| **Composition Pattern Quality**      | 94%   | ✅ Excellent  |
| **Documentation**                    | 70%   | ⚠️ Needs work |
| **Misplaced Components**             | 2/39  | ⚠️ À corriger |

---

## SECTION 3: AUDIT COMPOSANTS INTERMÉDIAIRES (30+ composants)

### Tous Composants/Hooks Grade A ou A+

#### Composants Advanced (Framework)

- **CrudTable** (A+) - Generic CRUD table avec type params
- **BulkActionBar** (A+) - CVA-based, minimal styling
- **Combobox** (A) - 13 sub-components, composition excellente
- **Field System** (A) - 10 composants modulaires (FieldLabel, FieldError, etc.)
- **InputGroup System** (A+) - 6 composants composables

#### Composants Layout (Framework)

- **Page** (A+) - 4 classes, minimal perfect
- **PageHeader** (A+) - 8 classes, flexible layout
- **PageContainer** (A+) - CVA variants excellent
- **FilterGrid** (A+) - CVA grid layout clean
- **PageContent** (A) - Wrapper sémantique (debatable utility)

#### Composants Domain (App)

- **BulkDeleteWorkflow** (A+) - 0 classes CSS, pure logic, highly reusable
- **BookDialog** (A) - 4 classes, memoization strategy good
- **IngredientDialog** (A) - Similar à BookDialog (potential duplication)

#### Composants Navigation (App)

- **DesktopSidebar** (A+) - Composition excellente de sub-widgets
- **MobileSidebar** (A) - Auto-close on navigation avec useEffect
- **SidebarNav** (A) - Active route detection avec nested routes
- **ThemeToggleEnhanced** (A) - 3 variants (icon, labeled, switch)
- **WorkersWidget** (A) - Real-time updates, duration formatting
- **AppSwitcher** (A) - Placeholder/stub (needs implementation)

#### Hooks Framework (Tous A+)

- **useCrudPage** (A) - Composite hook remplaçant massive boilerplate
- **useBulkSelection** (A+) - Pure selection management
- **useDialog** (A+) - Dialog state avec convenience props
- **useAsyncData** (A+) - Async fetching avec race condition protection
- **useAbortableEffect** (A+) - Base abstraction pour async patterns
- **useCrudSuccessToast** (A+) - Standardized CRUD messages
- **useDeleteConfirmation** (A+) - Delete confirmation state
- **useBulkDeleteState** (A+) - Bulk delete state (~60 lines saved per page)

---

## SECTION 4: RECOMMANDATIONS PRIORITAIRES

### Priorité 1 - CRITIQUE (À faire immédiatement)

#### Pages

1. **InterventionDetailPage** - Créer `useInterventionDetail` hook, éliminer appels API directs
2. **ProjectsV2Page** - Créer `useProjects` + `useProjectWorkspaces` hooks
3. **FlowEditorPage** - Abstraire flow orchestration logic

#### Composants Base

4. **EditableText.tsx** - Déplacer vers `/features/inline-editing/`, extraire state vers hook
5. **SearchBar.tsx** - Déplacer vers `/features/search/`

### Priorité 2 - HAUTE (Prochaine sprint)

6. **LoginPage** - Intégrer form library (React Hook Form)
7. **ProjectBoardPage** - Extraire vers `useProjectBoard` hook
8. **BookDialog + IngredientDialog** - Unifier en generic `<EntityDialog>` wrapper
9. **UserMenu variants** - Consolider UserMenu, UserMenuEnhanced, UserMenuWithTheme

### Priorité 3 - MOYENNE (Future)

10. **AppSwitcher** - Implémenter fonctionnalité app switching réelle
11. **PageContent** - Évaluer si wrapper ajoute vraie valeur
12. **Standardize CVA** - Update Card.tsx pour utiliser CVA
13. **Documentation** - Créer component guidelines document

---

## SECTION 5: PATTERNS À PROPAGER

### Gold Standards Identifiés

#### 1. Pattern useCrudPage (IngredientsV5Page)

**Meilleur pattern pour pages CRUD simples**

- Single composite hook remplace 12+ hooks individuels
- Réduit boilerplate de ~200 lignes par page
- API claire et cohérente

#### 2. Pattern Data2 Composable (TasksPage, ProjectsPage)

**Meilleur pattern pour pages listing complexes**

- Hooks composables: pagination, sorting, search, selection, filters
- useRealtimeRefresh pour WebSocket integration
- useMutationCleanup pour mutation state

#### 3. Pattern BulkDeleteWorkflow (Domain)

**Meilleur pattern pour bulk operations**

- Generic avec type params, zéro dépendances domain
- Batch processing, error handling, progress toasts
- Réutilisable sur 7+ pages

#### 4. Pattern Three-Tier Components (Base)

**Architecture composants base exemplaire**

- **Primitives** (zero logic, pure presentation)
- **Inputs** (controlled components, minimal coercion)
- **Fields** (composition + label/error)

### Anti-Patterns à Éviter

❌ **Appels API directs dans pages** (InterventionDetailPage, ProjectBoardPage)
❌ **Validation dans pages** (LoginPage)
❌ **State management éparpillé** (ProjectsV2Page)
❌ **Ref-based state tracking** (FlowEditorPage)
❌ **Business logic dans composants base** (EditableText, SearchBar)

---

## SECTION 6: MÉTRIQUES GLOBALES

### Par Catégorie

| Catégorie                     | Composants | Moy. Grade | Status       |
| ----------------------------- | ---------- | ---------- | ------------ |
| **Pages**                     | 20         | A (88%)    | ✅ Excellent |
| **Composants Base**           | 39         | A (91%)    | ✅ Excellent |
| **Composants Intermédiaires** | 30+        | A+ (93%)   | ✅ Excellent |
| **Hooks Framework**           | 21         | A+ (95%)   | ✅ Parfait   |

### Distribution CSS par Niveau

| Niveau            | Classes CSS Moyennes | Conformité          |
| ----------------- | -------------------- | ------------------- |
| **Base**          | 50-90+ (via CVA)     | ✅ 100%             |
| **Intermédiaire** | 5-10                 | ✅ 95%              |
| **Pages**         | 0-5                  | ✅ 85% (4 pages >5) |

### Conformité Architecturale

| Principe                        | Conformité | Violations                                                     |
| ------------------------------- | ---------- | -------------------------------------------------------------- |
| **Zero CSS in pages**           | 85%        | 4 pages (FlowEditor, Projects V2, Ingredients variants, Login) |
| **Zero business logic in base** | 95%        | 2 composants (EditableText, SearchBar)                         |
| **Hook composability**          | 100%       | Aucune                                                         |
| **Component delegation**        | 95%        | 1 page (InterventionDetail)                                    |
| **API calls via hooks**         | 85%        | 3 pages (InterventionDetail, ProjectsV2, ProjectBoard)         |

---

## SECTION 7: ÉVOLUTION ARCHITECTURALE

### Patterns Identifiés par Génération

**Legacy (À migrer):**

- Appels API directs, manual state management
- **Exemples:** InterventionDetailPage, ProjectBoardPage
- **Recommandation:** Migrer vers Current/Gold

**Current (Bon, à maintenir):**

- Data2 avec composable hooks
- **Exemples:** TasksPage, ProjectsPage, WorkspacesPage
- **Recommandation:** Continue using

**Gold Standard (À propager):**

- Composite hooks (useCrudPage) + minimal page code
- **Exemples:** IngredientsV5Page
- **Recommandation:** Apply to new pages, migrate existing incrementally

---

## CONCLUSION

### Score Global: A (91/100)

**Forces Majeures:**

- ✅ 80% des pages sont A ou A+ (excellent)
- ✅ 95% des composants base sont A ou A+ (excellent)
- ✅ 100% des hooks sont A+ (parfait)
- ✅ Architecture three-tier impeccable
- ✅ Patterns antifragiles démontrés
- ✅ Séparation des responsabilités excellente

**Opportunités d'Amélioration:**

- ⚠️ 4 pages nécessitent refactoring (20%)
- ⚠️ 2 composants base mal placés (5%)
- ⚠️ 3 pages avec appels API directs (15%)

**Recommandations Clés:**

1. **Migrer 4 pages problématiques** vers patterns current/gold (1-2 sprints)
2. **Déplacer 2 composants base** vers features (1 jour)
3. **Propager useCrudPage pattern** aux nouvelles pages
4. **Documenter patterns gold standard** pour référence future

**Bottom Line:**
Le projet démontre une **architecture de classe mondiale** avec des patterns excellents. Les problèmes identifiés sont minoritaires (15-20%) et ont des solutions claires. La majorité du code (80%+) est exemplaire et devrait servir de référence.

---

---

## PLAN D'ACTION DÉTAILLÉ PAR ÉLÉMENT

### PRIORITÉ 1 - CRITIQUE (Sprint 1 - 5 jours)

#### Action 1.1: Refactor InterventionDetailPage

**Objectif:** Éliminer appels API directs, créer hook custom

**Approche Step-by-Step:**

1. **Créer useInterventionDetail.ts** (1h)

```typescript
// packages/web-frontend/src/app/hooks/useInterventionDetail.ts
export function useInterventionDetail(id: string | undefined) {
	const [intervention, setIntervention] = useState<Intervention | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Utiliser useAbortableEffect pour éviter race conditions
	useAbortableEffect(
		async signal => {
			if (!id) return;

			try {
				setLoading(true);
				const data = await interventionsApi.getIntervention(id);
				if (!signal.aborted) {
					setIntervention(data);
				}
			} catch (err) {
				if (!signal.aborted) {
					setError(getErrorMessage(err));
				}
			} finally {
				if (!signal.aborted) {
					setLoading(false);
				}
			}
		},
		[id]
	);

	const submitIntervention = useCallback(
		async (data: InterventionInput) => {
			// Logique de soumission
		},
		[id]
	);

	return { intervention, loading, error, submitIntervention };
}
```

2. **Créer LoadingState component** (30min)

```typescript
// packages/web-frontend/src/framework/components/feedback/LoadingState.tsx
export function LoadingState({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
```

3. **Refactor InterventionDetailPage** (1h)

```typescript
// Avant (ligne 53):
// useEffect(() => { /* fetch */ }, []);

// Après:
const { intervention, loading, error, submitIntervention } = useInterventionDetail(id);

useErrorToast({ error, clearError: () => {} });

if (loading) return <LoadingState />;
if (!intervention) return <EmptyState message="Intervention not found" />;
```

4. **Tests** (1h)

- Test useInterventionDetail hook avec mock API
- Test loading/error states
- Test submitIntervention

**Fichiers modifiés:**

- Créer: `app/hooks/useInterventionDetail.ts`
- Créer: `framework/components/feedback/LoadingState.tsx`
- Modifier: `app/pages/interventions/InterventionDetailPage.tsx`
- Créer: `app/hooks/useInterventionDetail.test.ts`

**Temps estimé:** 3.5h

---

#### Action 1.2: Refactor ProjectsV2Page

**Objectif:** Extraire state management vers custom hooks

**Approche Step-by-Step:**

1. **Créer useProjects.ts** (1.5h)

```typescript
// packages/web-frontend/src/app/hooks/useProjects.ts
export function useProjects() {
	const [projects, setProjects] = useState<Project[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useAbortableEffect(async signal => {
		const data = await projectsApi.getProjects();
		if (!signal.aborted) setProjects(data);
	}, []);

	const createProject = useCallback(async (data: CreateProject) => {
		const newProject = await projectsApi.createProject(data);
		setProjects(prev => [...prev, newProject]);
		return newProject;
	}, []);

	return { projects, loading, error, createProject, updateProject, deleteProject };
}
```

2. **Créer useProjectWorkspaces.ts** (1h)

```typescript
// packages/web-frontend/src/app/hooks/useProjectWorkspaces.ts
export function useProjectWorkspaces() {
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	// Similar pattern...
	return { workspaces, loading, error, assignWorkspace, removeWorkspace };
}
```

3. **Créer usePinnedProjects.ts** (1h)

```typescript
// packages/web-frontend/src/app/hooks/usePinnedProjects.ts
import { useLocalStorage } from '@/hooks/useLocalStorage';

export function usePinnedProjects() {
	const [pinnedIds, setPinnedIds] = useLocalStorage<string[]>('pinnedProjects', []);

	const togglePin = useCallback((id: string) => {
		setPinnedIds(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
	}, []);

	return { pinnedIds, togglePin };
}
```

4. **Créer ProjectEmptyState component** (30min)

```typescript
// packages/web-frontend/src/app/components/domain/ProjectEmptyState.tsx
export function ProjectEmptyState({ onCreateClick }: Props) {
  return (
    <EmptyState
      icon={FolderOpen}
      title="No projects yet"
      description="Get started by creating your first project"
      action={<Button onClick={onCreateClick}>Create Project</Button>}
    />
  );
}
```

5. **Refactor ProjectsV2Page** (1h)

```typescript
// Remplacer:
// const [projects, setProjects] = useState([]);
// useEffect(() => { /* fetch */ }, []);

// Par:
const { projects, loading, error, createProject } = useProjects();
const { workspaces } = useProjectWorkspaces();
const { pinnedIds, togglePin } = usePinnedProjects();

// Supprimer toutes les fonctions helper inline
// Supprimer localStorage logic inline
```

6. **Réduire CSS** (30min)

- Extraire layout inline vers composant WorkspaceLayout
- Remplacer inline empty states par ProjectEmptyState

7. **Tests** (1.5h)

**Fichiers modifiés:**

- Créer: `app/hooks/useProjects.ts`
- Créer: `app/hooks/useProjectWorkspaces.ts`
- Créer: `app/hooks/usePinnedProjects.ts`
- Créer: `framework/hooks/useLocalStorage.ts` (si pas existe)
- Créer: `app/components/domain/ProjectEmptyState.tsx`
- Modifier: `app/pages/projects2/ProjectsV2Page.tsx`
- Tests pour tous les hooks

**Temps estimé:** 7h

---

#### Action 1.3: Refactor FlowEditorPage

**Objectif:** Abstraire orchestration logic, réduire CSS

**Approche Step-by-Step:**

1. **Créer FlowEditorLayout component** (1h)

```typescript
// packages/web-frontend/src/app/components/domain/FlowEditorLayout.tsx
export function FlowEditorLayout({
  header,
  canvas,
  sidebar,
  error
}: FlowEditorLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="border-b px-4 py-3">{header}</div>

      {error ? (
        <div className="flex-1 flex items-center justify-center">
          <ErrorState message={error} />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 relative">{canvas}</div>
          {sidebar && <div className="w-80 border-l">{sidebar}</div>}
        </div>
      )}
    </div>
  );
}
```

2. **Améliorer useFlowEditor hook** (1h)

```typescript
// Ajouter error state au hook return
export function useFlowEditor(flowId: string) {
	const [error, setError] = useState<string | null>(null);
	// ... existing state

	return {
		flow,
		nodes,
		edges,
		error, // ← Export error
		loading,
		operations: { addNode, updateNode, deleteNode, saveFlow },
	};
}
```

3. **Créer FlowEditorHeader component** (30min)

```typescript
// Extraire le header JSX dans composant séparé
export function FlowEditorHeader({
  title,
  hasChanges,
  onSave,
  onBack
}: FlowEditorHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="ghost" onClick={onBack}>←</Button>
      <h1 className="text-2xl font-bold">{title}</h1>
      {hasChanges && <Badge>Unsaved</Badge>}
      <Button onClick={onSave}>Save</Button>
    </div>
  );
}
```

4. **Remplacer ref state par React state** (30min)

```typescript
// Avant:
// const hasChanges = useRef(false);

// Après:
const [hasChanges, setHasChanges] = useState(false);

// Dans handlers:
setHasChanges(true);
```

5. **Refactor FlowEditorPage** (1h)

```typescript
// Simplifier à pure composition:
export function FlowEditorPage() {
  const { id } = useParams();
  const { flow, error, loading, operations } = useFlowEditor(id);
  const [hasChanges, setHasChanges] = useState(false);

  if (loading) return <LoadingState />;

  return (
    <FlowEditorLayout
      header={<FlowEditorHeader title={flow.name} hasChanges={hasChanges} />}
      canvas={<FlowEditorCanvas flow={flow} onChange={() => setHasChanges(true)} />}
      sidebar={<FlowEditorRightPanel />}
      error={error}
    />
  );
}
```

6. **Tests** (1h)

**Fichiers modifiés:**

- Créer: `app/components/domain/FlowEditorLayout.tsx`
- Créer: `app/components/domain/FlowEditorHeader.tsx`
- Modifier: `app/hooks/useFlowEditor.ts`
- Modifier: `app/pages/flows/flow-editor/FlowEditorPage.tsx`
- Tests

**Temps estimé:** 5h

---

#### Action 1.4: Déplacer EditableText.tsx

**Objectif:** Corriger emplacement, extraire logique métier

**Approche Step-by-Step:**

1. **Créer useEditableText hook** (1h)

```typescript
// packages/web-frontend/src/framework/hooks/useEditableText.ts
export function useEditableText({ initialValue, onSave, validation }: UseEditableTextOptions) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(initialValue);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const startEdit = useCallback(() => {
		setEditValue(initialValue);
		setIsEditing(true);
		setError(null);
	}, [initialValue]);

	const cancelEdit = useCallback(() => {
		setIsEditing(false);
		setEditValue(initialValue);
		setError(null);
	}, [initialValue]);

	const saveEdit = useCallback(async () => {
		const trimmed = editValue.trim();

		// Validation
		const validationError = validation?.(trimmed);
		if (validationError) {
			setError(validationError);
			return;
		}

		try {
			setIsSaving(true);
			setError(null);
			await onSave(trimmed);
			setIsEditing(false);
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setIsSaving(false);
		}
	}, [editValue, onSave, validation]);

	return {
		isEditing,
		editValue,
		isSaving,
		error,
		setEditValue,
		startEdit,
		cancelEdit,
		saveEdit,
	};
}
```

2. **Créer validation utilities** (30min)

```typescript
// packages/web-frontend/src/framework/utils/validation/textValidation.ts
export function validateNotEmpty(value: string, fieldName = 'Value'): string | null {
	return value.trim() === '' ? `${fieldName} cannot be empty` : null;
}

export function validateMinLength(value: string, min: number, fieldName = 'Value'): string | null {
	return value.length < min ? `${fieldName} must be at least ${min} characters` : null;
}

export function createValidator(...validators: Validator[]): Validator {
	return (value: string) => {
		for (const validator of validators) {
			const error = validator(value);
			if (error) return error;
		}
		return null;
	};
}
```

3. **Refactor EditableText component** (1h)

```typescript
// packages/web-frontend/src/framework/features/inline-editing/EditableText.tsx
export function EditableText({
	value,
	onSave,
	validation,
	errorMessages, // ← Prop pour messages customisables
}: EditableTextProps) {
	const { isEditing, editValue, isSaving, error, setEditValue, startEdit, cancelEdit, saveEdit } = useEditableText({
		initialValue: value,
		onSave,
		validation,
	});

	// Render logic only, no state management
}
```

4. **Déplacer fichier** (5min)

```bash
# De:
packages/web-frontend/src/framework/components/forms/EditableText.tsx
# Vers:
packages/web-frontend/src/framework/features/inline-editing/EditableText.tsx
```

5. **Update imports** (15min)

```bash
# Trouver toutes les imports:
grep -r "components/forms/EditableText" packages/web-frontend/src/

# Remplacer par:
features/inline-editing/EditableText
```

6. **Tests** (1h)

- Test useEditableText hook
- Test validation utilities
- Test EditableText component

**Fichiers modifiés:**

- Créer: `framework/hooks/useEditableText.ts`
- Créer: `framework/utils/validation/textValidation.ts`
- Déplacer: `framework/components/forms/EditableText.tsx` → `framework/features/inline-editing/EditableText.tsx`
- Modifier: Tous les fichiers important EditableText
- Tests

**Temps estimé:** 4h

---

#### Action 1.5: Déplacer SearchBar.tsx

**Objectif:** Corriger emplacement

**Approche Step-by-Step:**

1. **Déplacer fichier** (5min)

```bash
# De:
packages/web-frontend/src/framework/components/forms/SearchBar.tsx
# Vers:
packages/web-frontend/src/framework/features/search/SearchBar.tsx
```

2. **Update imports** (15min)

```bash
grep -r "components/forms/SearchBar" packages/web-frontend/src/
# Remplacer imports
```

3. **Update documentation** (15min)

```markdown
# Dans frontend.md:

SearchBar is a feature-level component, not a base form primitive.
Location: framework/features/search/SearchBar.tsx
```

4. **Tests** (30min)

- Vérifier que tous les imports fonctionnent
- Run tests existants

**Fichiers modifiés:**

- Déplacer: `framework/components/forms/SearchBar.tsx` → `framework/features/search/SearchBar.tsx`
- Modifier: Tous imports
- Modifier: `.claude/docs/frontend.md`

**Temps estimé:** 1h

---

### PRIORITÉ 2 - HAUTE (Sprint 2 - 3 jours)

#### Action 2.1: Intégrer React Hook Form dans LoginPage

**Approche Step-by-Step:**

1. **Installer React Hook Form** (5min)

```bash
npm install react-hook-form @hookform/resolvers zod
```

2. **Créer validation schema** (30min)

```typescript
// packages/web-frontend/src/app/pages/auth/loginSchema.ts
import { z } from 'zod';

export const loginSchema = z.object({
	email: z.string().email('Invalid email address'),
	password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
```

3. **Créer LoginForm component** (1h)

```typescript
// packages/web-frontend/src/app/pages/auth/LoginForm.tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

export function LoginForm({ onSubmit, loading }: LoginFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <TextField
        {...register('email')}
        label="Email"
        error={errors.email?.message}
      />
      <TextField
        {...register('password')}
        type="password"
        label="Password"
        error={errors.password?.message}
      />
      <Button type="submit" loading={loading}>
        Login
      </Button>
    </form>
  );
}
```

4. **Refactor LoginPage** (30min)

```typescript
// Avant:
// const [errors, setErrors] = useState({});
// if (!email) setErrors(prev => ({ ...prev, email: 'Required' }));

// Après:
const { login, loading, error } = useAuth();

const handleSubmit = async (data: LoginFormData) => {
  await login(data.email, data.password);
};

return (
  <PageContainer>
    {error && <ErrorAlert message={error} />}
    <LoginForm onSubmit={handleSubmit} loading={loading} />
  </PageContainer>
);
```

5. **Tests** (1h)

**Temps estimé:** 3h

---

#### Action 2.2: Créer Generic EntityDialog Wrapper

**Approche Step-by-Step:**

1. **Créer EntityDialog component** (1.5h)

```typescript
// packages/web-frontend/src/app/components/domain/EntityDialog.tsx
export function EntityDialog<T>({
  isOpen,
  mode,
  entity,
  entityName,
  form,
  onClose
}: EntityDialogProps<T>) {
  const title = mode === 'create'
    ? `Create ${entityName}`
    : `Edit ${entityName}`;

  const initialData = useMemo(() =>
    mode === 'edit' && entity ? entity : undefined,
    [mode, entity]
  );

  return (
    <CrudDialog
      isOpen={isOpen}
      title={title}
      onClose={onClose}
    >
      {React.cloneElement(form, { initialData })}
    </CrudDialog>
  );
}
```

2. **Refactor BookDialog** (30min)

```typescript
// Avant: BookDialog.tsx (30 lignes)
// Après:
export function BookDialog(props: BookDialogProps) {
  return (
    <EntityDialog
      {...props}
      entityName="Book"
      form={<BookForm onSubmit={props.onSubmit} />}
    />
  );
}
```

3. **Refactor IngredientDialog** (30min)

```typescript
export function IngredientDialog(props: IngredientDialogProps) {
  return (
    <EntityDialog
      {...props}
      entityName="Ingredient"
      form={<IngredientForm onSubmit={props.onSubmit} />}
    />
  );
}
```

4. **Tests** (1h)

**Temps estimé:** 3.5h

---

#### Action 2.3: Consolider UserMenu Variants

**Approche Step-by-Step:**

1. **Créer UserMenu avec variants** (1h)

```typescript
// packages/web-frontend/src/app/components/navigation/UserMenu.tsx
export function UserMenu({
  variant = 'default',
  showTheme = false
}: UserMenuProps) {
  const { user, logout } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'enhanced' ? (
          <EnhancedTrigger user={user} />
        ) : (
          <DefaultTrigger user={user} />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <UserMenuItems />
        {showTheme && <ThemeToggle />}
        <DropdownMenuSeparator />
        <LogoutItem onClick={logout} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

2. **Supprimer fichiers dupliqués** (15min)

```bash
# Supprimer:
rm UserMenuEnhanced.tsx
rm UserMenuWithTheme.tsx

# Update imports partout
```

3. **Tests** (30min)

**Temps estimé:** 1.75h

---

### PRIORITÉ 3 - MOYENNE (Sprint 3 - 2 jours)

#### Action 3.1: Implémenter AppSwitcher

**Temps estimé:** 3h

#### Action 3.2: Évaluer PageContent Utility

**Temps estimé:** 2h

#### Action 3.3: Standardize CVA in Card.tsx

**Temps estimé:** 2h

#### Action 3.4: Créer Component Guidelines Doc

**Temps estimé:** 4h

---

## RÉSUMÉ TEMPS TOTAL

### Sprint 1 (Priorité 1 - Critique)

- Action 1.1: InterventionDetailPage - **3.5h**
- Action 1.2: ProjectsV2Page - **7h**
- Action 1.3: FlowEditorPage - **5h**
- Action 1.4: EditableText - **4h**
- Action 1.5: SearchBar - **1h**
  **Total Sprint 1: ~20.5h (2.5 jours)**

### Sprint 2 (Priorité 2 - Haute)

- Action 2.1: LoginPage + React Hook Form - **3h**
- Action 2.2: EntityDialog Generic - **3.5h**
- Action 2.3: UserMenu Consolidation - **1.75h**
  **Total Sprint 2: ~8.25h (1 jour)**

### Sprint 3 (Priorité 3 - Moyenne)

- Actions 3.1-3.4 - **11h (1.5 jours)**

**TOTAL GÉNÉRAL: ~40h (5 jours développement)**

---

## ANNEXE: FICHIERS AUDIT DÉTAILLÉS

Les rapports détaillés complets des 3 agents sont disponibles:

1. Pages: 20 pages avec scorecards détaillées
2. Composants Base: 39 composants avec scorecards détaillées
3. Composants Intermédiaires/Hooks: 30+ composants/hooks avec scorecards détaillées
