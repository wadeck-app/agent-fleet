# Plan: Refactorisation Architecture ProjectsV2 - Élimination Duplication Dialogs

## Contexte

Suite à l'implémentation de la feature "Process Management & Logs", l'utilisateur demande un audit et refactoring complet de l'architecture ProjectsV2 pour éliminer la duplication de code massive dans les dialogs et composants.

**Problèmes identifiés:**

- 75% de duplication entre ManagePinnedProjectsDialog et ManageProjectWorkspacesDialog (596 lignes combinées)
- 4 composants d'items avec 70-75% de duplication (442 lignes combinées)
- Helper `getBasename()` dupliqué dans 3 fichiers
- CrudDialog n'apporte rien aux dual-list selectors
- Manque d'abstractions intermédiaires

**État actuel:**

- ProjectsV2Page.tsx: 337 lignes (BIEN - déjà refactorisé avec hooks)
- ManagePinnedProjectsDialog: 252 lignes
- ManageProjectWorkspacesDialog: 344 lignes
- 4 item components: 442 lignes total

**Objectif:**

- Réduire ~600 lignes via généricité
- Grade actuel: C+ → Grade cible: A-
- Améliorer maintenabilité et testabilité

## Architecture Proposée

### Nouvelle Hiérarchie Dialog

```
Dialog (Radix primitives)
  ├─ CrudDialog (forms: create/edit entities)
  │    └─ CreateProjectDialog, EditWorkspaceDialog, etc.
  │
  └─ DualListDialog (base générique pour dual-list selectors)
       ├─ ManagePinnedProjectsDialog (spécialisé)
       └─ ManageProjectWorkspacesDialog (spécialisé)
```

### Nouveaux Composants Génériques

#### 1. DualListDialog<TLeft, TRight>

**Fichier:** `packages/web-frontend/src/framework/components/overlays/DualListDialog.tsx`

**Responsabilités:**

- Layout deux colonnes (grid-cols-2 gap-6)
- DnD context avec sensors configurés
- SearchBar intégré (colonne droite)
- Gestion des états: loading, reordering
- Empty states génériques
- Optimistic updates (optionnel)

**Interface:**

```typescript
interface DualListDialogProps<TLeft, TRight> {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	maxWidth?: '4xl' | '5xl';

	// Left panel (associated items)
	leftTitle: string;
	leftItems: TLeft[];
	leftItemKey: (item: TLeft) => string;
	leftItemRenderer: (item: TLeft, actions: ItemActions) => ReactNode;
	leftEmptyState?: ReactNode;
	onReorder?: (activeId: string, overId: string) => Promise<void>;

	// Right panel (available items)
	rightTitle: string;
	rightItems: TRight[];
	rightItemKey: (item: TRight) => string;
	rightItemRenderer: (item: TRight, actions: ItemActions) => ReactNode;
	rightEmptyState?: ReactNode;
	searchPlaceholder?: string;
	searchFilter: (item: TRight, query: string) => boolean;

	// State management
	loadingItems?: Set<string>;
	reorderingItems?: Set<string>;

	// Optimistic updates (optional)
	optimisticMode?: {
		associations: Set<string>;
		dissociations: Set<string>;
	};
}

interface ItemActions {
	isLoading: boolean;
	isReordering: boolean;
}
```

**Features intégrées:**

- DnD avec `@dnd-kit` (sensors pré-configurés)
- Search avec debounce
- Loading overlays
- Empty states conditionnels
- Help text (ex: "Drag to reorder, click → to unpin")

#### 2. DualListItem<T>

**Fichier:** `packages/web-frontend/src/framework/components/overlays/DualListItem.tsx`

**Composant générique pour items dans DualListDialog:**

```typescript
interface DualListItemProps<T> {
	item: T;
	variant: 'available' | 'sortable';

	// Rendering
	icon?: ReactNode;
	label: string;
	badge?: ReactNode;

	// Actions
	onAction: (itemId: string) => void;
	actionIcon: typeof ArrowLeft | typeof ArrowRight | typeof GripVertical;
	actionLabel: string;

	// State
	isLoading?: boolean;
	isReordering?: boolean;
	isDragging?: boolean;
}
```

**Variants:**

- `available`: Simple item avec action button (←)
- `sortable`: Draggable item avec grip handle + action button (→)

### Composants Refactorés

#### ManagePinnedProjectsDialog (APRÈS)

**Taille estimée:** 80 lignes (vs 252 actuellement)

