# Plan: Fonctionnalité de Renommage des Workers

**Date:** 2025-12-27
**Objectif:** Permettre aux utilisateurs de renommer les workers depuis le frontend avec édition inline

## Décisions Architecturales

### 1. Modèle de Données

- **Champ `name` séparé** : `workerId` reste immuable, nouveau champ `name` optionnel
- **Persistence hybride** :
    - Noms stockés dans `/data/workers.json` via WorkersRepository
    - Données runtime (connected, state, taskId) viennent de OrchestratorWrapper
    - Fusion des deux sources dans WorkersService

### 2. Interface Utilisateur

- **Édition inline dans WorkersTable2** : Clic pour éditer, Enter pour sauvegarder, Escape pour annuler
- Composant EditableText réutilisable

### 3. Event Broadcasting

- Utilise l'événement existant `B2F_WORKER_UPDATED` pour les mises à jour temps réel

## Implémentation - Ordre Recommandé

### Phase 1: Backend - Contrat & Storage (3-4h)

#### 1.1 Shared Contract

**Fichier:** `packages/shared-frontend-backend/src/api/workers.contract.ts`

**Modifications:**

```typescript
// Ajouter le champ name au WorkerSchema
export const WorkerSchema = z.object({
  workerId: z.string(),
  name: z.string().min(1).max(100).optional(), // NOUVEAU
  connected: z.boolean(),
  // ... autres champs
});

// Ajouter le schéma de mise à jour
export const UpdateWorkerNameSchema = z.object({
  name: z.string().min(1).max(100),
});

// Ajouter la route PATCH
'/api/workers/:workerId': {
  PATCH: {
    params: z.object({ workerId: z.string() }),
    body: UpdateWorkerNameSchema,
    response: WorkerSchema,
  },
}
```

#### 1.2 WorkersRepository (NOUVEAU)

**Fichier:** `packages/web-backend/src/repositories/WorkersRepository.ts`

**À créer:**

```typescript
export interface WorkerMetadata {
	workerId: string; // Clé métier
	name?: string;
	// BaseEntity fields: id, version, createdAt, updatedAt
}

export class WorkersRepository {
	constructor(private readonly base: BaseRepository<WorkerMetadata>) {}

	async findByWorkerId(workerId: string): Promise<WorkerMetadata | null> {
		const results = await this.base.query().where('workerId', '=', workerId).execute();
		return results[0] || null;
	}

	async findAll(): Promise<WorkerMetadata[]> {
		return this.base.findAll();
	}

	async updateName(workerId: string, name: string): Promise<WorkerMetadata> {
		const existing = await this.findByWorkerId(workerId);
		if (existing) {
			return this.base.update(existing.id, { name });
		} else {
			// Auto-create si n'existe pas
			return this.base.create({ workerId, name });
		}
	}
}
```

**Exporter dans:** `packages/web-backend/src/repositories/index.ts`

```typescript
export { WorkersRepository } from './WorkersRepository';
```

### Phase 2: Backend - Service & Controller (2-3h)

#### 2.1 WorkersService

**Fichier:** `packages/web-backend/src/services/WorkersService.ts`

**Modifications:**

1. **Ajouter WorkersRepository dans le constructeur:**

```typescript
constructor(
  private readonly orchestratorWrapper: OrchestratorWrapper,
  private readonly eventBroadcaster: EventBroadcaster,
  private readonly workersRepository: WorkersRepository  // NOUVEAU
) {}
```

2. **Modifier `getWorkersData()` pour fusionner les metadata:**

```typescript
async getWorkersData(): Promise<WorkersData> {
  const stats = await this.orchestratorWrapper.getStats();

  // Fetch metadata
  const allMetadata = await this.workersRepository.findAll();
  const metadataMap = new Map(allMetadata.map(m => [m.workerId, m]));

  const workers: Worker[] = stats.workersList.map((w: any) => ({
    workerId: w.id,
    name: metadataMap.get(w.id)?.name,  // NOUVEAU
    connected: true,
    // ... autres champs
  }));
  // ... reste inchangé
}
```

3. **Modifier `getWorkersList()` de la même façon**

4. **Modifier `applySearch()` pour inclure name:**

```typescript
return workers.filter(w =>
  w.workerId.toLowerCase().includes(lowerQuery) ||
  w.name?.toLowerCase().includes(lowerQuery) ||  // NOUVEAU
  // ... autres champs
);
```

5. **Ajouter `updateWorkerName()` :**

