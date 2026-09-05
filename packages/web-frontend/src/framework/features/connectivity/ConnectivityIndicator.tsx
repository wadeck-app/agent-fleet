import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';

import { type ConnectivityStatus, useConnectivity } from './ConnectivityContext';

/
  Connectivity Indicator - Discrete UI Component
 
  Displays connection status with backend:
  - Connected: Green badge (hidden by default, optional visibility)
  - Degraded: Yellow badge with retry countdown
  - Disconnected: Red badge with retry countdown and queue size
 /

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
		if (ms < ) return '<s';
		const seconds = Math.ceil(ms / );
		if (seconds < ) return `${seconds}s`;
		const minutes = Math.floor(seconds / );
		return `${minutes}m`;
	};

	// Status icons
	const icons: Record<ConnectivityStatus, string> = {
		connected: '',
		degraded: '',
		disconnected: '',
	};

	// Badge variants
	const badgeVariants: Record<ConnectivityStatus, 'default' | 'secondary' | 'destructive'> = {
		connected: 'default',
		degraded: 'secondary',
		disconnected: 'destructive',
	};

	return (
		<Badge variant={badgeVariants[status]} className={cn('gap-', className)}>
			<span className="text-sm" aria-hidden="true">
				{icons[status]}
			</span>
			{status === 'connected' && <span>Connected</span>}
			{status === 'degraded' && (
				<>
					<span>Reconnecting</span>
					{retryIn >  && <span className="text-xs opacity-">({formatRetryTime(retryIn)})</span>}
				</>
			)}
			{status === 'disconnected' && (
				<>
					<span>Offline</span>
					<span className="text-xs opacity-">(retry in {formatRetryTime(retryIn)})</span>
					{queueSize >  && (
						<span className="ml- rounded-full bg-current/ px-. py-. text-xs">{queueSize}</span>
					)}
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={e => {
							e.stopPropagation();
							forceRetry();
						}}
						className={`
        ml- cursor-pointer transition-opacity
        hover:opacity-
      `}
						title="Retry now"
						aria-label="Retry connection now"
					>
						↻
					</Button>
				</>
			)}
		</Badge>
	);
}
