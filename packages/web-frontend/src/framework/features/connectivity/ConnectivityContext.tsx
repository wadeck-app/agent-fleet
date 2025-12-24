import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

import { CircuitBreakerServiceClass, CircuitState } from './CircuitBreakerService';

/**
 * Connectivity status for UI display
 */
export type ConnectivityStatus = 'connected' | 'degraded' | 'disconnected';

/**
 * Connectivity context value
 */
interface ConnectivityContextValue {
	status: ConnectivityStatus;
	retryIn: number; // milliseconds until next retry
	queueSize: number; // number of queued requests
	forceRetry: () => void; // manually trigger reconnection attempt
}

const ConnectivityContext = createContext<ConnectivityContextValue | undefined>(undefined);

/**
 * Props for ConnectivityProvider
 */
interface ConnectivityProviderProps {
	children: ReactNode;
	/**
	 * Circuit breaker service instance (required for dependency injection)
	 */
	circuitBreakerService: CircuitBreakerServiceClass;
}

/**
 * Connectivity Provider
 *
 * Bridges the circuit breaker service state to React components.
 * Maps circuit breaker states to user-friendly connectivity status.
 *
 * Requires a CircuitBreakerService instance to be passed as a prop for dependency injection.
 *
 * @example
 * ```tsx
 * import { ConnectivityProvider, createCircuitBreaker } from '@framework/features/connectivity';
 * import { getApiBaseUrl } from './utils/apiConfig';
 *
 * const circuitBreaker = createCircuitBreaker({
 *   healthCheckEndpoint: `${getApiBaseUrl()}/health`
 * });
 *
 * <ConnectivityProvider circuitBreakerService={circuitBreaker}>
 *   <App />
 * </ConnectivityProvider>
 * ```
 */
export function ConnectivityProvider({ children, circuitBreakerService }: ConnectivityProviderProps) {
	const [status, setStatus] = useState<ConnectivityStatus>('connected');
	const [retryIn, setRetryIn] = useState<number>(0);
	const [queueSize, setQueueSize] = useState<number>(0);

	useEffect(() => {
		// Update retryIn countdown every second
		const updateCountdown = () => {
			const state = circuitBreakerService.getState();
			if (state.nextRetryTime !== null) {
				const remaining = Math.max(0, state.nextRetryTime - Date.now());
				setRetryIn(remaining);
			} else {
				setRetryIn(0);
			}
		};

		// Subscribe to circuit breaker state changes
		const unsubscribe = circuitBreakerService.subscribe(state => {
			// Map circuit state to connectivity status
			switch (state) {
				case CircuitState.CLOSED:
					setStatus('connected');
					setRetryIn(0);
					break;
				case CircuitState.HALF_OPEN:
					setStatus('degraded');
					updateCountdown();
					break;
				case CircuitState.OPEN:
					setStatus('disconnected');
					updateCountdown();
					break;
			}

			// Update queue size
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

	// Force retry handler
	const forceRetry = () => {
		circuitBreakerService.forceRetry();
	};

	return (
		<ConnectivityContext.Provider value={{ status, retryIn, queueSize, forceRetry }}>
			{children}
		</ConnectivityContext.Provider>
	);
}

/**
 * Hook to access connectivity state
 */
export function useConnectivity() {
	const context = useContext(ConnectivityContext);
	if (!context) {
		throw new Error('useConnectivity must be used within ConnectivityProvider');
	}
	return context;
}
