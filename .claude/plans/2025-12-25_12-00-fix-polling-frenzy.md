# Fix: Polling Frénétique - État Reconnecting Non Géré

**Date**: 2025-12-25_12-00
**Status**: En planification
**Priorité**: CRITIQUE 🔥

## Bug Identifié

### Problème

Quand WebSocket se déconnecte, les hooks (`useDashboard`, `useTasks`, `useWorkers`) démarrent immédiatement leur polling REST, **même pendant que WebSocket tente de se reconnecter avec exponential backoff**.

### Comportement Actuel (Bugué)

```
1. WebSocket se déconnecte
2. État → "reconnecting"
3. isConnected() → false
4. useDashboard voit wsConnected=false → démarre polling REST à 5s
5. useTasks voit wsConnected=false → démarre polling REST à 5s
6. useWorkers voit wsConnected=false → démarre polling REST à 5s
7. WebSocket tente reconnexion: 1s, 2s, 4s, 8s, 16s... (exponential backoff)
8. Résultat: Trafic réseau frénétique (3x polling REST + tentatives WS)
```

### Code Problématique

**TransportProvider.tsx:196**

```typescript
isConnected: connectionState === 'connected',
```

→ `isConnected = false` pour 'reconnecting', 'disconnected', 'error'

**useDashboard.ts:203**

```typescript
if (!enabled || isInitialLoad || wsConnected) {
    return;
}
console.log('[useDashboard] Starting polling (WebSocket disconnected)');
const intervalId = setInterval(async () => {
    // Polling REST à 5000ms
}, pollInterval);
```

→ Démarre dès que `wsConnected = false`, même en "reconnecting"

---

## Solution

### Principe

**Ne démarrer le polling REST QUE si WebSocket a abandonné définitivement** (état 'error' après 10 tentatives).

Pendant 'reconnecting', les hooks **attendent passivement** que WebSocket réussisse ou abandonne.

### Étape 1: Exposer `connectionState` dans `useTransport()`

**Fichier**: `packages/web-frontend/src/transport/index.ts`

**Modifier**:

```typescript
export function useTransport(): ITransportClient {
	const { transport } = useTransportContext();
	if (!transport) {
		throw new Error('useTransport must be used within TransportProvider');
	}
	return transport;
}
```

**En**:

```typescript
export interface TransportHookResult {
	transport: ITransportClient;
	connectionState: ConnectionState;
	isConnected: boolean;
}

export function useTransport(): TransportHookResult {
	const context = useTransportContext();
	if (!context.transport) {
		throw new Error('useTransport must be used within TransportProvider');
	}
	return {
		transport: context.transport,
		connectionState: context.connectionState,
		isConnected: context.isConnected,
	};
}
```

### Étape 2: Utiliser `connectionState` dans les Hooks

**Fichier**: `packages/web-frontend/src/app/pages/dashboard/useDashboard.ts`

**AVANT** (ligne 198-228):

```typescript
useEffect(() => {
	// Don't poll if:
	// - Not enabled
	// - Still doing initial load
	// - WebSocket is connected (real-time updates active)
	if (!enabled || isInitialLoad || wsConnected) {
		return;
	}

	console.log('[useDashboard] Starting polling (WebSocket disconnected)');
	const intervalId = setInterval(async () => {
		// ...
	}, pollInterval);

	return () => {
		console.log('[useDashboard] Stopping polling');
		clearInterval(intervalId);
	};
}, [enabled, isInitialLoad, pollInterval, wsConnected]);
```

**APRÈS**:

```typescript
const { transport, connectionState } = useTransport();
const wsConnected = connectionState === 'connected';

useEffect(() => {
	// Don't poll if:
	// - Not enabled
	// - Still doing initial load
	// - WebSocket is connected OR reconnecting (wait for WS backoff)
	// - WebSocket not used
	if (!enabled || isInitialLoad || !useWebSocket) {
		return;
	}

	// Only start polling if WebSocket has given up (state 'error')
	if (connectionState !== 'error' && connectionState !== 'disconnected') {
		console.log(`[useDashboard] Waiting for WebSocket (state: ${connectionState})`);
		return;
	}

	console.log('[useDashboard] Starting REST polling (WebSocket failed)');
	const intervalId = setInterval(async () => {
		// ...
	}, pollInterval);

	return () => {
		console.log('[useDashboard] Stopping REST polling');
		clearInterval(intervalId);
	};
}, [enabled, isInitialLoad, pollInterval, useWebSocket, connectionState]);
```

**Logique Corrigée**:

- État 'connected' → Pas de polling (WS actif)
- État 'connecting' → Pas de polling (attente connexion initiale)
- État 'reconnecting' → **Pas de polling** (attente exponential backoff WS)
- État 'disconnected' → Polling REST (pas de WS disponible)
- État 'error' → **Polling REST** (WS a abandonné après 10 tentatives)

### Étape 3: Appliquer à Tous les Hooks

**Fichiers**:

- `packages/web-frontend/src/app/pages/tasks/useTasks.ts`
- `packages/web-frontend/src/app/pages/workers/useWorkers.ts`

Même transformation que `useDashboard.ts`.

### Étape 4: Indicateur Visuel avec Transport Type

**Fichier**: `packages/web-frontend/src/app/components/connectivity/ConnectionModeIndicator.tsx`

