import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ConnectionState } from '@shared/transport';

import type { ITransportClient } from './ITransportClient';
import { TransportManager, type TransportMode } from './TransportManager';
import { WebSocketTransportClient } from './adapters/WebSocketTransportClient';

/**
 * Transport Context State
 *
 * Provides access to the transport client and connection state throughout the app.
 */
export interface TransportContextState {
	/**
	 * Transport client instance (WebSocket, REST, or Mock)
	 */
	transport: ITransportClient | null;

	/**
	 * Current connection state
	 */
	connectionState: ConnectionState;

	/**
	 * Whether transport is connected and ready
	 */
	isConnected: boolean;

	/**
	 * Port number being used for the connection
	 */
	port: number;

	/**
	 * Force manual downgrade to REST polling
	 * Stops WebSocket reconnection attempts
	 */
	forceDowngrade: () => void;

	/**
	 * Next reconnection delay in seconds (0 if not reconnecting)
	 */
	reconnectDelay: number;

	/**
	 * Switch to a different transport mode dynamically (without page reload)
	 * Disconnects current transport and connects new one
	 */
	switchTransport: (mode: TransportMode) => Promise<void>;

	/**
	 * Connection ID - Unique identifier for this browser/tab
	 * Used to correlate requests and prevent broadcast echo
	 * Generated once per browser/tab and persisted in localStorage
	 */
	connId: string;

	/**
	 * Active subscriptions - Event types that have handlers registered locally
	 * Updates in real-time when components subscribe/unsubscribe
	 */
	subscriptions: string[];
}

/**
 * Transport Context
 *
 * React context for providing transport client to the component tree.
 */
const TransportContext = createContext<TransportContextState | undefined>(undefined);

/**
 * Extract port number from URL
 * @param url - URL to extract port from
 * @returns Port number (defaults to 80 for http, 443 for https, 3030 for ws/wss if not specified)
 */
function extractPort(url: string): number {
	try {
		const urlObj = new URL(url);
		if (urlObj.port) {
			return parseInt(urlObj.port, 10);
		}

		// Default ports based on protocol
		switch (urlObj.protocol) {
			case 'http:':
			case 'ws:':
				return 80;
			case 'https:':
			case 'wss:':
				return 443;
			default:
				return 3030; // Fallback
		}
	} catch (error) {
		console.warn('[TransportProvider] Failed to extract port from URL:', url, error);
		return 3030; // Fallback
	}
}

/**
 * Transport Provider Props
 */
export interface TransportProviderProps {
	/**
	 * Child components that will have access to transport
	 */
	children: React.ReactNode;

	/**
	 * Base URL for the backend API
	 * @default window.location.origin
	 */
	baseUrl?: string;

	/**
	 * WebSocket URL (if different from baseUrl)
	 * @default baseUrl.replace('http', 'ws')
	 */
	wsUrl?: string;

	/**
	 * Whether to automatically connect on mount
	 * @default true
	 */
	autoConnect?: boolean;

	/**
	 * Transport client instance (for testing/custom implementations)
	 * If not provided, creates WebSocketTransportClient
	 */
	transport?: ITransportClient;
}

/**
 * Transport Provider Component
 *
 * Provides transport client to the application and manages connection lifecycle.
 *
 * Features:
 * - Creates WebSocketTransportClient automatically
 * - Connects on mount (if autoConnect=true)
 * - Handles auth events (auth:failed, auth:token_expired, auth:refresh_failed)
 * - Redirects to /login on auth failure
 * - Tracks connection state
 * - Cleans up on unmount
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <TransportProvider baseUrl="http://localhost:3000">
 *       <YourApp />
 *     </TransportProvider>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With custom transport (for testing)
 * const mockTransport = new MockTransportClient();
 * function TestApp() {
 *   return (
 *     <TransportProvider transport={mockTransport}>
 *       <YourApp />
 *     </TransportProvider>
 *   );
 * }
 * ```
 */
