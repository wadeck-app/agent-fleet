# Plan: Synchronisation Workspaces Workers ↔ Orchestrateur

**Date:** 2025-12-31_22-38
**Objectif:** Permettre à l'orchestrateur de connaître les workspaces des workers connectés et persister les métadonnées dans les workspaces eux-mêmes.

## Problème Identifié

WorkspacesPage2 affiche un tableau vide car:

- Chaque worker a son propre `WorkspaceManager` local
- L'orchestrateur a son propre `WorkspaceManager` qui reste vide
- Aucune synchronisation entre les deux

## Architecture Cible

### 1. Connexion Worker → Orchestrateur

Lors de la connexion WebSocket, le worker envoie:

```typescript
{
  type: 'worker_connect',
  workerId: 'worker-123',
  workspacePath: '/path/to/workspace',
  projectRoot: '/path/to/project'
}
```

### 2. Orchestrateur Maintient un Registre

L'orchestrateur garde en mémoire:

```typescript
(Map < workerId,
	WorkspaceInfo >
		{
			'worker-123': {
				workerId: 'worker-123',
				workspacePath: '/path/to/workspace',
				projectRoot: '/path/to/project',
				connectedAt: '2025-12-31T22:00:00Z',
				lastHeartbeat: '2025-12-31T22:05:00Z',
			},
		});
```

### 3. Métadonnées Persistées Localement

Fichier: `<workspace>/.agent-fleet/workspace-metadata.json`

```json
{
	"id": "workspace-uuid",
	"name": "My Dev Workspace",
	"description": "Main development workspace",
	"createdAt": "2025-12-31T20:00:00Z",
	"updatedAt": "2025-12-31T22:00:00Z"
}
```

### 4. API Workspaces Agrégée

```
GET /api/workspaces/
→ Récupère workspaces des workers connectés
→ Enrichit avec métadonnées du fichier .agent-fleet/workspace-metadata.json
→ Retourne format API contract
```

## Implémentation

### Phase 1: Messages Worker → Orchestrateur

**1.1 Ajouter workspace au message de connexion**

- **Fichier:** `packages/worker/src/WebSocketClient.ts`
- Inclure `workspacePath` et `projectRoot` dans le handshake

**1.2 Orchestrateur stocke les workspaces**

- **Fichier:** `packages/orchestrator/src/websocket/WorkerWebSocketServer.ts`
- Créer `Map<workerId, WorkerWorkspaceInfo>`
- Mettre à jour lors de connexion/déconnexion

### Phase 2: Persistance Métadonnées

**2.1 Créer WorkspaceMetadataFile (backend)**

- **Fichier:** `packages/web-backend/src/services/WorkspaceMetadataFile.ts` (NOUVEAU)
- Méthodes:
    - `read(workspacePath)` - Lit `<workspace>/.agent-fleet/workspace-metadata.json`
    - `write(workspacePath, metadata)` - Écrit les métadonnées
    - `ensureFile(workspacePath)` - Crée le fichier avec valeurs par défaut si absent

**2.2 Remplacer WorkspaceMetadataRepository**

- **Fichier:** `packages/web-backend/src/repositories/WorkspaceMetadataRepository.ts`
- Supprimer BaseRepository (pas de JSON en mémoire)
- Utiliser `WorkspaceMetadataFile` pour lire/écrire sur disque

### Phase 3: WorkspacesService Refactoré

**3.1 Récupérer workspaces depuis orchestrateur**

- **Fichier:** `packages/web-backend/src/services/WorkspacesService.ts`
- `getWorkspacesList()`:
    1. Appeler `orchestratorWrapper.getConnectedWorkersWorkspaces()`
    2. Pour chaque workspace, lire métadonnées via `WorkspaceMetadataFile`
    3. Mapper vers format API contract
    4. Appliquer filtres/sorting/pagination

**3.2 Update métadonnées**

- `updateWorkspace(workspaceId, data)`:
    1. Trouver workspace dans workers connectés
    2. Écrire métadonnées via `WorkspaceMetadataFile.write()`
    3. Émettre événement B2F

### Phase 4: OrchestratorWrapper Exposer Workspaces

