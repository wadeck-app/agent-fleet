# Worker ID Personnalisé

## Vue d'ensemble

Vous pouvez maintenant assigner des IDs personnalisés à vos workers. C'est très utile pour :
- Avoir des workspaces préconfigurés avec des workers dédiés
- Identifier facilement vos workers dans les logs
- Associer des configurations spécifiques à chaque worker

## Utilisation

### Option 1 : Flag CLI (Recommandé)

```bash
fleet-worker -i --worker-id=alice
fleet-worker -i --worker-id=bob
fleet-worker -i --worker-id=frontend
```

### Option 2 : Variable d'environnement

```bash
WORKER_ID=alice fleet-worker -i
WORKER_ID=bob fleet-worker -i
```

### Option 3 : Auto-numérotation (par défaut)

Si vous ne spécifiez pas d'ID, le système utilisera la numérotation automatique (1, 2, 3...) :

```bash
fleet-worker -i  # Sera "1" (ou le prochain numéro disponible)
```

## Comportement

### ID disponible
Si l'ID demandé n'est pas déjà pris, il sera utilisé :

```
[WS] Using preferred worker ID: alice
[WS] Worker alice (dev) is ready
```

### ID déjà pris
Si l'ID est déjà utilisé, le système assignera automatiquement un numéro :

```
[WS] Preferred ID 'alice' already taken, assigned '2' instead
[WS] Worker 2 (dev) is ready
```

## Cas d'usage : Workspaces préconfigurés

Imaginons que vous ayez une structure comme ceci :

```
MyProject/
  workspaces/
    frontend/
      .agent-fleet/
        flows.yaml
      src/
    backend/
      .agent-fleet/
        flows.yaml
      src/
    testing/
      .agent-fleet/
        flows.yaml
      tests/
```

Vous pouvez lancer un worker dédié pour chaque workspace :

```bash
# Terminal 1 - Orchestrator
fleet-orchestrator

# Terminal 2 - Worker frontend
cd MyProject/workspaces/frontend
fleet-worker -i --worker-id=frontend

# Terminal 3 - Worker backend
cd MyProject/workspaces/backend
fleet-worker -i --worker-id=backend

# Terminal 4 - Worker testing
cd MyProject/workspaces/testing
fleet-worker -i --worker-id=testing
```

Maintenant :
- Le worker `frontend` travaillera uniquement dans le workspace frontend
- Le worker `backend` travaillera uniquement dans le workspace backend
- Le worker `testing` travaillera uniquement dans le workspace testing

Chaque worker aura ses propres flows (définis dans `.agent-fleet/flows.yaml` de chaque workspace).

## API / Protocole

### Message WORKER_READY

Le worker envoie maintenant un champ optionnel `preferredId` :

```typescript
{
  type: 'worker_ready',
  workerType: 'dev',
  preferredId?: 'alice'  // Nouveau champ optionnel
}
```

### Logique côté orchestrator

1. Si `preferredId` est fourni ET disponible → utilise `preferredId`
2. Si `preferredId` est fourni MAIS déjà pris → utilise auto-numérotation + log warning
3. Si `preferredId` n'est pas fourni → utilise auto-numérotation

## Exemples

### Exemple 1 : Environnement de dev avec équipe

```bash
# Alice travaille sur le frontend
WORKER_ID=alice fleet-worker -i
cd frontend-workspace

# Bob travaille sur le backend
WORKER_ID=bob fleet-worker -i
cd backend-workspace

# Charlie fait les tests
WORKER_ID=charlie fleet-worker -i
cd testing-workspace
```

### Exemple 2 : Workers temporaires

```bash
# Workers avec IDs aléatoires/temporaires
fleet-worker -i --worker-id=temp-$(date +%s)
```

### Exemple 3 : Mix auto + custom

```bash
# Worker principal avec ID fixe
fleet-worker -i --worker-id=main

# Workers supplémentaires auto-numérotés
fleet-worker -i  # Sera "1"
fleet-worker -i  # Sera "2"
```
