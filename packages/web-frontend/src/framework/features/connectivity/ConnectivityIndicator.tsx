import type { ReactNode } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { RefreshCw, Wifi, WifiLow, WifiOff } from 'lucide-react';

import { type ConnectivityStatus, useConnectivity } from './ConnectivityContext';

/**
 * Connectivity Indicator - Discrete UI Component
 *
 * Displays connection status with backend:
 * - Connected: Green badge (hidden by default, optional visibility)
 * - Degraded: Yellow badge with retry countdown
 * - Disconnected: Red badge with retry countdown and queue size
 */

interface ConnectivityIndicatorProps {
	showWhenConnected?: boolean; // Show green badge when connected (default: false)
	className?: string;
}

export function ConnectivityIndicator({ showWhenConnected = false, className }: ConnectivityIndicatorProps) {
	const { status, retryIn, queueSize, forceRetry } = useConnectivity();

	// Hide when connected (unless showWhenConnected is true)
	if (status === 'connected' && !showWhenConnected) {
		return null;
	}

	// Format retry time
	const formatRetryTime = (ms: number): string => {
		if (ms < 1000) return '<1s';
		const seconds = Math.ceil(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		return `${minutes}m`;
	};

	// Status icons mapped to Lucide components
	const icons: Record<ConnectivityStatus, ReactNode> = {
		connected: <Wifi className="size-3" aria-hidden="true" />,
		degraded: <WifiLow className="size-3" aria-hidden="true" />,
		disconnected: <WifiOff className="size-3" aria-hidden="true" />,
	};

	// Badge variants
	const badgeVariants: Record<ConnectivityStatus, 'default' | 'secondary' | 'destructive'> = {
		connected: 'default',
		degraded: 'secondary',
		disconnected: 'destructive',
	};

	return (
		<Badge variant={badgeVariants[status]} className={cn('gap-1', className)}>
			{icons[status]}
			{status === 'connected' && <span>Connected</span>}
			{status === 'degraded' && (
				<>
					<span>Reconnecting</span>
					{retryIn > 0 && <span className="text-xs opacity-75">({formatRetryTime(retryIn)})</span>}
				</>
			)}
			{status === 'disconnected' && (
				<>
					<span>Offline</span>
					<span className="text-xs opacity-75">(retry in {formatRetryTime(retryIn)})</span>
					{queueSize > 0 && (
						<span className="ml-1 rounded-full bg-current/20 px-1.5 py-0.5 text-xs">{queueSize}</span>
					)}
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={e => {
							e.stopPropagation();
							forceRetry();
						}}
						className={`
        ml-1 cursor-pointer transition-opacity
        hover:opacity-70
      `}
						title="Retry now"
						aria-label="Retry connection now"
					>
						<RefreshCw className="size-3" aria-hidden="true" />
					</Button>
				</>
			)}
		</Badge>
	);
}
