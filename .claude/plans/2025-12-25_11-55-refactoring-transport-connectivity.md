# Plan: Refactoring Transport & Connectivity - Éliminer Duplication et Bugs

**Date**: 2025-12-25_11-55
**Status**: En planification

## Problèmes Identifiés

### 1. ❌ Duplication de Code (Pattern Polling/WS)

**Localisation**: `useDashboard.ts`, `useTasks.ts`, `useWorkers.ts`

Chaque hook réimplémente le même pattern :

- Subscription WebSocket
- Fallback polling REST si WS déconnecté
- Gestion `isInitialLoad`
- Gestion `isMountedRef`

**Impact**: Code fragile, difficile à maintenir, inconsistences potentielles

### 2. ❌ Backend utilise fetch HTTP au lieu d'OrchestratorWrapper

**Localisation**: `TasksService.ts` ligne 57, `WorkersService.ts` similaire

```typescript
// MAUVAIS - fetch HTTP alors qu'on est en library mode
const response = await fetch(tasksUrl);
```

**Devrait être**:

```typescript
// BON - Direct access via OrchestratorWrapper
const tasks = await this.orchestratorWrapper.getTasks();
```

**Impact**:

- Appels HTTP inutiles en library mode
- Latence ajoutée
- Bypass du wrapper optimisé

### 3. ❌ Déconnexion WS non reliée à ConnectivityContext

**Problème**: Si WS se déconnecte, le frontend passe en polling REST frénétique (1-2s) au lieu d'utiliser l'exponential backoff du `CircuitBreakerService`

**Localisation**: `WebSocketTransportClient.ts` gère sa propre reconnexion, mais ne communique pas avec `ConnectivityContext`

**Impact**:

- Double système de reconnexion (WS + CircuitBreaker)
- UX incohérente (indicateur REST ne reflète pas l'état WS)
- Polling agressif

### 4. ❌ Pas d'indicateur visuel pour le mode de connexion

**Manquant**: Un indicateur montrant :

- WebSocket connecté (port 3030)
- WebSocket en reconnexion
- Mode fallback REST (polling)

---

## Phase 1: Créer Hook Générique `useReactiveData`

**Objectif**: Extraire la logique commune de polling/WS dans un hook réutilisable

### Fichier: `packages/web-frontend/src/framework/hooks/useReactiveData.ts`

````typescript
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EventType } from '@shared/transport';

import { useTransport } from '@/transport';

import { useAbortableEffect } from './useAbortableEffect';

export interface UseReactiveDataParams<T, F> {
	/** Enable the hook */
	enabled?: boolean;

	/** Event type to subscribe to (optional, if not provided = REST-only) */
	eventType?: EventType;

	/** Filters for server-side event filtering */
	eventFilters?: Record<string, unknown>;

	/** Enable WebSocket subscription */
	useWebSocket?: boolean;

	/** Poll interval in ms (fallback when WS disconnected) */
	pollInterval?: number;

	/** Fetch function for initial load and polling */
	fetchFn: (signal: AbortSignal, filters?: F) => Promise<T>;

	/** Optional filters for fetch function */
	filters?: F;
}

export interface UseReactiveDataResult<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	wsConnected: boolean;
	refresh: () => Promise<void>;
	clearError: () => void;
}

/**
 * Generic hook for reactive data with WebSocket + REST fallback
 *
 * Strategy:
 * - Initial load via REST
 * - Subscribe to WebSocket events (if eventType provided)
 * - Fallback to polling REST when WS disconnected
 * - Loading only on initial load
 *
 * @example
 * ```tsx
 * const { data, loading, error, wsConnected } = useReactiveData({
 *   eventType: B2F_TASKS_UPDATED,
 *   eventFilters: { workerId: 'worker-123' },
 *   fetchFn: (signal, filters) => tasksService.getTasksData(filters),
 *   filters: { workerId: 'worker-123' },
 *   pollInterval: 5000,
 * });
 * ```
 */
