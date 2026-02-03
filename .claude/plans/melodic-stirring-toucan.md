# Plan: Ajouter un bouton de création de tâche dans un workspace

## Contexte

L'utilisateur souhaite ajouter un bouton de création de tâche directement dans l'interface des workspaces, avec assignation automatique au projet/worker du workspace sélectionné.

## Analyse de l'existant

### Architecture actuelle

**Relation workspace-worker-projet:**

- Un workspace peut avoir plusieurs workers (mais généralement un seul dans la pratique)
- Les projets pointent vers les workspaces via `project.workspaceIds[]`
- Le worker d'un workspace est déterminé via les données de l'orchestrator
- Le projet d'un workspace est trouvé via `ProjectsRepository.getProjectForWorkspace()`

**Création de tâches actuelle:**

- Dialog: `CreateTaskDialog.tsx` (packages/web-frontend/src/app/pages/tasks/)
- Champs requis: `description`, `priority`, `assignedTo.workerId`
- Champs optionnels: `projectId`, `workspaceId`, `flowId`, `flowInputs`
- API: `POST /api/tasks/` via `tasksApi.createTask()`

**Emplacements UI des workspaces:**

1. **WorkspacesTable** (`WorkspacesTable.tsx`) - Liste des workspaces avec bouton Edit
2. **WorkspacePanel** (`WorkspacePanel.tsx`) - Vue détail d'un workspace dans un projet

## Décisions validées par l'utilisateur

1. **Emplacement du bouton**: Dans les deux emplacements (WorkspacePanel + WorkspacesTable)
2. **Comportement si pas de worker connecté**: Désactiver le bouton avec tooltip "No active worker"
3. **Type de dialog**: Réutiliser CreateTaskDialog complet (avec flows, etc.)
4. **Champs auto-assignés**: Verrouiller complètement (masquer/désactiver workspaceId, projectId, workerId)

## Approche d'implémentation

### Design des boutons

