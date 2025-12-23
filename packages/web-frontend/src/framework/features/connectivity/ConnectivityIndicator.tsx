import { Badge } from '@framework/components/primitives/Badge';
import { cn } from '@framework/lib/utils';

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

	// Status icons
	const icons: Record<ConnectivityStatus, string> = {
		connected: '●',
		degraded: '◐',
		disconnected: '○',
	};

	// Badge variants
	const badgeVariants: Record<ConnectivityStatus, 'default' | 'secondary' | 'destructive'> = {
		connected: 'default',
		degraded: 'secondary',
		disconnected: 'destructive',
	};

	return (
		<Badge variant={badgeVariants[status]} className={cn('gap-1', className)}>
			<span className="text-sm" aria-hidden="true">
				{icons[status]}
			</span>
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
					{/* eslint-disable-next-line no-restricted-syntax */}
					<button
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
						↻
					</button>
				</>
			)}
		</Badge>
	);
}