```typescript
export function ManagePinnedProjectsDialog({ ... }: ManagePinnedProjectsDialogProps) {
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
  const [reorderingIds, setReorderingIds] = useState<Set<string>>(new Set());

  const handlePin = async (projectId: string) => { /* ... */ };
  const handleUnpin = async (projectId: string) => { /* ... */ };
  const handleReorder = async (activeId: string, overId: string) => { /* ... */ };

  return (
    <DualListDialog<Project, Project>
      open={open}
      onOpenChange={onOpenChange}
      title="Customize Project Tabs"
      leftTitle="Pinned Projects"
      leftItems={pinnedProjects}
      leftItemKey={p => p.id}
      leftItemRenderer={(project, { isLoading, isReordering }) => (
        <DualListItem
          item={project}
          variant="sortable"
          icon={project.icon && <DynamicLucideIcon name={project.icon} color={project.iconColor} />}
          label={project.name}
          badge={<Badge>{workspaceCount}</Badge>}
          onAction={handleUnpin}
          actionIcon={ArrowRight}
          actionLabel="Unpin project"
          isLoading={isLoading}
          isReordering={isReordering}
        />
      )}
      rightTitle="Available Projects"
      rightItems={availableProjects}
      rightItemKey={p => p.id}
      rightItemRenderer={(project, { isLoading }) => (
        <DualListItem
          item={project}
          variant="available"
          icon={project.icon && <DynamicLucideIcon name={project.icon} color={project.iconColor} />}
          label={project.name}
          onAction={handlePin}
          actionIcon={ArrowLeft}
          actionLabel="Pin project"
          isLoading={isLoading}
        />
      )}
      searchPlaceholder="Search projects..."
      searchFilter={(p, q) =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        p.description?.toLowerCase().includes(q.toLowerCase())
      }
      onReorder={handleReorder}
      loadingItems={loadingItems}
      reorderingItems={reorderingIds}
    />
  );
}
```

#### ManageProjectWorkspacesDialog (APRÈS)

**Taille estimée:** 120 lignes (vs 344 actuellement)

Même structure que ManagePinnedProjectsDialog, avec en plus:

- `optimisticMode` prop pour gérer les associations/dissociations optimistes
- `useEffect` pour clear optimistic state on close

**Réduction:** 224 lignes économisées

### Composants à Supprimer

Les 4 composants d'items actuels seront supprimés:

- ❌ `AvailableProjectItem.tsx` (77 lignes)
- ❌ `SortablePinnedProjectItem.tsx` (116 lignes)
- ❌ `AvailableWorkspaceItem.tsx` (94 lignes)
- ❌ `SortableAssociatedWorkspaceItem.tsx` (155 lignes)

**Total:** 442 lignes supprimées

Remplacés par:

- ✅ `DualListItem.tsx` (~100 lignes) - composant générique

**Économie nette:** 342 lignes

### Utilitaires Partagés

**Fichier:** `packages/web-frontend/src/framework/utils/pathUtils.ts`

```typescript
/**
 * Extract basename from a file path (cross-platform)
 * @example getBasename('/path/to/file.txt') => 'file.txt'
 * @example getBasename('C:\\path\\to\\file.txt') => 'file.txt'
 */
export function getBasename(path: string): string {
	return path.split(/[/\\]/).pop() || path;
}
```

**Remplacement dans:**

- AvailableWorkspaceItem.tsx (lines 40-43) ❌ SUPPRIMÉ
- SortableAssociatedWorkspaceItem.tsx (lines 45-48) ❌ SUPPRIMÉ
- WorkspacePanel.tsx (lines 21-24) → `import { getBasename } from '@framework/utils/pathUtils'`
- WorkspaceTabs.tsx (lines 8-11) → `import { getBasename } from '@framework/utils/pathUtils'`

## Ordre d'Implémentation

### Phase 1: Fondations (2h)

1. **Créer utilitaires partagés** (15min)
    - `packages/web-frontend/src/framework/utils/pathUtils.ts`
    - Export `getBasename()`
    - Tests unitaires

2. **Créer DualListItem générique** (1h)
    - `packages/web-frontend/src/framework/components/overlays/DualListItem.tsx`
    - Support variants: available, sortable
    - Props: icon, label, badge, action button
    - Loading/reordering states
    - Storybook stories

3. **Créer DualListDialog générique** (45min)
    - `packages/web-frontend/src/framework/components/overlays/DualListDialog.tsx`
    - Layout deux colonnes
    - DnD context intégré
    - SearchBar intégré
    - Generic avec `<TLeft, TRight>`
    - Storybook stories

### Phase 2: Migration Dialogs (3h)