export function TransportProvider({
	children,
	baseUrl = window.location.origin,
	wsUrl,
	autoConnect = true,
	transport: customTransport,
}: TransportProviderProps) {
	const navigate = useNavigate();

	// Initialize TransportManager singleton
	// This happens on every render but getInstance() returns same instance (singleton pattern)
	const transportManager = useMemo(() => {
		// Read transport mode preference from localStorage
		const savedMode = localStorage.getItem('transport_mode') as TransportMode;
		const mode: TransportMode = savedMode || 'auto';

		return TransportManager.getInstance({
			mode,
			baseUrl,
			wsUrl: wsUrl || baseUrl.replace(/^http/, 'ws'),
			customTransport,
		});
	}, [baseUrl, wsUrl, customTransport]);

	// Get transport and connId from manager
	const transport = transportManager.getTransport();
	const connId = transportManager.getConnId();

	const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
	const [subscriptions, setSubscriptions] = useState<string[]>([]);

	/**
	 * Update subscriptions from transport
	 * Called periodically and when subscriptions might have changed
	 */
	const updateSubscriptions = useCallback(() => {
		const currentSubscriptions = transport.getLocalSubscriptions();
		setSubscriptions(currentSubscriptions);
	}, [transport]);

	/**
	 * Switch transport mode dynamically without page reload
	 */
	const switchTransport = useCallback(
		async (mode: TransportMode) => {
			console.log('[TransportProvider] Switching transport to:', mode);

			// Don't switch if using custom transport
			if (customTransport) {
				console.warn('[TransportProvider] Cannot switch transport when using custom transport');
				return;
			}

			// Save preference
			localStorage.setItem('transport_mode', mode);

			// Disconnect current transport (will be recreated by getInstance on next render)
			console.log('[TransportProvider] Disconnecting current transport');
			await transportManager.disconnect();

			// Get new transport manager with new mode
			// This will detect config change and create new transport
			TransportManager.getInstance({
				mode,
				baseUrl,
				wsUrl: wsUrl || baseUrl.replace(/^http/, 'ws'),
				customTransport,
			});

			console.log('[TransportProvider] Transport switched successfully, will auto-connect on next render');

			// Force re-render by triggering connection state change
			setConnectionState('disconnected');
		},
		[transportManager, baseUrl, wsUrl, customTransport]
	);

	// Extract port from wsUrl or baseUrl
	const port = extractPort(wsUrl || baseUrl);

	/**
	 * Force manual downgrade to REST polling
	 */
	const handleForceDowngrade = useCallback(() => {
		// Check if forceDowngrade method exists
		if ('forceDowngrade' in transport && typeof transport.forceDowngrade === 'function') {
			transport.forceDowngrade();
		} else {
			console.warn('[TransportProvider] forceDowngrade not supported by current transport');
		}
	}, [transport]);

	/**
	 * Handle authentication failures
	 */
	const handleAuthFailed = useCallback(() => {
		console.error('[TransportProvider] Authentication failed, redirecting to login');
		navigate('/login', { replace: true });
	}, [navigate]);

	const handleTokenExpired = useCallback(() => {
		console.error('[TransportProvider] Token expired, redirecting to login');
		navigate('/login', { replace: true });
	}, [navigate]);

	const handleRefreshFailed = useCallback(() => {
		console.error('[TransportProvider] Token refresh failed, redirecting to login');
		navigate('/login', { replace: true });
	}, [navigate]);

	/**
	 * Initialize transport and set up listeners
	 *
	 * IMPORTANT: We do NOT call disconnect() in cleanup!
	 * The singleton persists across React remounts (StrictMode).
	 * We only unsubscribe event listeners.
	 */
	useEffect(() => {
		// Subscribe to connection state changes
		const unsubscribeConnectionState = transport.onConnectionStateChange((state: ConnectionState) => {
			console.log('[TransportProvider] Connection state:', state);
			setConnectionState(state);
		});

		// Listen for auth events on window
		window.addEventListener('auth:failed', handleAuthFailed);
		window.addEventListener('auth:token_expired', handleTokenExpired);
		window.addEventListener('auth:refresh_failed', handleRefreshFailed);

		// Auto-connect if enabled
		if (autoConnect) {
			transportManager
				.connect()
				.then(() => {
					console.log('[TransportProvider] Connected successfully');
				})
				.catch(error => {
					console.error('[TransportProvider] Connection failed:', error);
				});
		}

		// Cleanup on unmount
		// CRITICAL: We do NOT call disconnect() here!
		// The singleton persists across React remounts.
		// Only cleanup: unsubscribe listeners
		return () => {
			console.log('[TransportProvider] Cleaning up listeners (NOT disconnecting - singleton persists)');
			unsubscribeConnectionState();
			window.removeEventListener('auth:failed', handleAuthFailed);
			window.removeEventListener('auth:token_expired', handleTokenExpired);
			window.removeEventListener('auth:refresh_failed', handleRefreshFailed);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [transport, autoConnect, transportManager]);

	/**
	 * Poll subscriptions periodically to detect changes
	 *
	 * This is necessary because subscribe/unsubscribe calls don't have
	 * a built-in notification mechanism. We poll every 500ms to detect
	 * when components add or remove subscriptions.
	 */
	useEffect(() => {
		// Initial update
		updateSubscriptions();

		// Poll every 500ms
		const interval = setInterval(updateSubscriptions, 500);

		return () => {
			clearInterval(interval);
		};
	}, [updateSubscriptions]);

	// Get reconnect delay if transport supports it
	const reconnectDelay = transport instanceof WebSocketTransportClient ? transport.getReconnectDelay() : 0;

	const contextValue: TransportContextState = {
		transport,
		connectionState,
		isConnected: connectionState === 'connected',
		port,
		forceDowngrade: handleForceDowngrade,
		reconnectDelay,
		switchTransport,
		connId,
		subscriptions,
	};

	return <TransportContext.Provider value={contextValue}>{children}</TransportContext.Provider>;
}

/**
 * Hook to access Transport Context
 *
 * Internal hook for accessing transport context. Use `useTransport()` instead
 * for component usage.
 *
 * @throws Error if used outside TransportProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { transport, isConnected } = useTransportContext();
 *
 *   if (!isConnected) {
 *     return <div>Connecting...</div>;
 *   }
 *
 *   return <div>Connected!</div>;
 * }
 * ```
 */
export function useTransportContext(): TransportContextState {
	const context = useContext(TransportContext);

	if (context === undefined) {
		throw new Error('useTransportContext must be used within TransportProvider');
	}

	return context;
}
