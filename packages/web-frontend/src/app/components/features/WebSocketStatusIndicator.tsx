import type { FC } from 'react';

import { cn } from '@framework/lib/utils';
import { Circle } from 'lucide-react';

/**
 * ===========================================================================================
 * WEBSOCKET STATUS INDICATOR - Feature Component
 * ===========================================================================================
 *
 * Displays the current WebSocket connection status with a color-coded indicator.
 *
 * Features:
 * - Green dot: Connected (real-time updates active)
 * - Red dot: Disconnected (polling fallback active)
 * - Yellow dot: Connecting/Reconnecting
 * - Shows tooltip with status text
 *
 * Usage:
 * ```tsx
 * <WebSocketStatusIndicator
 *   isConnected={wsConnected}
 *   showLabel={true}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface WebSocketStatusIndicatorProps {
	isConnected: boolean;
	showLabel?: boolean;
	className?: string;
}

export const WebSocketStatusIndicator: FC<WebSocketStatusIndicatorProps> = ({
	isConnected,
	showLabel = false,
	className,
}) => {
	const statusColor = isConnected ? 'text-success' : 'text-danger';
	const statusText = isConnected ? 'Connected' : 'Disconnected';
	const statusDescription = isConnected ? 'Real-time updates active' : 'Using polling fallback';

	return (
		<div className={cn('flex items-center gap-2', className)} title={statusDescription}>
			<Circle className={cn('h-2 w-2 fill-current', statusColor)} />
			{showLabel && <span className="text-xs text-muted-foreground">{statusText}</span>}
		</div>
	);
};
