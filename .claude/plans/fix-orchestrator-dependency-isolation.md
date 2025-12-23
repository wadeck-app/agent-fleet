# Plan: Corriger l'isolation des dépendances orchestrator

## Problème

Le backend (`web-backend`) importe directement le package `orchestrator`, ce qui viole le principe d'isolation architecturale. Le backend devrait **uniquement** dépendre de `orchestrator-adapters`, qui doit gérer la création de l'instance d'Orchestrator en interne.

### Erreur actuelle

```
Cannot find module 'C:\...\node_modules\orchestrator\core\index.js'
```

### Cause racine

- **Ligne 50 de `server.ts`** : Import direct `await import('orchestrator/core/index.js')`
- **Architecture incorrecte** : Le backend crée l'instance d'Orchestrator et la passe au Factory
- **Dépendance violée** : `web-backend/package.json` a `orchestrator` en devDependency

### Architecture souhaitée

```
Backend → orchestrator-adapters → orchestrator (en mode library uniquement)
                                 → REST API (en mode remote)
```

## Solution

### 1. Créer un point d'entrée pour le package orchestrator

**Fichier à créer : `packages/orchestrator/src/index.ts`**

```typescript
// Export principal pour permettre l'import du package
export { Orchestrator } from './core/index.js';

// Re-export des types utiles
export type { OrchestratorConfig } from './core/index.js';
```

**Raison** : Permet d'importer `orchestrator` proprement avec `import { Orchestrator } from 'orchestrator'`

### 2. Modifier OrchestratorClientFactory pour gérer la création d'Orchestrator

**Fichier : `packages/orchestrator-adapters/src/OrchestratorClientFactory.ts`**

Modifications :

1. Ajouter un paramètre `orchestratorConfig` dans la signature de `create()` pour le mode library
2. En mode library, importer dynamiquement `orchestrator` et créer l'instance en interne
3. Retirer le paramètre `orchestratorInstance` (breaking change)

```typescript
interface LibraryModeConfig {
  mode: 'library';
  wsPort?: number;
  restPort?: number;
  projectRoot?: string;
}

static async create(
  config: OrchestratorClientConfig
): Promise<OrchestratorClient> {
  if (isLibraryMode(config)) {
    // Import dynamique d'orchestrator (peerDependency optionnelle)
    const { Orchestrator } = await import('orchestrator');

    // Créer l'instance en interne
    const orchestrator = new Orchestrator({
      wsPort: config.wsPort || 3738,
      restPort: config.restPort || 3737,
      projectRoot: config.projectRoot,
    });

    await orchestrator.start();

    // Créer l'adapter
    const { LibraryOrchestratorAdapter } = await import('./adapters/LibraryAdapter.js');
    return new LibraryOrchestratorAdapter(orchestrator);
  }
  // ... remote mode unchanged
}
```

### 3. Mettre à jour OrchestratorClientConfig

**Fichier : `packages/orchestrator-adapters/src/OrchestratorClientConfig.ts`**

Ajouter les champs de configuration pour le mode library :

```typescript
export interface LibraryModeConfig {
	mode: 'library';
	wsPort?: number;
	restPort?: number;
	projectRoot?: string;
}

export type OrchestratorClientConfig = LibraryModeConfig | RemoteModeConfig;
```

### 4. Simplifier server.ts dans web-backend

**Fichier : `packages/web-backend/src/server.ts`**

Modifications :

1. **Supprimer** l'import direct d'orchestrator (lignes 46-50)
2. **Supprimer** la création manuelle de l'instance (lignes 53-62)
3. **Simplifier** `initializeOrchestratorClient()` pour passer juste la config

