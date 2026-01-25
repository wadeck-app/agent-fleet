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

## Questions à clarifier

Avant de procéder, voici les points à clarifier avec l'utilisateur:

1. **Emplacement du bouton**: Où souhaitez-vous le bouton?
    - Option A: Dans WorkspacesTable (liste) uniquement
    - Option B: Dans WorkspacePanel (vue détail) uniquement
    - Option C: Dans les deux emplacements

2. **Comportement si pas de projet**: Que faire si le workspace n'est pas associé à un projet?
    - Masquer le bouton?
    - Afficher le bouton mais permettre de créer une tâche sans projet?
    - Afficher un message d'erreur?

3. **Comportement si pas de worker connecté**: Que faire si aucun worker n'est actif pour ce workspace?
    - Masquer le bouton?
    - Afficher le bouton mais forcer à sélectionner un worker?
    - Afficher un message d'erreur?

4. **Type de dialog**: Quel niveau de détails?
    - Option A: Réutiliser CreateTaskDialog complet (avec flows, etc.)
    - Option B: Créer un dialog simplifié (description + priority uniquement)

5. **Champs pré-remplis vs verrouillés**: Comment gérer les champs auto-assignés?
    - Pré-remplir mais permettre modification (workspaceId, projectId, workerId)
    - Verrouiller complètement (masquer/désactiver ces champs)

## Approches recommandées

### Approche recommandée: Bouton dans les deux emplacements

**Justification:**

- WorkspacePanel: Contexte fort (l'utilisateur est focalisé sur un workspace)
- WorkspacesTable: Permet création rapide depuis la liste

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

**Proposition par défaut:**

1. **Pas de projet associé**: Afficher le bouton, créer la tâche sans projectId
2. **Pas de worker connecté**: Masquer le bouton ou désactiver avec tooltip "No active worker"
3. **Dialog**: Réutiliser CreateTaskDialog complet avec pré-remplissage
4. **Champs auto-assignés**: Pré-remplir workspaceId/projectId/workerId mais permettre modification

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
4. Render du dialog avec pré-remplissage:
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
    />
    ```

### Phase 5: Frontend - Ajouter le bouton dans WorkspacesTable

**Fichier à modifier:**

- `packages/web-frontend/src/app/pages/workspaces/WorkspacesTable.tsx`

**Changements similaires à Phase 4:**

1. Ajouter colonne "Create Task" dans les actions
2. State pour gérer quel workspace est en cours de création de tâche
3. Render du dialog avec pré-remplissage

### Phase 6: Frontend - Adapter CreateTaskDialog pour supporter les valeurs par défaut

**Fichier à modifier:**

- `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx`

**Changements:**

1. Ajouter prop `defaultValues?` au composant
2. Initialiser le form avec ces valeurs:
    ```tsx
    const form = useForm({
    	defaultValues: defaultValues || {
    		description: '',
    		priority: 'medium',
    		// ...
    	},
    });
    ```
3. Option: Désactiver/masquer les champs pré-remplis si nécessaire

### Phase 7: Tests

**Fichiers à créer:**

- `packages/web-frontend/src/app/pages/workspaces/WorkspacePanel.createTask.test.tsx`
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesTable.createTask.test.tsx`

**Tests à couvrir:**

1. Bouton visible quand workspace a un worker actif
2. Bouton désactivé quand pas de worker actif
3. Dialog s'ouvre avec valeurs pré-remplies
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
    - Cliquer sur le bouton
    - Vérifier que le dialog s'ouvre avec workspaceId/projectId/workerId pré-remplis
    - Remplir description et priority
    - Créer la tâche
    - Vérifier que la tâche apparaît dans la liste des tâches du workspace

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

### Alternative 3: Verrouiller les champs auto-assignés

Masquer/désactiver workspaceId/projectId/workerId dans le dialog.

- **Avantage**: Garantit l'assignation au workspace
- **Inconvénient**: Perd la flexibilité si l'utilisateur veut changer
- **Decision**: Rejeter, pré-remplir mais laisser modifiable

## Risques et mitigations

**Risque 1**: Worker déconnecté pendant la création de tâche

- **Mitigation**: Validation backend vérifie que le worker existe

**Risque 2**: Workspace déplacé vers un autre projet pendant la création

- **Mitigation**: Utiliser les données au moment de l'ouverture du dialog

**Risque 3**: Confusion si l'utilisateur modifie les champs pré-remplis

- **Mitigation**: Ajouter un indicateur visuel (badge "Auto-assigned") sur les champs

## Notes d'implémentation

- Suivre le pattern existant de CreateTaskDialog pour la cohérence
- Utiliser `useRealtimeRefresh()` pour rafraîchir après création
- Émettre toast de succès après création
- Considérer l'ajout d'une option "Create and Open" pour naviguer vers la tâche
