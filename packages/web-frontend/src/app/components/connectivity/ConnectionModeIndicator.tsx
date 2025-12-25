/**
 * Connection Mode Indicator
 *
 * Visual indicator showing the current connection mode and transport type.
 * Displays connection state (connected, reconnecting, failed) and transport type
 * (WebSocket, SSE, Long Polling, REST).
 */
import { useEffect, useState } from 'react';

import { Button } from '@framework/components/primitives/Button';

import { useTransport } from '@/transport';

import { StatusBadge, type StatusBadgeVariant } from '@app/components/common/StatusBadge';

export function ConnectionModeIndicator() {
	const { transport, connectionState, port, forceDowngrade } = useTransport();
	const [reconnectDelay, setReconnectDelay] = useState(0);

	// Get transport type (websocket, sse, long-polling, http, mock)
	const transportType = transport.getTransportType();

	// Poll reconnect delay every 100ms when reconnecting
	useEffect(() => {
		if (connectionState !== 'reconnecting' && connectionState !== 'connecting') {
			setReconnectDelay(0);
			return;
		}

		// Update immediately
		if ('getReconnectDelay' in transport && typeof transport.getReconnectDelay === 'function') {
			setReconnectDelay(transport.getReconnectDelay());
		}

		// Poll every 100ms
		const interval = setInterval(() => {
			if ('getReconnectDelay' in transport && typeof transport.getReconnectDelay === 'function') {
				setReconnectDelay(transport.getReconnectDelay());
			}
		}, 100);

		return () => clearInterval(interval);
	}, [transport, connectionState]);

	// Determine display based on state AND type
	let badgeText = '';
	let badgeVariant: StatusBadgeVariant = 'neutral';
	let showDowngradeButton = false;

	if (connectionState === 'connected') {
		// Connected - show transport type with dynamic port
		badgeVariant = 'success';
		switch (transportType) {
			case 'websocket':
				badgeText = `WS (${port})`;
				break;
			case 'sse':
				badgeText = `SSE (${port})`;
				break;
			case 'long-polling':
				badgeText = `LongPoll (${port})`;
				break;
			case 'http':
				badgeText = `REST (${port})`;
				badgeVariant = 'warning';
				break;
			case 'mock':
				badgeText = 'Mock';
				badgeVariant = 'neutral';
				break;
		}
	} else if (connectionState === 'connecting') {
		badgeText = reconnectDelay > 0 ? `Connecting... (${reconnectDelay}s)` : 'Connecting...';
		badgeVariant = 'info';
		showDowngradeButton = true;
	} else if (connectionState === 'reconnecting') {
		badgeText = reconnectDelay > 0 ? `Reconnecting... (${reconnectDelay}s)` : 'Reconnecting...';
		badgeVariant = 'warning';
		showDowngradeButton = true;
	} else if (connectionState === 'error') {
		badgeText = 'Failed';
		badgeVariant = 'error';
	} else if (connectionState === 'manual_downgrade') {
		badgeText = `REST (${port})`;
		badgeVariant = 'warning';
	} else {
		// disconnected
		badgeText = 'REST Fallback';
		badgeVariant = 'warning';
	}

	return (
		<div className="flex flex-wrap items-center gap-2 text-xs">
			<StatusBadge variant={badgeVariant}>{badgeText}</StatusBadge>
			{showDowngradeButton && (
				<Button
					variant="secondary"
					size="sm"
					onClick={forceDowngrade}
					className="h-6 rounded px-2 py-1 text-xs"
					title="Switch to REST polling mode"
				>
					Switch to REST
				</Button>
			)}
		</div>
	);
}