export function useReactiveData<T, F = void>({
	enabled = true,
	eventType,
	eventFilters,
	useWebSocket = true,
	pollInterval,
	fetchFn,
	filters,
}: UseReactiveDataParams<T, F>): UseReactiveDataResult<T> {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const isMountedRef = useRef(true);

	const transport = useTransport();
	const wsConnected = transport.isConnected();

	// Handle WebSocket event
	const handleEvent = useCallback((eventData: T) => {
		if (isMountedRef.current) {
			console.log('[useReactiveData] Received update via WebSocket');
			setData(eventData);
			setError(null);
		}
	}, []);

	// Subscribe to WebSocket events
	useEffect(() => {
		if (!enabled || !useWebSocket || !eventType) return;

		console.log('[useReactiveData] Subscribing to', eventType, 'with filters:', eventFilters);
		const unsubscribe = transport.subscribe(eventType as any, handleEvent, eventFilters);

		return () => {
			console.log('[useReactiveData] Unsubscribing from', eventType);
			unsubscribe();
		};
	}, [enabled, useWebSocket, eventType, transport, handleEvent, eventFilters]);

	// Fetch function wrapper
	const fetch = useCallback(
		async (signal: AbortSignal) => {
			try {
				if (isInitialLoad) {
					setLoading(true);
				}
				setError(null);

				const result = await fetchFn(signal, filters);

				if (!signal.aborted && isMountedRef.current) {
					setData(result);
					setIsInitialLoad(false);
				}
			} catch (err) {
				if (!signal.aborted && isMountedRef.current) {
					const message = err instanceof Error ? err.message : 'Failed to load data';
					setError(message);
					console.error('[useReactiveData] Error:', err);
				}
			} finally {
				if (!signal.aborted && isMountedRef.current) {
					setLoading(false);
				}
			}
		},
		[fetchFn, filters, isInitialLoad]
	);

	// Initial fetch
	useAbortableEffect(
		async signal => {
			if (!enabled) return;
			await fetch(signal);
		},
		[enabled]
	);

	// Polling fallback (only when WS disconnected)
	useEffect(() => {
		if (!enabled || !pollInterval || pollInterval <= 0 || isInitialLoad || wsConnected) {
			return;
		}

		console.log('[useReactiveData] Starting polling (WebSocket disconnected)');
		const intervalId = setInterval(async () => {
			const controller = new AbortController();
			await fetch(controller.signal);
		}, pollInterval);

		return () => {
			console.log('[useReactiveData] Stopping polling');
			clearInterval(intervalId);
		};
	}, [enabled, pollInterval, isInitialLoad, wsConnected, fetch]);

	// Manual refresh
	const refresh = useCallback(async () => {
		const controller = new AbortController();
		await fetch(controller.signal);
	}, [fetch]);

	// Clear error
	const clearError = useCallback(() => {
		setError(null);
	}, []);

	// Track mounted state
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	return {
		data,
		loading,
		error,
		wsConnected,
		refresh,
		clearError,
	};
}
````

### Migration des Hooks

#### `useDashboard.ts` - APRÈS

```typescript
import { useReactiveData } from '@framework/hooks/useReactiveData';
import { B2F_DASHBOARD_UPDATED } from '@shared/transport';

import { dashboardService } from './DashboardService';

export function useDashboard(params?: UseDashboardParams) {
	const { pollInterval = 5000, enabled = true, useWebSocket = true } = params || {};

	return useReactiveData({
		enabled,
		eventType: B2F_DASHBOARD_UPDATED,
		useWebSocket,
		pollInterval,
		fetchFn: async () => dashboardService.getDashboard(),
	});
}
```

#### `useTasks.ts` - APRÈS

```typescript
import { useReactiveData } from '@framework/hooks/useReactiveData';
import { B2F_TASKS_UPDATED } from '@shared/transport';

import { tasksService } from './TasksService';

export function useTasks(params?: UseTasksParams) {
	const { enabled = true, pollInterval, filters, useWebSocket = true } = params || {};

	// Build server-side filters
	const eventFilters: Record<string, unknown> = {};
	if (filters?.workerId) eventFilters.workerId = filters.workerId;
	if (filters?.status) eventFilters.status = filters.status;
	if (filters?.priority) eventFilters.priority = filters.priority;

	return useReactiveData({
		enabled,
		eventType: B2F_TASKS_UPDATED,
		eventFilters: Object.keys(eventFilters).length > 0 ? eventFilters : undefined,
		useWebSocket,
		pollInterval,
		fetchFn: async (signal, f) => tasksService.getTasksData(f),
		filters,
	});
}
```

#### `useWorkers.ts` - APRÈS

```typescript
import { useReactiveData } from '@framework/hooks/useReactiveData';
import { B2F_WORKERS_UPDATED } from '@shared/transport';

import { workersService } from './WorkersService';

export function useWorkers(params?: UseWorkersParams) {
	const { enabled = true, pollInterval, useWebSocket = true } = params || {};

	return useReactiveData({
		enabled,
		eventType: B2F_WORKERS_UPDATED,
		useWebSocket,
		pollInterval,
		fetchFn: async () => workersService.getWorkers(),
	});
}
```

