# Analyse Complète: Auto Reconnect/Retry du Frontend

**Timestamp:** 2025-12-23_19-02  
**Auteur:** Analysis  
**Status:** Complet

## Résumé Exécutif

Le frontend possède **DEUX stratégies de reconnexion** actuelles (une troisième legacy est unused):

1. **WebSocketTransportClient** - Reconnexion WebSocket directe vers backend
2. **CircuitBreakerService** - Health checks avec exponential backoff pour requêtes REST

### Bug Identifié

Le widget de connectivité affiche un compte à rebours qui va de **30s jusqu'à 14-15s puis s'arrête/saute**, au lieu de compter jusqu'à 0s.

**Cause:** Le `nextRetryTime` est remis à `null` pendant le health check (état HALF_OPEN), ce qui fait disparaître le compte à rebours pendant ~5s (duration du health check timeout).

---

## 1. WebSocketTransportClient

### Fichier

`packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`

### Configuration

- **Délai initial:** 1000ms (1s)
- **Facteur backoff:** 2 (exponentiel)
- **Délai max:** 30000ms (30s)
- **Max tentatives:** 10 (par défaut)

### Logique de Reconnexion (ligne 407-433)

```typescript
private handleReconnect(): void {
    if (!this.config.reconnect) {
        return;
    }

    if (this.reconnectAttempts >= (this.config.reconnectMaxAttempts || 10)) {
        console.error('[WS] Max reconnection attempts reached');
        this.updateConnectionState('error');
        return;
    }

    this.updateConnectionState('reconnecting');
    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
    const delay = Math.min(
        (this.config.reconnectDelay || 1000) * Math.pow(2, this.reconnectAttempts - 1),
        30000
    );

    console.log(`[WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
        this.connect().catch(err => {
            console.error('[WS] Reconnection failed', err);
        });
    }, delay);
}
```

### Progression des délais

- Tentative 1: 1s (1000 × 2^0)
- Tentative 2: 2s (1000 × 2^1)
- Tentative 3: 4s (1000 × 2^2)
- Tentative 4: 8s (1000 × 2^3)
- Tentative 5: 16s (1000 × 2^4)
- Tentative 6+: 30s (capped)

### Reset du compteur

**Ligne 180** - Succès de connexion:

```typescript
this.reconnectAttempts = 0;
```

---

## 2. CircuitBreakerService

### Fichier

`packages/web-frontend/src/framework/features/connectivity/CircuitBreakerService.ts`

### Configuration par défaut (ligne 233-237)

```typescript
this.INITIAL_DELAY = config.initialDelay ?? 1000; // 1s
this.MAX_DELAY = config.maxDelay ?? 30000; // 30s
this.BACKOFF_FACTOR = config.backoffFactor ?? 2; // 2x
this.FAILURE_THRESHOLD = config.failureThreshold ?? 3; // 3 erreurs consécutives
this.HEALTH_CHECK_TIMEOUT = config.healthCheckTimeout ?? 5000; // 5s timeout
```

### États du Circuit

```typescript
enum CircuitState {
	CLOSED = 'CLOSED', // Fonctionnement normal
	OPEN = 'OPEN', // Backend inaccessible, requêtes en queue
	HALF_OPEN = 'HALF_OPEN', // En test de récupération
}
```

### Transitions d'État

**CLOSED → OPEN (ligne 354-362):**

```typescript
private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.currentDelay = this.INITIAL_DELAY;  // Réinitialise à 1s
    this.nextRetryTime = this.scheduler.now() + this.currentDelay;
    this.notifyListeners();
    this.startHealthCheck();
}
```

**Condition d'ouverture (ligne 331-338, 345-349):**

```typescript
private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = this.scheduler.now();

    if (this.failureCount >= this.FAILURE_THRESHOLD) {
        this.openCircuit();  // Open après 3 erreurs 5xx
    }
}