```typescript
async updateWorkerName(workerId: string, name: string): Promise<Worker> {
  // Vérifier que le worker existe
  const stats = await this.orchestratorWrapper.getStats();
  const workerExists = stats.workersList.some((w: any) => w.id === workerId);

  if (!workerExists) {
    throw new Error(`Worker ${workerId} not found`);
  }

  // Mettre à jour dans le repository
  await this.workersRepository.updateName(workerId, name);

  // Construire le worker mis à jour
  const runtimeWorker = stats.workersList.find((w: any) => w.id === workerId);
  const updatedWorker: Worker = {
    workerId,
    name,
    connected: true,
    taskId: runtimeWorker.taskId ?? undefined,
    state: runtimeWorker.taskId ? 'busy' : 'idle',
    // ... autres champs
  };

  // Émettre l'événement
  this.eventBroadcaster.broadcast('b2f:worker:updated', updatedWorker);

  return updatedWorker;
}
```

#### 2.2 WorkersController

**Fichier:** `packages/web-backend/src/controllers/WorkersController.ts`

**Ajouter la route PATCH:**

```typescript
add('PATCH', '/api/workers/:workerId', async ({ params, body }) => {
	return this.service.updateWorkerName(params.workerId, body.name);
});
```

#### 2.3 DataStoreFactory

**Fichier:** `packages/web-backend/src/factories/DataStoreFactory.ts`

**Modifier `getWorkersService()` (lignes 150-161):**

```typescript
getWorkersService(): WorkersService {
  if (!this.workersService) {
    const eventBroadcaster = this.getEventBroadcaster();

    // NOUVEAU: Créer WorkersRepository
    const workersBaseRepo = new BaseRepository<WorkerMetadata>(
      'workers',
      this.storage
    );
    const workersRepository = new WorkersRepository(workersBaseRepo);

    // Passer workersRepository au service
    this.workersService = new WorkersService(
      this.orchestratorWrapper,
      eventBroadcaster,
      workersRepository  // NOUVEAU
    );
  }
  return this.workersService;
}
```

**Importer WorkerMetadata:**

```typescript
import type { WorkerMetadata } from '../repositories/WorkersRepository';
import { WorkersRepository } from '../repositories/WorkersRepository';
```

### Phase 3: Frontend - Composant EditableText (2h)

#### 3.1 Créer EditableText

**Fichier:** `packages/web-frontend/src/framework/components/forms/EditableText.tsx` (NOUVEAU)

**Créer un composant réutilisable:**

```typescript
export interface EditableTextProps {
  value: string | undefined;
  placeholder?: string;
  onSave: (newValue: string) => Promise<void>;
  onCancel?: () => void;
  maxLength?: number;
}

export function EditableText({ value = '', placeholder, onSave, maxLength = 100 }: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (trimmed === value) {
      setIsEditing(false);
      return;
    }

    try {
      setIsSaving(true);
      await onSave(trimmed);
      setIsEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setIsEditing(false);
  };

  if (isEditing) {
    return (
      <Input
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        maxLength={maxLength}
        autoFocus
      />
    );
  }

  return (
    <div onClick={() => setIsEditing(true)} className="cursor-pointer hover:underline">
      {value || <span className="text-muted-foreground italic">{placeholder}</span>}
    </div>
  );
}
```

### Phase 4: Frontend - Integration (2-3h)

#### 4.1 API Client

**Fichier:** `packages/web-frontend/src/app/pages/workers/workers.api.ts`

**Ajouter:**

```typescript
updateWorkerName: (workerId: string, name: string): Promise<Worker> => {
  return typedFetch('PATCH', '/api/workers/:workerId', {
    params: { workerId },
    body: { name },
  });
},
```

#### 4.2 WorkersService

**Fichier:** `packages/web-frontend/src/app/pages/workers/WorkersService.ts`

**Ajouter:**

```typescript
async renameWorker(workerId: string, name: string): Promise<Worker> {
  return workersApi.updateWorkerName(workerId, name);
}
```

#### 4.3 WorkersTable2

**Fichier:** `packages/web-frontend/src/app/pages/workers2/WorkersTable2.tsx`

**Modifications:**

1. **Importer:**

```typescript
import { EditableText } from '@framework/components/forms/EditableText';

import { workersService } from '@/app/pages/workers/WorkersService';
```

2. **Ajouter handler:**

```typescript
const handleRenameWorker = async (workerId: string, newName: string) => {
	try {
		await workersService.renameWorker(workerId, newName);
		// Mise à jour temps réel via WebSocket (B2F_WORKER_UPDATED)
	} catch (error) {
		console.error('Failed to rename worker:', error);
		throw error;
	}
};
```

3. **Ajouter colonne name dans WORKERS_TABLE2_COLUMNS (après workerId):**