**WorkspacePanel:** Contexte fort (l'utilisateur est focalisé sur un workspace)
**WorkspacesTable:** Permet création rapide depuis la liste

### Design proposé

#### 1. WorkspacePanel (vue détail)

```
Header: [Workspace Name] [Status] [Mode] [Path] [Branch] [Edit ✏️] [Create Task ➕]
```

#### 2. WorkspacesTable (liste)

```
Actions column: [Edit ✏️] [Create Task ➕]
```

### Gestion des cas limites

1. **Pas de projet associé**: Afficher le bouton, créer la tâche sans projectId
2. **Pas de worker connecté**: Désactiver le bouton avec tooltip "No active worker"
3. **Champs verrouillés**: Masquer ou désactiver les champs workspaceId, projectId, workerId dans le dialog

## Plan d'implémentation détaillé

### Phase 1: Backend - Enrichir les données workspace

**Fichiers à modifier:**

- `packages/web-backend/src/services/WorkspacesService.ts`

**Changements:**

1. Ajouter aux données retournées par workspace:
    - `activeWorkerId?: string` - Worker actuellement actif pour ce workspace
    - `projectId?: string` - Projet associé (via lookup reverse)

2. Modifier `getWorkspacesData()`:

    ```typescript
    // Pour chaque workspace:
    const project = await this.projectsRepository.getProjectForWorkspace(workspace.id);
    const workerWorkspace = workerWorkspaces.find(w =>
        WorkspaceMapper.generateIdFromPath(w.workspacePath) === workspace.id
    );

    return {
        ...workspace,
        projectId: project?.id,
        activeWorkerId: workerWorkspace?.workerId,
    };
    ```

### Phase 2: Contrat API - Étendre le schéma Workspace

**Fichiers à modifier:**

- `packages/shared-frontend-backend/src/api/workspaces.contract.ts`

**Changements:**

```typescript
export const WorkspaceSchema = z.object({
	// ... champs existants
	activeWorkerId: z.string().optional(), // ← Nouveau
	projectId: z.string().optional(), // ← Nouveau
});
```

### Phase 3: Frontend - Créer un hook pour déterminer si le bouton doit être visible

**Nouveau fichier:**

- `packages/web-frontend/src/app/pages/workspaces/useCanCreateTaskFromWorkspace.ts`

**Contenu:**

```typescript
export function useCanCreateTaskFromWorkspace(workspace: Workspace): {
	canCreate: boolean;
	reason?: string;
} {
	if (!workspace.activeWorkerId) {
		return { canCreate: false, reason: 'No active worker' };
	}
	return { canCreate: true };
}
```

### Phase 4: Frontend - Ajouter le bouton dans WorkspacePanel

**Fichier à modifier:**

- `packages/web-frontend/src/app/pages/projects2/WorkspacePanel.tsx`

**Changements:**

1. Importer `CreateTaskDialog` (ou créer un nouveau composant simplifié)
2. Ajouter state pour gérer l'ouverture du dialog
3. Ajouter le bouton dans le header:
    ```tsx
    <Button variant="ghost" size="sm" onClick={() => setShowCreateTask(true)} disabled={!canCreate} title={reason}>
    	<Plus className="h-4 w-4" />
    	Create Task
    </Button>
    ```
4. Render du dialog avec verrouillage des champs:
    ```tsx
    <CreateTaskDialog
    	open={showCreateTask}
    	onClose={() => setShowCreateTask(false)}
    	onSuccess={handleTaskCreated}
    	defaultValues={{
    		workspaceId: workspace.id,
    		projectId: workspace.projectId,
    		assignedTo: { workerId: workspace.activeWorkerId },
    	}}
    	lockedFields={['workspaceId', 'projectId', 'workerId']}
    />
    ```

### Phase 5: Frontend - Ajouter le bouton dans WorkspacesTable

**Fichier à modifier:**

- `packages/web-frontend/src/app/pages/workspaces/WorkspacesTable.tsx`

**Changements similaires à Phase 4:**

1. Ajouter colonne "Create Task" dans les actions
2. State pour gérer quel workspace est en cours de création de tâche
3. Render du dialog avec verrouillage:
    ```tsx
    <CreateTaskDialog
    	open={creatingTaskForWorkspace === workspace.id}
    	onClose={() => setCreatingTaskForWorkspace(null)}
    	onSuccess={handleTaskCreated}
    	defaultValues={{
    		workspaceId: workspace.id,
    		projectId: workspace.projectId,
    		assignedTo: { workerId: workspace.activeWorkerId },
    	}}
    	lockedFields={['workspaceId', 'projectId', 'workerId']}
    />
    ```

### Phase 6: Frontend - Adapter CreateTaskDialog pour verrouiller les champs

**Fichier à modifier:**

- `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx`

**Changements:**

1. Ajouter props:
    - `defaultValues?` - Valeurs par défaut pour pré-remplir
    - `lockedFields?: string[]` - Champs à verrouiller (masquer de l'UI)

2. Initialiser le form avec les valeurs:

    ```tsx
    const form = useForm({
    	defaultValues: defaultValues || {
    		description: '',
    		priority: 'medium',
    		// ...
    	},
    });
    ```

3. **Masquer les champs verrouillés:**
    - Si `lockedFields` contient `'workspaceId'` → Ne pas afficher le sélecteur de workspace
    - Si `lockedFields` contient `'projectId'` → Ne pas afficher le sélecteur de projet
    - Si `lockedFields` contient `'workerId'` → Ne pas afficher le sélecteur de worker
    - Les valeurs sont envoyées au backend mais l'utilisateur ne peut pas les modifier

4. **Alternative**: Au lieu de masquer, désactiver avec indicateur visuel:
    ```tsx
    <Select disabled={lockedFields?.includes('workerId')}>
        <Badge>Auto-assigned to workspace</Badge>
    ```

### Phase 7: Tests

**Fichiers à créer:**

- `packages/web-frontend/src/app/pages/workspaces/WorkspacePanel.createTask.test.tsx`
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesTable.createTask.test.tsx`

**Tests à couvrir:**

1. Bouton visible quand workspace a un worker actif
2. Bouton désactivé quand pas de worker actif
3. Dialog s'ouvre avec valeurs pré-remplies et champs verrouillés (workspace/projet/worker non modifiables)
4. Création de tâche réussie refresh la liste
5. Gestion d'erreur si création échoue

## Fichiers critiques identifiés

**Backend:**

- `packages/web-backend/src/services/WorkspacesService.ts:66-100` (getWorkspacesData)
- `packages/web-backend/src/repositories/ProjectsRepository.ts` (getProjectForWorkspace)

**Contrats:**

- `packages/shared-frontend-backend/src/api/workspaces.contract.ts` (WorkspaceSchema)
- `packages/shared-frontend-backend/src/api/tasks.contract.ts` (CreateTaskSchema)

**Frontend:**

- `packages/web-frontend/src/app/pages/projects2/WorkspacePanel.tsx:1-300` (header section)
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesTable.tsx:1-200` (actions column)
- `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx` (dialog component)

## Vérification end-to-end

1. **Démarrer l'application:**

    ```bash
    npm run dev
    ```

2. **Test WorkspacePanel:**
    - Naviguer vers un projet
    - Vérifier que le bouton "Create Task" est visible à côté du bouton Edit
    - Si le workspace a un worker actif → Bouton enabled
    - Si le workspace n'a pas de worker actif → Bouton disabled avec tooltip
    - Cliquer sur le bouton (si enabled)
    - Vérifier que le dialog s'ouvre sans les champs workspace/projet/worker (verrouillés)
    - Remplir description et priority
    - Créer la tâche
    - Vérifier que la tâche apparaît dans la liste des tâches du workspace
    - Vérifier que la tâche est assignée au bon workspace/projet/worker

3. **Test WorkspacesTable:**
    - Naviguer vers /workspaces
    - Vérifier que chaque ligne a un bouton "Create Task"
    - Répéter le test du dialog

4. **Test cas limites:**
    - Workspace sans worker actif → Bouton désactivé
    - Workspace sans projet → Tâche créée sans projectId
    - Worker busy → Permet quand même la création (task sera en backlog)

5. **Tests automatisés:**
    ```bash
    npm run test:agent
    ```

## Alternatives considérées

### Alternative 1: Dialog simplifié

Créer un `QuickCreateTaskDialog.tsx` avec seulement description + priority.

- **Avantage**: Interface plus rapide
- **Inconvénient**: Perd la flexibilité (flows, inputs custom)
- **Decision**: Rejeter, garder le dialog complet pour plus de flexibilité

### Alternative 2: Bouton uniquement dans WorkspacePanel

Ne pas ajouter le bouton dans WorkspacesTable.

- **Avantage**: Moins de code à maintenir
- **Inconvénient**: Perd l'accès rapide depuis la liste
- **Decision**: Rejeter, les deux emplacements sont utiles

### Alternative 3: Pré-remplir mais laisser modifiable

Pré-remplir workspaceId/projectId/workerId mais permettre modification.

- **Avantage**: Plus flexible, l'utilisateur peut changer si nécessaire
- **Inconvénient**: Peut causer confusion, ne garantit pas l'assignation au workspace
- **Decision**: Rejeté - L'utilisateur préfère verrouiller complètement pour éviter les erreurs

## Risques et mitigations

**Risque 1**: Worker déconnecté pendant la création de tâche

- **Mitigation**: Validation backend vérifie que le worker existe

**Risque 2**: Workspace déplacé vers un autre projet pendant la création

- **Mitigation**: Utiliser les données au moment de l'ouverture du dialog

**Risque 3**: Frustration si l'utilisateur veut changer le worker/projet après ouverture du dialog

- **Mitigation**: Les champs sont verrouillés par design (choix utilisateur). Si besoin de changer, utiliser le CreateTaskDialog standard depuis /tasks

## Notes d'implémentation

- Suivre le pattern existant de CreateTaskDialog pour la cohérence
- Utiliser `useRealtimeRefresh()` pour rafraîchir après création
- Émettre toast de succès après création
- Considérer l'ajout d'une option "Create and Open" pour naviguer vers la tâche