private onNetworkError(): void {
    this.failureCount = this.FAILURE_THRESHOLD;  // Force open immédiatement
    this.lastFailureTime = this.scheduler.now();
    this.openCircuit();
}
```

### Health Check (ligne 390-433)

**🔴 BUG POINT 1 - nextRetryTime = null pendant HALF_OPEN (ligne 397):**

```typescript
private performHealthCheck(delayMs?: number): void {
    const delay = delayMs ?? this.currentDelay;
    this.healthCheckTimerId = this.scheduler.schedule(async () => {
        this.state = CircuitState.HALF_OPEN;
        // ⚠️ PROBLÈME: nextRetryTime cleared, le UI perd le compte à rebours
        this.nextRetryTime = null;
        this.notifyListeners();

        try {
            const controller = new AbortController();
            // ⚠️ PROBLÈME: 5000ms timeout disparaît du UI
            const timeoutId = this.scheduler.schedule(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT);

            const url = `${this.HEALTH_CHECK_ENDPOINT}?_t=${Date.now()}`;
            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                cache: 'no-cache',
            });

            this.scheduler.cancel(timeoutId);

            if (response.ok) {
                this.closeCircuit();  // Récupération réussie
            } else {
                // Échec du health check: augmente le délai
                this.increaseDelay();
                this.state = CircuitState.OPEN;
                this.nextRetryTime = this.scheduler.now() + this.currentDelay;
                this.notifyListeners();
                this.scheduleNextHealthCheck();
            }
        } catch {
            // Même traitement en cas d'erreur
            this.increaseDelay();
            this.state = CircuitState.OPEN;
            this.nextRetryTime = this.scheduler.now() + this.currentDelay;
            this.notifyListeners();
            this.scheduleNextHealthCheck();
        }
    }, delay);
}
```

### Augmentation du délai (ligne 456-458)

```typescript
private increaseDelay(): void {
    this.currentDelay = Math.min(
        this.currentDelay * this.BACKOFF_FACTOR,  // 2x
        this.MAX_DELAY  // 30000ms max
    );
}
```

### Progression des délais

- Tentative 1: 1s
- Tentative 2: 2s
- Tentative 3: 4s
- Tentative 4: 8s
- Tentative 5: 16s
- Tentative 6+: 30s (capped)

### Reset du délai (ligne 367-377)

```typescript
private closeCircuit(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.currentDelay = this.INITIAL_DELAY;  // Réinitialise à 1s
    this.nextRetryTime = null;
    this.stopHealthCheck();
    this.notifyListeners();
    this.flushQueue();  // Flush les requêtes en attente
}
```

---

## 3. Affichage du Compte à Rebours

### ConnectivityContext (ligne 60-105)

```typescript
useEffect(() => {
	// Update retryIn countdown every second
	const updateCountdown = () => {
		const state = circuitBreakerService.getState();
		if (state.nextRetryTime !== null) {
			// ⚠️ PROBLÈME: Calcule le temps restant basé sur nextRetryTime
			const remaining = Math.max(0, state.nextRetryTime - Date.now());
			setRetryIn(remaining);
		} else {
			setRetryIn(0); // nextRetryTime = null → affiche 0
		}
	};

	const unsubscribe = circuitBreakerService.subscribe(state => {
		switch (state) {
			case CircuitState.CLOSED:
				setStatus('connected');
				setRetryIn(0);
				break;
			case CircuitState.HALF_OPEN:
				setStatus('degraded');
				updateCountdown(); // ← nextRetryTime est null ici!
				break;
			case CircuitState.OPEN:
				setStatus('disconnected');
				updateCountdown();
				break;
		}
		setQueueSize(circuitBreakerService.getState().queueSize);
	});

	// Update countdown every second when disconnected/degraded
	const intervalId = setInterval(() => {
		if (status !== 'connected') {
			updateCountdown();
		}
	}, 1000);

	return () => {
		unsubscribe();
		clearInterval(intervalId);
	};
}, [status, circuitBreakerService]);
```

### ConnectivityIndicator (ligne 29-35)

```typescript
const formatRetryTime = (ms: number): string => {
	if (ms < 1000) return '<1s';
	const seconds = Math.ceil(ms / 1000); // Arrondit vers le haut
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m`;
};
```

**Rendu (ligne 57-70):**

```tsx
{status === 'degraded' && (
    <>
        <span>Reconnecting</span>
        {retryIn > 0 && <span className="text-xs opacity-75">({formatRetryTime(retryIn)})</span>}
    </>
)}
{status === 'disconnected' && (
    <>
        <span>Offline</span>
        <span className="text-xs opacity-75">(retry in {formatRetryTime(retryIn)})</span>}
        {queueSize > 0 && <span className="ml-1 ...">queueSize</span>}
        <button onClick={forceRetry}>↻</button>
    </>
)}
```

---

## 🔴 Bug Analysis: Pourquoi 30s → 14-15s?

### Timeline complète

```
T=0s    : Circuit OPEN
         nextRetryTime = now() + 30000ms
         State OPEN → UI affiche "Offline (retry in 30s)"

T=1s    : updateCountdown() → affiche 29s
T=2s    : updateCountdown() → affiche 28s
...
T=25s   : updateCountdown() → affiche 5s

T=30s   : performHealthCheck() appelé
         State = HALF_OPEN
         nextRetryTime = null  ⚠️ BUG: UI perd le compte à rebours
         Fetch /api/health lancé

T=30-35s: Health check en cours
         - AbortController timeout = 5000ms
         - Network latency + processing
         - État reste HALF_OPEN
         - nextRetryTime reste null

T=35s   : Health check timeout ou erreur
         increaseDelay() → currentDelay = 2s
         State = OPEN
         nextRetryTime = now() + 2000ms  ← Réappears avec 2s!
         UI affiche "Offline (retry in 2s)"

T=36s   : updateCountdown() → affiche 1s
T=37s   : updateCountdown() → affiche 0s
```

### Calcul du délai perdu

```
Délai visible initial: 30s
Temps avant nextRetryTime = null: ~30s (OPEN)
+ Duration du health check: ~5-7s (HALF_OPEN, nextRetryTime=null)
= Temps perdu: ~5-7s

Délai visible après reprendre: 2s (nouvelle tentative)
Total visible: 30s + 2s = 32s attendu
Mais observer: 30s → ~5s (perdu) → 2s → 0s = 27s observé

D'où l'observation: 30s → [disparaît pendant 5s] → reparaît à ~2-3s → 0s
Apparence: "30s compte jusqu'à 14-15s, puis saute à 2-3s"
```

### Démonstration du bug

1. **État initial:** nextRetryTime = now() + 30000
    - nextRetryTime - Date.now() = 30000 → affiche "30s" ✓

2. **À T=25s:** nextRetryTime - Date.now() = 5000 → affiche "5s" ✓

3. **À T=30s (health check lancé):**
    - State = HALF_OPEN
    - nextRetryTime = null
    - remaining = Math.max(0, null - Date.now()) → retryIn = 0
    - Affiche rien ou "" ❌

4. **À T=35s (health check échoue):**
    - increaseDelay() → currentDelay = 2000
    - nextRetryTime = Date.now() + 2000
    - remaining = 2000 → affiche "2s"
    - **Saut visible:** de "5s" à "2s" (14-15s disparus)

---

## Code Legacy (Unused)

### useOrchestratorWebSocket Hook

**Fichier:** `packages/web-frontend/src/app/hooks/useOrchestratorWebSocket.ts`

**Status:** ⚠️ **NON UTILISÉ** - Aucune utilisation dans le codebase actuel

**Facteur Backoff:** 1.5 (NOT 2x, exponentiel)
**Progression:** 1s → 1.5s → 2.25s → 3.4s → 5.1s → 7.6s → 11.4s → 17.1s → 30s

Noté pour documentation, mais peut être supprimé selon la stratégie de cleanup.

---

## Résumé des Timing

| Métrique            | WebSocketTransportClient | CircuitBreakerService                |
| ------------------- | ------------------------ | ------------------------------------ |
| **Délai Initial**   | 1000ms                   | 1000ms                               |
| **Facteur Backoff** | 2x                       | 2x (configurable)                    |
| **Délai Max**       | 30000ms                  | 30000ms                              |
| **Progression**     | 1s, 2s, 4s, 8s, 16s, 30s | 1s, 2s, 4s, 8s, 16s, 30s             |
| **Trigger**         | WebSocket close          | 3x 5xx errors ou network error       |
| **Reset**           | Connexion réussie        | Requête réussie                      |
| **Bug**             | Aucun                    | nextRetryTime=null pendant HALF_OPEN |

---

## Recommandations

### À Court Terme (Bug Fix)

1. **Garder nextRetryTime pendant HALF_OPEN:** Afficher le temps d'attente du health check
    - Avant: `this.nextRetryTime = null` (ligne 397)
    - Après: Calculer nextRetryTime = now() + HEALTH_CHECK_TIMEOUT

2. **Ajouter un flag HALF_OPEN au UI:** Pour distinguer "Reconnecting" de "Offline"

### À Long Terme (Cleanup)

1. Supprimer le code legacy `useOrchestratorWebSocket` si plus utilisé
2. Documenter la stratégie d'exponential backoff
3. Rendre le BACKOFF_FACTOR configurable (actuellement hardcodé à 2)

---

## Fichiers de Référence

### Reconnexion WebSocket

- **Principale:** `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts:423-426`
- **Reset:** `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts:180`
- **Tests:** `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.test.ts`

### Circuit Breaker Health Checks

- **Config:** `packages/web-frontend/src/framework/features/connectivity/CircuitBreakerService.ts:233-237`
- **Open Circuit:** `packages/web-frontend/src/framework/features/connectivity/CircuitBreakerService.ts:354-362`
- **Health Check:** `packages/web-frontend/src/framework/features/connectivity/CircuitBreakerService.ts:390-433` ⚠️ **Bug point**
- **Backoff:** `packages/web-frontend/src/framework/features/connectivity/CircuitBreakerService.ts:456-458`
- **Tests:** `packages/web-frontend/src/framework/features/connectivity/CircuitBreakerService.test.ts:239-327`

### UI Display

- **Context:** `packages/web-frontend/src/framework/features/connectivity/ConnectivityContext.tsx:60-105` ⚠️ **Bug point**
- **Widget:** `packages/web-frontend/src/framework/features/connectivity/ConnectivityIndicator.tsx:29-35`
- **Initialization:** `packages/web-frontend/src/app/services.ts:17-19`

### Legacy (Unused)

- **Hook:** `packages/web-frontend/src/app/hooks/useOrchestratorWebSocket.ts:39-62, 128-150`