---

## Phase 2: Fix Backend - Utiliser OrchestratorWrapper au lieu de fetch

### Fichier: `packages/web-backend/src/services/TasksService.ts`

**AVANT** (lignes 50-95):

```typescript
async getTasksData(query?: TasksQuery): Promise<TasksData> {
	try {
		// ❌ MAUVAIS - fetch HTTP
		const orchestratorUrl = this.getOrchestratorUrl();
		const tasksUrl = this.buildTasksUrl(orchestratorUrl, query);
		const response = await fetch(tasksUrl);
		if (!response.ok) {
			throw new Error(`Orchestrator tasks API returned ${response.status}`);
		}
		const rawTasks = await response.json();
		// ...
	}
}
```

**APRÈS**:

```typescript
async getTasksData(query?: TasksQuery): Promise<TasksData> {
	try {
		// ✅ BON - OrchestratorRepository (library mode or HTTP)
		const rawTasks = await this.orchestratorRepository.getTasks();

		// Transform tasks to frontend format
		const tasks: Task[] = this.transformTasks(rawTasks);

		// Apply additional client-side filtering
		const filteredTasks = this.applyFilters(tasks, query);

		// Calculate summary statistics
		const summary = this.calculateSummary(filteredTasks);

		return {
			timestamp: new Date().toISOString(),
			summary,
			tasks: filteredTasks,
		};
	} catch (error) {
		console.error('[TasksService] Failed to fetch tasks:', error);
		return {
			timestamp: new Date().toISOString(),
			summary: { total: 0, byStatus: {}, byPriority: {} },
			tasks: [],
		};
	}
}
```

**Supprimer**:

- `getOrchestratorUrl()` (ligne 191-198)
- `buildTasksUrl()` (ligne 178-186)

### Fichier: `packages/web-backend/src/services/WorkersService.ts`

Même transformation (utiliser `orchestratorRepository` au lieu de `fetch`)

---

## Phase 3: Relier WS Déconnexion à ConnectivityContext

### Problème Actuel

- `WebSocketTransportClient` gère sa propre reconnexion (exponential backoff)
- `CircuitBreakerService` gère les erreurs REST (exponential backoff)
- Les deux ne communiquent pas

### Solution: Émettre Événements depuis WebSocketTransportClient

#### Fichier: `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`

**Ajouter** (après ligne 245):

```typescript
this.ws.onclose = () => {
	console.log('[WS] Connection closed');
	this.updateConnectionState('disconnected');
	this.tokenRefreshManager.stopAutoRefresh();

	// ✅ NOUVEAU - Émettre événement global pour ConnectivityContext
	window.dispatchEvent(new CustomEvent('ws:disconnected'));

	this.handleReconnect();
};
```

**Ajouter** (dans `connect()` après ligne 185):

```typescript
console.log(`[WS] Authenticated as user ${data.userId}`);

// ✅ NOUVEAU - Émettre événement global pour ConnectivityContext
window.dispatchEvent(new CustomEvent('ws:connected'));

// SECURITY: Start automatic token refresh
if (data.tokenExpiresAt) {
	this.tokenRefreshManager.startAutoRefresh(data.tokenExpiresAt);
}
```

**Ajouter** (dans `handleReconnect()` ligne 450):

```typescript
this.updateConnectionState('reconnecting');
this.reconnectAttempts++;

// ✅ NOUVEAU - Émettre événement global
window.dispatchEvent(
	new CustomEvent('ws:reconnecting', {
		detail: { attempt: this.reconnectAttempts, delay },
	})
);

// Exponential backoff...
```

#### Fichier: `packages/web-frontend/src/framework/features/connectivity/ConnectivityContext.tsx`

**Modifier** le `useEffect` pour écouter les événements WS:

```typescript
useEffect(() => {
	// Écouter les événements WebSocket
	const handleWsConnected = () => {
		console.log('[ConnectivityContext] WebSocket connected');
		setStatus('connected');
		setRetryIn(0);
	};

	const handleWsDisconnected = () => {
		console.log('[ConnectivityContext] WebSocket disconnected');
		setStatus('disconnected');
	};

	const handleWsReconnecting = (event: CustomEvent) => {
		console.log('[ConnectivityContext] WebSocket reconnecting', event.detail);
		setStatus('degraded');
	};

	window.addEventListener('ws:connected', handleWsConnected);
	window.addEventListener('ws:disconnected', handleWsDisconnected);
	window.addEventListener('ws:reconnecting', handleWsReconnecting as EventListener);

	// Subscribe to circuit breaker state changes (REST)
	const unsubscribe = circuitBreakerService.subscribe(state => {
		// Map circuit state to connectivity status (only if not WS)
		// Circuit breaker only affects REST calls, not WebSocket
		switch (state) {
			case CircuitState.CLOSED:
				// Ne pas override si WS est connecté
				break;
			case CircuitState.HALF_OPEN:
				setStatus('degraded');
				break;
			case CircuitState.OPEN:
				setStatus('disconnected');
				break;
		}

		setQueueSize(circuitBreakerService.getState().queueSize);
	});

	return () => {
		window.removeEventListener('ws:connected', handleWsConnected);
		window.removeEventListener('ws:disconnected', handleWsDisconnected);
		window.removeEventListener('ws:reconnecting', handleWsReconnecting as EventListener);
		unsubscribe();
	};
}, [circuitBreakerService]);
```

---

## Phase 4: Indicateur Visuel Mode de Connexion

### Créer Composant: `packages/web-frontend/src/app/components/connectivity/ConnectionModeIndicator.tsx`

```typescript
import { useTransport } from '@/transport';
import { useConnectivity } from '@framework/features/connectivity/ConnectivityContext';

export function ConnectionModeIndicator() {
	const transport = useTransport();
	const { status } = useConnectivity();
	const wsConnected = transport.isConnected();

	// Determine display
	let badge = '🔌 REST';
	let color = 'bg-yellow-500';
	let description = 'Polling mode';

	if (wsConnected) {
		badge = '⚡ WebSocket (3030)';
		color = 'bg-green-500';
		description = 'Real-time updates';
	} else if (status === 'disconnected') {
		badge = '❌ Disconnected';
		color = 'bg-red-500';
		description = 'Reconnecting...';
	} else if (status === 'degraded') {
		badge = '🔄 Reconnecting';
		color = 'bg-orange-500';
		description = 'Attempting to reconnect';
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

### Ajouter au Header/Layout

```typescript
import { ConnectionModeIndicator } from '@app/components/connectivity/ConnectionModeIndicator';

// Dans le header
<header className="flex items-center justify-between">
	<h1>Dashboard</h1>
	<ConnectionModeIndicator />
</header>
```

---

## Ordre d'Exécution

1. ✅ Créer `useReactiveData` hook générique
2. ✅ Migrer `useDashboard` vers `useReactiveData`
3. ✅ Migrer `useTasks` vers `useReactiveData`
4. ✅ Migrer `useWorkers` vers `useReactiveData`
5. ✅ Fix `TasksService` - utiliser `orchestratorRepository` au lieu de `fetch`
6. ✅ Fix `WorkersService` - utiliser `orchestratorRepository`
7. ✅ Supprimer méthodes obsolètes (getOrchestratorUrl, buildTasksUrl)
8. ✅ Émettre événements WS dans `WebSocketTransportClient`
9. ✅ Écouter événements WS dans `ConnectivityContext`
10. ✅ Créer `ConnectionModeIndicator` component
11. ✅ Ajouter indicateur au header
12. ✅ Tester: Déconnecter backend → Indicateur passe en "Reconnecting"
13. ✅ Tester: Reconnecter backend → Indicateur passe en "WebSocket (3030)"
14. ✅ Run checks

---

## Bénéfices

✅ **Code DRY**: Pattern polling/WS centralisé dans `useReactiveData`
✅ **Performance**: Backend utilise OrchestratorWrapper (library mode, pas de HTTP)
✅ **UX Cohérente**: Indicateur unique pour REST + WS
✅ **Debugging**: Indicateur visuel du mode de connexion actuel
✅ **Maintenabilité**: Un seul endroit à modifier pour le pattern réactif

---

## Tests à Effectuer

1. **Initial Load**: Vérifier que data charge correctement
2. **WebSocket Updates**: Créer task → Dashboard/Tasks se mettent à jour
3. **Déconnexion Backend**: Arrêter backend → Indicateur passe en "Reconnecting"
4. **Reconnexion**: Relancer backend → Indicateur passe en "WebSocket"
5. **Polling Fallback**: Pendant déconnexion, vérifier que polling fonctionne
6. **Performance**: Vérifier qu'il n'y a plus d'appels HTTP inutiles en library mode