**4.1 Méthode getConnectedWorkersWorkspaces()**

- **Fichier:** `packages/orchestrator/src/core/OrchestratorWrapper.ts`
- Retourner les workspaces des workers connectés
- Format:

```typescript
interface WorkerWorkspace {
	workerId: string;
	workspacePath: string;
	projectRoot: string;
	connectedAt: string;
}
```

### Phase 5: Mapping Workspace

**5.1 WorkspaceMapper mis à jour**

- **Fichier:** `packages/web-backend/src/services/WorkspaceMapper.ts`
- Input: `WorkerWorkspace` + métadonnées fichier
- Output: `Workspace` (API contract)
- Générer `id` depuis workspacePath (hash ou UUID persisté)
- `mode`: lire depuis métadonnées ou 'development' par défaut
- `status`: 'active' si worker connecté
- `tasksCount`: 0 pour l'instant (amélioration future)

## Fichiers Impactés

### Nouveaux Fichiers

1. `packages/web-backend/src/services/WorkspaceMetadataFile.ts`

### Fichiers Modifiés

1. `packages/worker/src/WebSocketClient.ts` - Envoyer workspacePath
2. `packages/orchestrator/src/websocket/WorkerWebSocketServer.ts` - Stocker workspaces
3. `packages/orchestrator/src/core/OrchestratorWrapper.ts` - Exposer getConnectedWorkersWorkspaces()
4. `packages/web-backend/src/repositories/WorkspaceMetadataRepository.ts` - Utiliser fichiers
5. `packages/web-backend/src/services/WorkspacesService.ts` - Lire depuis orchestrateur
6. `packages/web-backend/src/services/WorkspaceMapper.ts` - Mapper WorkerWorkspace
7. `packages/web-backend/src/factories/DataStoreFactory.ts` - Wiring WorkspaceMetadataFile

## Format Fichier Métadonnées

**Emplacement:** `<workspace>/.agent-fleet/workspace-metadata.json`

```json
{
	"id": "550e8400-e29b-41d4-a716-446655440000",
	"name": "Development Workspace",
	"description": "Main workspace for feature development",
	"mode": "development",
	"createdAt": "2025-12-31T20:00:00.000Z",
	"updatedAt": "2025-12-31T22:00:00.000Z"
}
```

## Cas Limites

1. **Worker déconnecté**: Workspace disparaît de la liste
2. **Fichier métadonnées manquant**: Créer avec valeurs par défaut au premier accès
3. **Métadonnées corrompues**: Utiliser valeurs par défaut, logger erreur
4. **Workspace partagé**: Plusieurs workers → même workspace path → dédupliquer
5. **Permissions fichier**: Gérer erreurs lecture/écriture gracieusement

## Avantages Architecture

✅ **Persistance**: Métadonnées survivent aux redémarrages
✅ **Découplage**: Workers autonomes, orchestrateur agrège
✅ **Scalabilité**: Fonctionne avec N workers
✅ **Simplicité**: Pas de DB, juste des fichiers JSON
✅ **Traceabilité**: Métadonnées versionnées avec le workspace

## Migration

### Depuis Système Actuel

- Supprimer `workspace_metadata.json` (storage in-memory)
- Fichiers `.agent-fleet/workspace-metadata.json` créés à la demande
- Pas de migration de données nécessaire (system était vide)

## Tests

1. **Unit**: WorkspaceMetadataFile read/write/ensureFile
2. **Integration**: Worker connect → orchestrateur voit workspace
3. **E2E**: Frontend affiche workspaces des workers connectés
4. **E2E**: Update name/description → écrit dans fichier → frontend rafraîchi

## Ordre d'Implémentation

1. WorkspaceMetadataFile (nouveau service)
2. WorkerWebSocketServer (stocker workspaces)
3. OrchestratorWrapper (exposer getConnectedWorkersWorkspaces)
4. WorkspaceMetadataRepository (refactor vers fichiers)
5. WorkspacesService (refactor getWorkspacesList/updateWorkspace)
6. WorkspaceMapper (adapter au nouveau format)
7. WebSocketClient (envoyer workspacePath au connect)
8. DataStoreFactory (wiring)
9. Tests