4. **Refactor ManagePinnedProjectsDialog** (1h30)
    - Remplacer contenu par DualListDialog
    - Passer de 252 à ~80 lignes
    - Supprimer AvailableProjectItem
    - Supprimer SortablePinnedProjectItem
    - Tests: vérifier que dialog fonctionne identiquement

5. **Refactor ManageProjectWorkspacesDialog** (1h30)
    - Remplacer contenu par DualListDialog
    - Ajouter optimistic updates mode
    - Passer de 344 à ~120 lignes
    - Supprimer AvailableWorkspaceItem
    - Supprimer SortableAssociatedWorkspaceItem
    - Tests: vérifier optimistic updates

### Phase 3: Cleanup & Polish (1h)

6. **Remplacer getBasename() dupliqués** (30min)
    - WorkspacePanel.tsx
    - WorkspaceTabs.tsx
    - Vérifier que tous les imports fonctionnent

7. **Tests & Documentation** (30min)
    - Tests unitaires pour DualListDialog
    - Tests unitaires pour DualListItem
    - Tests d'intégration pour dialogs refactorés
    - Storybook documentation

### Phase 4: Validation (30min)

8. **Vérification End-to-End**
    - Naviguer vers ProjectsV2
    - Ouvrir "Manage Projects" dialog
    - Tester drag & drop reordering
    - Tester pin/unpin
    - Tester search
    - Ouvrir "Manage Workspaces" dialog
    - Tester associate/dissociate avec optimistic updates
    - Tester reordering
    - Vérifier que toutes les fonctionnalités marchent

9. **npm run check**
    - TypeScript errors: 0 (cible)
    - ESLint warnings: acceptable
    - Prettier: auto-fix

## Fichiers Critiques

### Fichiers à Créer

- `packages/web-frontend/src/framework/utils/pathUtils.ts` (NEW)
- `packages/web-frontend/src/framework/utils/pathUtils.test.ts` (NEW)
- `packages/web-frontend/src/framework/components/overlays/DualListDialog.tsx` (NEW)
- `packages/web-frontend/src/framework/components/overlays/DualListDialog.stories.tsx` (NEW)
- `packages/web-frontend/src/framework/components/overlays/DualListDialog.test.tsx` (NEW)
- `packages/web-frontend/src/framework/components/overlays/DualListItem.tsx` (NEW)
- `packages/web-frontend/src/framework/components/overlays/DualListItem.stories.tsx` (NEW)
- `packages/web-frontend/src/framework/components/overlays/DualListItem.test.tsx` (NEW)

### Fichiers à Modifier

- `packages/web-frontend/src/app/pages/projects2/ManagePinnedProjectsDialog.tsx` (REFACTOR - 252 → 80 lignes)
- `packages/web-frontend/src/app/pages/projects2/ManageProjectWorkspacesDialog.tsx` (REFACTOR - 344 → 120 lignes)
- `packages/web-frontend/src/app/pages/projects2/WorkspacePanel.tsx` (UPDATE import getBasename)
- `packages/web-frontend/src/app/pages/projects2/WorkspaceTabs.tsx` (UPDATE import getBasename)

### Fichiers à Supprimer

- `packages/web-frontend/src/app/pages/projects2/AvailableProjectItem.tsx` (DELETE - 77 lignes)
- `packages/web-frontend/src/app/pages/projects2/SortablePinnedProjectItem.tsx` (DELETE - 116 lignes)
- `packages/web-frontend/src/app/pages/projects2/AvailableWorkspaceItem.tsx` (DELETE - 94 lignes)
- `packages/web-frontend/src/app/pages/projects2/SortableAssociatedWorkspaceItem.tsx` (DELETE - 155 lignes)

## Métriques de Succès

| Métrique               | Avant | Après  | Cible |
| ---------------------- | ----- | ------ | ----- |
| Total lignes projects2 | 2,196 | ~1,550 | -30%  |
| Duplication dialogs    | 75%   | 0%     | <10%  |
| Duplication items      | 70%   | 0%     | <10%  |
| Helper duplication     | 3x    | 1x     | 1x    |
| Composants génériques  | 0     | 2      | 2+    |
| Test coverage          | ~15%  | ~70%   | >70%  |
| Grade architecture     | C+    | A-     | A-    |

**Réduction totale estimée:** ~646 lignes (-29%)

## Risques & Mitigation

### Risque 1: Breaking changes dans dialogs

**Mitigation:**

- Tests manuels complets après refactoring
- Vérifier chaque feature: search, drag-drop, optimistic updates
- Garder les anciennes versions en commentaire pendant développement

### Risque 2: Généricité trop complexe