```typescript
{
  key: 'name',
  label: 'Name',
  render: (w: Worker) => (
    <EditableText
      value={w.name}
      placeholder="Set name..."
      onSave={(newName) => handleRenameWorker(w.workerId, newName)}
      maxLength={100}
    />
  ),
},
```

#### 4.4 Mises à jour temps réel

**Fichier:** `packages/web-frontend/src/app/pages/workers/useWorkers.ts`

**Vérifier que B2F_WORKER_UPDATED est déjà souscrit** (ligne 85 - déjà présent)

Si nécessaire, ajouter gestion des mises à jour individuelles:

```typescript
// Souscrire aux mises à jour individuelles de workers
const unsubscribeWorker = transport.subscribe(B2F_WORKER_UPDATED, (worker: Worker) => {
	if (data) {
		const updatedWorkers = data.workers.map(w => (w.workerId === worker.workerId ? worker : w));
		setData({ ...data, workers: updatedWorkers });
	}
});
```

### Phase 5: Tests (3-4h)

#### 5.1 Tests Backend

**`WorkersRepository.test.ts`:**

- findByWorkerId retourne null si n'existe pas
- findByWorkerId retourne metadata si existe
- updateName crée si n'existe pas
- updateName met à jour si existe

**`WorkersService.test.ts`:**

- updateWorkerName throw si worker n'existe pas
- updateWorkerName met à jour et émet événement
- getWorkersData fusionne les noms

**`WorkersController.test.ts`:**

- PATCH /api/workers/:workerId appelle service
- Validation du body

#### 5.2 Tests Frontend

**`EditableText.test.tsx`:**

- Affiche valeur en mode lecture
- Entre en mode édition au clic
- Sauvegarde avec Enter
- Annule avec Escape
- Validation des erreurs

**`WorkersTable2.test.tsx`:**

- Affiche colonne name avec EditableText
- Appelle onRenameWorker

### Phase 6: Vérification Finale

1. **Lancer `/check`** après chaque phase
2. **Tests manuels:**
    - Renommer un worker depuis la table
    - Vérifier la persistence après refresh
    - Vérifier la mise à jour temps réel sur un 2e client
    - Tester validation (nom vide, trop long)

## Fichiers Critiques à Modifier

### Backend

1. ✅ `packages/shared-frontend-backend/src/api/workers.contract.ts` - Ajouter name, PATCH route
2. ✅ `packages/web-backend/src/repositories/WorkersRepository.ts` - NOUVEAU
3. ✅ `packages/web-backend/src/repositories/index.ts` - Export
4. ✅ `packages/web-backend/src/services/WorkersService.ts` - updateWorkerName, fusion metadata
5. ✅ `packages/web-backend/src/controllers/WorkersController.ts` - Route PATCH
6. ✅ `packages/web-backend/src/factories/DataStoreFactory.ts` - Wire WorkersRepository

### Frontend

7. ✅ `packages/web-frontend/src/framework/components/forms/EditableText.tsx` - NOUVEAU
8. ✅ `packages/web-frontend/src/app/pages/workers/workers.api.ts` - updateWorkerName
9. ✅ `packages/web-frontend/src/app/pages/workers/WorkersService.ts` - renameWorker
10. ✅ `packages/web-frontend/src/app/pages/workers2/WorkersTable2.tsx` - Colonne name

## Points d'Attention

### WorkerMetadata Interface

Le type `WorkerMetadata` doit étendre `BaseEntity` pour fonctionner avec `BaseRepository`:

```typescript
import type { BaseEntity } from '@app/shared/common/base-entity';

export interface WorkerMetadata extends BaseEntity {
	workerId: string; // Clé métier
	name?: string;
}
```

### Gestion des Erreurs

- Worker inexistant → 404
- Nom vide/trop long → Validation Zod (automatique)
- Erreur réseau → Affichage dans EditableText

### Migration Future DB

Lorsque la migration vers MariaDB sera faite:

- Le DataStoreFactory gérera automatiquement la transition
- Aucun changement de code nécessaire dans les services/controllers
- Migration des données de `/data/workers.json` vers MariaDB

## Estimation

- **Total:** 12-16 heures
- **Backend:** 5-7h
- **Frontend:** 4-5h
- **Tests:** 3-4h

## Critères d'Acceptation

- ✅ Utilisateur peut cliquer sur nom pour éditer
- ✅ Sauvegarde avec Enter, annule avec Escape
- ✅ Validation 1-100 caractères
- ✅ Persistence après refresh
- ✅ Mise à jour temps réel sur tous les clients
- ✅ Recherche fonctionne par nom
- ✅ Placeholder si pas de nom
- ✅ Tests >70% de couverture
