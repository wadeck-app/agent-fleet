# Plan: Workspace Management Dialog for Projects v2

## Objectif

Ajouter une interface pour configurer les workspaces associés à un projet dans projects-v2, avec un dialog similaire à "Manage Projects".

## Architecture

### Nouveaux Composants (Pattern: ManagePinnedProjectsDialog)

1. **ManageProjectWorkspacesDialog.tsx**
    - Dialog avec layout 2 colonnes (Associated / Available)
    - Colonne gauche: Workspaces associés (drag & drop pour réorganiser)
    - Colonne droite: Workspaces disponibles (avec search)
    - Boutons flèches: ← pour associer, → pour dissocier
    - Props: project, workspaces, onAssociate, onDissociate, onReorder

2. **SortableAssociatedWorkspaceItem.tsx**
    - Item draggable pour workspace associé
    - Drag handle (GripVertical), nom, couleur, task count, bouton →
    - Loading states pendant les opérations

3. **AvailableWorkspaceItem.tsx**
    - Item pour workspace disponible
    - Nom, couleur, task count, bouton ←

### Modifications Existantes

4. **ProjectsV2Page.tsx**
    - Ajouter bouton "Manage Workspaces" dans PageHeader (à côté de "Manage Projects")
    - Bouton désactivé si aucun projet sélectionné
    - Ajouter state: `isManageWorkspacesDialogOpen`
    - Ajouter handlers: handleWorkspaceAssociate, handleWorkspaceDissociate, handleWorkspaceReorder
    - **IMPORTANT**: Fixer l'ordre des workspaces tabs en mappant `activeProject.workspaceIds` au lieu de filtrer

## Stratégie de Données

### Ordre des Workspaces

- Stocké dans la position de l'array `project.workspaceIds[]`
- Pas besoin de champ `order` séparé
- Modification via `projectsApi.updateProject()` avec nouveau array

### Sync Bidirectionnel

- **Déjà implémenté** dans `WorkspacesService.updateWorkspace()`
- Associer: `workspacesApi.updateWorkspace(id, { projectId: 'xyz' })` → auto-ajoute à `project.workspaceIds[]`
- Dissocier: `workspacesApi.updateWorkspace(id, { projectId: null })` → auto-retire de `project.workspaceIds[]`

## API Calls

### Associate Workspace

```typescript
await workspacesApi.updateWorkspace(workspaceId, { projectId: activeProject.id });
// Backend sync: project.workspaceIds[] updated automatically
```

### Dissociate Workspace

```typescript
await workspacesApi.updateWorkspace(workspaceId, { projectId: null });
// Backend sync: removed from project.workspaceIds[] automatically
```

### Reorder Workspaces

```typescript
const reordered = arrayMove(activeProject.workspaceIds, oldIndex, newIndex);
await projectsApi.updateProject(activeProject.id, {
	workspaceIds: reordered,
	version: activeProject.version,
});
```

## Étapes d'Implémentation

### Étape 1: AvailableWorkspaceItem.tsx

- Copier pattern de `AvailableProjectItem.tsx`
- Afficher: color dot + nom + task count
- Bouton ArrowLeft pour associer

### Étape 2: SortableAssociatedWorkspaceItem.tsx

- Copier pattern de `SortablePinnedProjectItem.tsx`
- Afficher: drag handle + color dot + nom + task count
- Bouton ArrowRight pour dissocier
- Support loading/reordering states

### Étape 3: ManageProjectWorkspacesDialog.tsx

- Copier pattern de `ManagePinnedProjectsDialog.tsx`
- Calculer: associatedWorkspaces (w.projectId === project.id)
- Calculer: availableWorkspaces (w.projectId !== project.id || null)
- SearchBar pour filtrer available
- DndContext avec dnd-kit pour reorder
- Loading states pour chaque item

### Étape 4: ProjectsV2Page.tsx

**4.1 Ajouter state**

```typescript
const [isManageWorkspacesDialogOpen, setIsManageWorkspacesDialogOpen] = useState(false);
```

**4.2 Modifier PageHeader (ligne ~278)**

```typescript
action={
  <div className="flex gap-2">
    <Button onClick={() => setIsManageWorkspacesDialogOpen(true)} disabled={!activeProject}>
      <Settings /> Manage Workspaces
    </Button>
    <Button onClick={() => setIsManageDialogOpen(true)}>
      <Settings /> Manage Projects
    </Button>
  </div>
}
```

**4.3 Ajouter handlers**