```typescript
async function initializeOrchestratorClient(): Promise<OrchestratorClient> {
	const mode = process.env.ORCHESTRATOR_MODE || 'library';

	if (mode === 'library') {
		logger.info('[Orchestrator] Initializing in library mode (embedded)');

		const orchestratorWsPort = parseInt(process.env.ORCHESTRATOR_WS_PORT || '3738', 10);
		const orchestratorRestPort = parseInt(process.env.ORCHESTRATOR_REST_PORT || '3737', 10);

		// Le Factory gère la création de l'Orchestrator en interne
		const orchestratorClient = await OrchestratorClientFactory.create({
			mode: 'library',
			wsPort: orchestratorWsPort,
			restPort: orchestratorRestPort,
		});

		await orchestratorClient.connect();
		logger.info('[Orchestrator] LibraryAdapter connected');

		return orchestratorClient;
	} else if (mode === 'remote') {
		// Remote mode unchanged
		const url = process.env.ORCHESTRATOR_URL;
		if (!url) {
			throw new Error('ORCHESTRATOR_URL is required when ORCHESTRATOR_MODE=remote');
		}

		logger.info(`[Orchestrator] Initializing in remote mode (URL: ${url})`);

		const transportMode = (process.env.ORCHESTRATOR_TRANSPORT as any) || 'auto';

		const orchestratorClient = await OrchestratorClientFactory.create({
			mode: 'remote',
			url,
			transportMode,
		});

		await orchestratorClient.connect();
		logger.info('[Orchestrator] RemoteAdapter connected');

		return orchestratorClient;
	} else {
		throw new Error(`Invalid ORCHESTRATOR_MODE: ${mode}. Must be 'library' or 'remote'.`);
	}
}
```

### 5. Nettoyer les dépendances dans web-backend

**Fichier : `packages/web-backend/package.json`**

Options :

- **Option A (Recommandée)** : Supprimer complètement la dépendance

```json
{
	"devDependencies": {
		// Supprimer : "orchestrator": "*",
	}
}
```

- **Option B** : La marquer comme optionnelle (via peerDependencies)

```json
{
	"peerDependencies": {
		"orchestrator": "*"
	},
	"peerDependenciesMeta": {
		"orchestrator": {
			"optional": true
		}
	}
}
```

**Recommandation** : Option A - Le backend ne devrait pas avoir de lien direct avec orchestrator.

## Fichiers impactés

### Modifications requises

1. `packages/orchestrator/src/index.ts` - **CRÉER** (nouveau fichier)
2. `packages/orchestrator-adapters/src/OrchestratorClientFactory.ts` - **MODIFIER**
3. `packages/orchestrator-adapters/src/OrchestratorClientConfig.ts` - **MODIFIER**
4. `packages/web-backend/src/server.ts` - **MODIFIER** (simplifier)
5. `packages/web-backend/package.json` - **MODIFIER** (nettoyer dépendances)

### Rebuild nécessaire

Après les modifications, rebuild les packages dans cet ordre :

```bash
npm run build:orchestrator
npm run build --workspace=orchestrator-adapters
npm run build:backend
```

## Bénéfices

1. **Isolation architecturale** : Le backend ne dépend QUE de `orchestrator-adapters`
2. **Responsabilité unique** : Le Factory gère la création d'Orchestrator
3. **Simplicité** : Le backend passe juste une config, pas d'instance complexe
4. **Cohérence** : Mode library et remote ont la même interface dans server.ts
5. **Testabilité** : Plus facile de mocker orchestrator-adapters sans dépendance directe

## Risques et mitigations

### Risque 1 : Breaking change pour LibraryAdapter

**Impact** : La signature de `create()` change (plus de paramètre `orchestratorInstance`)
**Mitigation** : Ce code est récent et pas encore utilisé en production

### Risque 2 : Import dynamique peut échouer

**Impact** : Si orchestrator n'est pas installé en mode library
**Mitigation** : Ajouter un try/catch avec un message d'erreur clair

### Risque 3 : Tests peuvent casser

**Impact** : Les tests qui mockaient l'orchestrator doivent être adaptés
**Mitigation** : Vérifier et ajuster les tests après les modifications

## Validation

### Tests manuels

1. Démarrer en mode library : `npm run dev:backend:library`
2. Démarrer en mode remote : `npm run dev:backend:remote`
3. Vérifier les logs : "Orchestrator started on WS port..."
4. Tester une requête API pour confirmer que tout fonctionne

### Tests automatisés

1. Exécuter les tests du backend : `npm run test --workspace=web-backend`
2. Exécuter les tests d'orchestrator-adapters : `npm run test --workspace=orchestrator-adapters`
3. Vérifier la couverture de tests reste > 70%
