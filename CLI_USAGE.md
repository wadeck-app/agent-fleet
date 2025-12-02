# CLI Usage Guide

## Installation

Pour utiliser les commandes CLI globalement depuis n'importe quel dossier :

```bash
# Depuis le dossier agent-fleet
npm link
```

**Note** : Vous n'avez besoin de faire `npm link` qu'**une seule fois** (ou si vous changez de machine).

## Commandes disponibles

### 1. fleet-orchestrator

Lance l'orchestrator qui gère les tâches et les workers.

```bash
# Mode watch (par défaut - auto-reload lors des modifications de code)
fleet-orchestrator

# Mode sans watch (pas d'auto-reload)
fleet-orchestrator --no-watch
```

### 2. fleet-worker

Lance un worker depuis n'importe quel dossier. Le worker utilisera le dossier courant comme `projectRoot`.

```bash
# Mode watch par défaut (auto-reload lors des modifications de code)
fleet-worker

# Mode interactif (avec Claude) - watch activé par défaut
fleet-worker -i
fleet-worker --interactive

# Mode sans watch (pas d'auto-reload)
fleet-worker --no-watch

# Sans watch + interactif
fleet-worker --no-watch -i

# Avec un ID personnalisé (utile pour workspaces préconfigurés)
fleet-worker -i --worker-id=alice
fleet-worker -i --worker-id=bob

# Via variable d'environnement
WORKER_ID=alice fleet-worker -i
```

**Utilisation depuis un autre projet** :

```bash
cd C:\Mon\Autre\Projet
fleet-worker -i
```

Le worker cherchera le fichier `.agent-fleet/flows.yaml` dans `C:\Mon\Autre\Projet`.

**Worker ID personnalisé** :

Vous pouvez spécifier un ID pour votre worker. Cela est utile si vous voulez avoir des workspaces préconfigurés associés à des workers spécifiques :

```bash
# Terminal 1 - Worker "alice"
fleet-worker -i --worker-id=alice

# Terminal 2 - Worker "bob"
fleet-worker -i --worker-id=bob

# Terminal 3 - Worker auto-numéroté (1, 2, 3...)
fleet-worker -i
```

Si l'ID est déjà pris, le système assignera automatiquement un ID numérique.

### 3. fleet-task

Crée une nouvelle tâche dans l'orchestrator.

```bash
# Créer une tâche simple
fleet-task "Implement a new feature"

# Créer une tâche avec un flow spécifique
fleet-task "Fix bug in authentication" --flow debug-local

# Voir l'aide
fleet-task --help
```

## Exemples de workflow

### Scénario 1 : Développement local dans agent-fleet

```bash
# Terminal 1 : Lance l'orchestrator (watch activé par défaut)
cd C:\Workspace_Tooling\agent-fleet
fleet-orchestrator

# Terminal 2 : Lance un worker interactif (watch activé par défaut)
fleet-worker -i

# Terminal 3 : Crée des tâches
fleet-task "Implement feature X" --flow simple-implement
```

### Scénario 2 : Worker dans un projet externe

```bash
# Terminal 1 : L'orchestrator tourne déjà
# (dans agent-fleet)

# Terminal 2 : Lance un worker depuis un autre projet (watch activé par défaut)
cd C:\Mon\Autre\Projet
fleet-worker -i

# Le worker utilisera les flows définis dans :
# C:\Mon\Autre\Projet\.agent-fleet\flows.yaml
```

### Scénario 3 : Workspaces préconfigurés avec IDs personnalisés

Utile quand vous avez des workspaces déjà préparés pour des workers spécifiques :

```bash
# Terminal 1 : Orchestrator
fleet-orchestrator

# Terminal 2 : Worker "frontend" dans le workspace frontend
cd C:\Projects\MyApp\workspaces\frontend
fleet-worker -i --worker-id=frontend

# Terminal 3 : Worker "backend" dans le workspace backend
cd C:\Projects\MyApp\workspaces\backend
fleet-worker -i --worker-id=backend

# Terminal 4 : Worker "testing" dans le workspace testing
cd C:\Projects\MyApp\workspaces\testing
fleet-worker -i --worker-id=testing
```

Chaque worker aura un ID fixe et travaillera dans son workspace dédié.

## Désinstallation

Pour supprimer les liens globaux :

```bash
cd C:\Workspace_Tooling\agent-fleet
npm unlink
```

## Mode watch (activé par défaut)

Le mode watch est **activé par défaut** pour faciliter le développement :
- ✅ Les modifications de code sont détectées automatiquement
- ✅ Le processus redémarre avec les nouvelles modifications
- ✅ Idéal pour le développement

Avec `--no-watch` :
- ❌ Pas d'auto-reload
- ✅ Plus léger en ressources
- ✅ Idéal pour la production

**Note** : Le watch des **flows** (fichier `.agent-fleet/flows.yaml`) fonctionne **toujours**, même avec `--no-watch`. Le flag `--no-watch` contrôle uniquement l'auto-reload du **code source** d'agent-fleet.