```typescript
const handleWorkspaceAssociate = async (workspaceId: string) => {
	if (!activeProject) return;
	await workspacesApi.updateWorkspace(workspaceId, { projectId: activeProject.id });
};

const handleWorkspaceDissociate = async (workspaceId: string) => {
	await workspacesApi.updateWorkspace(workspaceId, { projectId: null });
};

const handleWorkspaceReorder = async (activeId: string, overId: string) => {
	if (!activeProject) return;
	const currentOrder = [...activeProject.workspaceIds];
	const oldIndex = currentOrder.indexOf(activeId);
	const newIndex = currentOrder.indexOf(overId);
	if (oldIndex === -1 || newIndex === -1) return;

	const reordered = arrayMove(currentOrder, oldIndex, newIndex);
	await projectsApi.updateProject(activeProject.id, {
		workspaceIds: reordered,
		version: activeProject.version,
	});
};
```

**4.4 Ajouter dialog (après ligne ~421)**

```typescript
<ManageProjectWorkspacesDialog
  open={isManageWorkspacesDialogOpen}
  onOpenChange={setIsManageWorkspacesDialogOpen}
  project={activeProject}
  workspaces={workspaces}
  onAssociate={handleWorkspaceAssociate}
  onDissociate={handleWorkspaceDissociate}
  onReorder={handleWorkspaceReorder}
/>
```

**4.5 Fixer ordre des workspace tabs (ligne ~257-260)**

```typescript
// AVANT (incorrect - ne respecte pas l'ordre):
const projectWorkspaces = activeProject && activeProject.workspaceIds.length > 0
  ? workspaces.filter(w => activeProject.workspaceIds.includes(w.id))
  : [];

// APRÈS (correct - respecte l'ordre de workspaceIds):
const projectWorkspaces = activeProject && activeProject.workspaceIds.length > 0
  ? activeProject.workspaceIds
      .map(id => workspaces.find(w => w.id === id))
      .filter((w): w is Workspace => w !== undefined)
  : [];
```

### Étape 5: Import arrayMove

Ajouter import dans ProjectsV2Page.tsx:

```typescript
import { arrayMove } from '@dnd-kit/sortable';
```

## Vérification

### Tests Manuels

1. Ouvrir Projects v2
2. Sélectionner un projet
3. Cliquer "Manage Workspaces"
4. Associer un workspace (bouton ←) → vérifier qu'il apparaît dans la colonne gauche
5. Réorganiser les workspaces (drag & drop) → vérifier que l'ordre change dans les tabs
6. Dissocier un workspace (bouton →) → vérifier qu'il retourne dans la colonne droite
7. Utiliser la search bar → vérifier le filtrage
8. Sans projet sélectionné → vérifier que le bouton est désactivé

### Tests Bidirectionnel Sync

1. Associer workspace via dialog → vérifier `workspace.projectId` dans backend
2. Vérifier que `project.workspaceIds[]` est mis à jour
3. Vérifier real-time updates (WebSocket events)

### Edge Cases

- Dialog avec projet sans workspaces → empty state
- Dialog avec tous les workspaces associés → empty state dans "Available"
- Erreur backend → loading state clear, toast error
- Concurrent updates → optimistic locking avec version field

## Fichiers Critiques

### À Créer

- `packages/web-frontend/src/app/pages/projects2/ManageProjectWorkspacesDialog.tsx`
- `packages/web-frontend/src/app/pages/projects2/SortableAssociatedWorkspaceItem.tsx`
- `packages/web-frontend/src/app/pages/projects2/AvailableWorkspaceItem.tsx`

### À Modifier

- `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`

### Références (lecture seule)

- `packages/web-frontend/src/app/pages/projects2/ManagePinnedProjectsDialog.tsx` (pattern)
- `packages/web-frontend/src/app/pages/projects2/SortablePinnedProjectItem.tsx` (pattern)
- `packages/web-frontend/src/app/pages/projects2/AvailableProjectItem.tsx` (pattern)
- `packages/web-frontend/src/app/pages/projects2/WorkspaceTabs.tsx` (workspace display pattern)
- `packages/web-backend/src/services/WorkspacesService.ts` (bidirectional sync logic)

## Risques et Mitigations

### Race Conditions

- Mitigation: Optimistic locking avec version field (déjà implémenté)
- Real-time events refresh UI automatiquement

### Workspace dans Plusieurs Projets

- Mitigation: Backend enforce un seul projectId par workspace
- Dialog filtre workspaces déjà associés

### Performance Drag & Drop

- Mitigation: dnd-kit best practices (activationConstraint: 8px)
- Proper key usage pour optimiser renders

## Post-Implementation

Après implémentation, exécuter:

```bash
npm run check
npm run test
```
