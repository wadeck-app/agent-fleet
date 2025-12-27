/**
 * Transport Mode Selector
 *
 * Allows user to manually select transport mode (for development/debugging).
 * Shows current preference and allows switching between modes.
 */
import { useState } from 'react';

import { Label } from '@framework/components/forms/Label';
import { RadioGroup, RadioGroupItem } from '@framework/components/forms/RadioGroup';

import { useConnId, useTransport } from '@/transport';

export type TransportMode = 'auto' | 'websocket' | 'sse' | 'long-polling' | 'rest' | 'mock';

export interface TransportModeSelectorProps {
	/** Additional CSS classes */
	className?: string;
}

const modes: Array<{ value: TransportMode; label: string; description: string }> = [
	{ value: 'auto', label: 'Auto', description: 'Let system decide' },
	{ value: 'websocket', label: 'WebSocket', description: 'Real-time bidirectional' },
	{ value: 'sse', label: 'SSE', description: 'Server-Sent Events' },
	{ value: 'long-polling', label: 'Long Polling', description: 'HTTP long polling' },
	{ value: 'rest', label: 'REST', description: 'Simple HTTP polling' },
	{ value: 'mock', label: 'Mock', description: 'Test mode' },
];

export function TransportModeSelector({ className }: TransportModeSelectorProps) {
	const { switchTransport } = useTransport();
	const connId = useConnId();

	// Read current mode from localStorage
	const [selectedMode, setSelectedMode] = useState<TransportMode>(() => {
		const saved = localStorage.getItem('transport_mode') as TransportMode;
		return saved || 'auto';
	});

	const [isSwitching, setIsSwitching] = useState(false);

	const handleChange = async (value: string) => {
		const mode = value as TransportMode;
		setSelectedMode(mode);
		setIsSwitching(true);

		try {
			console.log('[TransportModeSelector] Switching transport to:', mode);
			await switchTransport(mode);
			console.log('[TransportModeSelector] Transport switched successfully');
		} catch (error) {
			console.error('[TransportModeSelector] Failed to switch transport:', error);
		} finally {
			setIsSwitching(false);
		}
	};

	return (
		<div className={className}>
			<Label className="mb-2 block text-xs font-medium text-muted-foreground">Transport Mode (Dev)</Label>
			<RadioGroup value={selectedMode} onValueChange={handleChange} className="gap-2" disabled={isSwitching}>
				{modes.map(mode => (
					<div key={mode.value} className="flex items-center space-x-2">
						<RadioGroupItem value={mode.value} id={`transport-${mode.value}`} disabled={isSwitching} />
						<Label
							htmlFor={`transport-${mode.value}`}
							className={`cursor-pointer text-xs ${isSwitching ? 'opacity-50' : ''}`}
						>
							<span className="font-medium">{mode.label}</span>
							<span className="ml-2 text-muted-foreground">({mode.description})</span>
						</Label>
					</div>
				))}
			</RadioGroup>

			{isSwitching && (
				<div className="mt-3 flex items-center gap-2 rounded border border-border bg-muted/50 px-3 py-2 text-xs">
					<span className="text-muted-foreground">Switching transport...</span>
				</div>
			)}

			{/* Connection ID Badge - Global to app, unique per tab */}
			<div className="mt-3 rounded border px-3 py-2">
				<div className="flex items-center justify-between gap-2">
					<span className="text-xs text-muted-foreground">Connection ID:</span>
					<span className="font-mono text-xs font-semibold text-yellow-600 dark:text-yellow-400">
						{connId ? connId.substring(0, 8) : 'N/A'}
					</span>
				</div>
			</div>
		</div>
	);
}