**Mitigation:**

- DualListDialog doit rester simple et prévisible
- Éviter trop de props optionnelles
- Préférer composition over configuration
- Storybook pour documenter tous les use cases

### Risque 3: TypeScript generics difficiles

**Mitigation:**

- Utiliser des contraintes de type simples
- Pas de conditional types complexes
- Exemples clairs dans JSDoc
- Tests avec types concrets (Project, Workspace)

## Plan de Vérification

### Tests Unitaires

1. **pathUtils.test.ts**
    - Test getBasename() avec paths Unix
    - Test getBasename() avec paths Windows
    - Test edge cases (empty, root, trailing slash)

2. **DualListItem.test.tsx**
    - Render variant "available"
    - Render variant "sortable"
    - Click action button
    - Loading state
    - Reordering state

3. **DualListDialog.test.tsx**
    - Render avec items
    - Search filtering
    - Drag & drop reorder
    - Empty states
    - Optimistic mode

### Tests d'Intégration

4. **ManagePinnedProjectsDialog**
    - Pin project from right → appears in left
    - Unpin project from left → appears in right
    - Drag to reorder in left
    - Search in right filters correctly
    - Loading states during API calls

5. **ManageProjectWorkspacesDialog**
    - Associate workspace → optimistic update
    - Dissociate workspace → optimistic update
    - Reorder associated workspaces
    - Rollback on API error

### Tests Manuels

6. **End-to-End Flow**
    - Navigate to ProjectsV2
    - Open Manage Projects dialog
    - Pin 3 projects
    - Reorder them via drag-drop
    - Unpin 1 project
    - Search for project in available list
    - Close dialog
    - Open Manage Workspaces dialog
    - Associate 2 workspaces (should see optimistic update)
    - Reorder them
    - Dissociate 1 workspace
    - Close dialog
    - Verify all changes persisted

7. **npm run check**
    - No TypeScript errors
    - No ESLint blocking errors
    - Prettier formatted

## Notes Importantes

### Optimistic Updates Pattern

Le `ManageProjectWorkspacesDialog` utilise des optimistic updates pour améliorer l'UX:

```typescript
// État optimiste
const [optimisticAssociations, setOptimisticAssociations] = useState<Set<string>>(new Set());
const [optimisticDissociations, setOptimisticDissociations] = useState<Set<string>>(new Set());

// Calcul de l'état effectif
const effectiveIds = new Set(baseIds);
optimisticAssociations.forEach(id => effectiveIds.add(id));
optimisticDissociations.forEach(id => effectiveIds.delete(id));

// Rollback en cas d'erreur API
catch (error) {
  setOptimisticAssociations(prev => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
}
```

Le `DualListDialog` doit supporter ce pattern via la prop `optimisticMode`.

### Préservation Features Existantes

**Toutes les features actuelles doivent être préservées:**

- ✅ Drag & drop reordering (avec distance: 8px activation)
- ✅ Search avec filtrage temps réel
- ✅ Loading states individuels par item
- ✅ Reordering states (opacity, pointer-events-none)
- ✅ Empty states customizables
- ✅ Optimistic updates (ManageProjectWorkspacesDialog)
- ✅ Help text ("Drag to reorder, click → to...")
- ✅ Icons/colors/badges customizables

### Patterns à Respecter

1. **Generic avec contraintes minimales:**

    ```typescript
    function DualListDialog<TLeft, TRight>({ ... }: DualListDialogProps<TLeft, TRight>) {
      // TLeft et TRight n'ont pas besoin d'extends, on utilise des key extractors
    }
    ```

2. **Render props pour flexibilité:**

    ```typescript
    leftItemRenderer: (item: TLeft, actions: ItemActions) => ReactNode;
    // Permet aux consumers de render ce qu'ils veulent
    ```

3. **Composition over inheritance:**

    ```typescript
    // ❌ BAD
    class ManagePinnedProjectsDialog extends DualListDialog {}

    // ✅ GOOD
    <DualListDialog leftItemRenderer={...} rightItemRenderer={...} />
    ```

### Code Quality Gates

**Avant de merger:**

- [ ] Tous les tests passent (unit + integration)
- [ ] npm run check sans erreurs TypeScript
- [ ] Storybook stories créées pour nouveaux composants
- [ ] Documentation JSDoc complète
- [ ] Code review par l'utilisateur
- [ ] Tests manuels E2E validés

**Métriques cibles:**

- [ ] -30% lignes de code
- [ ] 0% duplication entre dialogs
- [ ] Grade A- en architecture
- [ ] > 70% test coverage sur nouveaux composants