```typescript
import { useTransport } from '@/transport';
import { useConnectivity } from '@framework/features/connectivity/ConnectivityContext';

export function ConnectionModeIndicator() {
	const { transport, connectionState, isConnected } = useTransport();
	const { status } = useConnectivity();

	// Get transport type (websocket, sse, long-polling, http, mock)
	const transportType = transport.getTransportType();

	// Determine display based on state AND type
	let badge = '';
	let color = '';
	let description = '';

	if (connectionState === 'connected') {
		// Connected - show transport type
		switch (transportType) {
			case 'websocket':
				badge = '⚡ WebSocket (3030)';
				color = 'bg-green-500';
				description = 'Real-time updates';
				break;
			case 'sse':
				badge = '📡 SSE (3030)';
				color = 'bg-green-500';
				description = 'Server-sent events';
				break;
			case 'long-polling':
				badge = '🔄 Long Polling (3030)';
				color = 'bg-green-500';
				description = 'Long polling mode';
				break;
			case 'http':
				badge = '🔌 REST';
				color = 'bg-yellow-500';
				description = 'Polling mode';
				break;
			case 'mock':
				badge = '🧪 Mock';
				color = 'bg-purple-500';
				description = 'Test mode';
				break;
		}
	} else if (connectionState === 'connecting') {
		badge = '🔌 Connecting...';
		color = 'bg-blue-500';
		description = 'Initial connection';
	} else if (connectionState === 'reconnecting') {
		badge = '🔄 Reconnecting...';
		color = 'bg-orange-500';
		description = 'Attempting to reconnect';
	} else if (connectionState === 'error') {
		badge = '❌ Failed';
		color = 'bg-red-500';
		description = 'Connection failed (polling REST)';
	} else {
		// disconnected
		badge = '🔌 REST Fallback';
		color = 'bg-yellow-500';
		description = 'Polling mode';
	}

	return (
		<div className="flex items-center gap-2 text-xs">
			<span className={`${color} rounded-full px-2 py-1 text-white font-medium`}>
				{badge}
			</span>
			<span className="text-gray-500">{description}</span>
		</div>
	);
}
```

### Étape 5: Ajouter au Layout

**Fichier**: `packages/web-frontend/src/app/components/navigation/DesktopSidebar.tsx` ou Header

```typescript
import { ConnectionModeIndicator } from '@app/components/connectivity/ConnectionModeIndicator';

// Dans le header/footer du sidebar
<div className="border-t p-4">
	<ConnectionModeIndicator />
</div>
```

---

## Tests à Effectuer

### Test 1: Déconnexion Backend

1. Démarrer frontend + backend
2. Vérifier indicateur: ⚡ WebSocket (3030)
3. Arrêter backend
4. **Vérifier**: Indicateur passe en 🔄 Reconnecting (1s, 2s, 4s, 8s...)
5. **Vérifier**: Console ne montre PAS de polling REST pendant reconnecting
6. **Attendre 10 tentatives** (env. 30s)
7. **Vérifier**: Indicateur passe en ❌ Failed → 🔌 REST Fallback
8. **Vérifier**: Console montre polling REST démarre MAINTENANT

### Test 2: Reconnexion Réussie

1. Pendant phase "reconnecting" (avant 10 tentatives)
2. Relancer backend
3. **Vérifier**: WebSocket se reconnecte immédiatement
4. **Vérifier**: Indicateur passe en ⚡ WebSocket (3030)
5. **Vérifier**: Polling REST ne démarre JAMAIS

### Test 3: Network Tab

1. Déconnecter backend
2. Ouvrir DevTools → Network
3. **Vérifier**: Pendant "reconnecting", seulement tentatives WS upgrade (toutes les 1-2-4-8s)
4. **Vérifier**: Aucun appel REST GET /api/dashboard, /api/tasks, /api/workers
5. Après 10 tentatives (état 'error')
6. **Vérifier**: Appels REST démarrent à 5000ms d'intervalle

### Test 4: Différents Transport Types

1. Si SSE configuré → Indicateur: 📡 SSE (3030)
2. Si Long Polling → Indicateur: 🔄 Long Polling (3030)
3. Si REST seul → Indicateur: 🔌 REST

---

## Bénéfices

✅ **Plus de polling frénétique** - Attente passive pendant reconnecting
✅ **Exponential backoff respecté** - Une seule stratégie de reconnexion (WS)
✅ **Bande passante économisée** - Pas de double trafic (WS + REST)
✅ **UX claire** - Indicateur visuel montre l'état exact
✅ **Type de transport visible** - SSE/Long Polling/WebSocket différenciés

---

## Ordre d'Exécution

1. ✅ Exposer `connectionState` dans `useTransport()`
2. ✅ Modifier `useDashboard` pour détecter state 'reconnecting'
3. ✅ Modifier `useTasks` pour détecter state 'reconnecting'
4. ✅ Modifier `useWorkers` pour détecter state 'reconnecting'
5. ✅ Créer `ConnectionModeIndicator` avec support SSE/LongPolling
6. ✅ Ajouter indicateur au layout
7. ✅ Test 1: Déconnexion → vérifier pas de polling pendant reconnecting
8. ✅ Test 2: Reconnexion réussie → vérifier polling ne démarre jamais
9. ✅ Test 3: Network tab → vérifier traffic
10. ✅ Run checks
