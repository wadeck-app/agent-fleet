import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { Activity, ChevronDown, ChevronUp } from 'lucide-react';

import { useTransport } from '@/transport';

/**
 * EventDebugWidget - Shows active WebSocket subscriptions
 *
 * IMPORTANT: This widget does NOT create any subscriptions.
 * It only displays the list of active subscriptions from other components.
 *
 * Useful for debugging to see which events the current page is subscribed to.
 */
export function EventDebugWidget() {
	const { subscriptions } = useTransport();
	const [isExpanded, setIsExpanded] = useState(false);

	if (!isExpanded) {
		return (
			<div className="space-y-2">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setIsExpanded(true)}
					className="w-full justify-start gap-2 text-xs"
				>
					<Activity className="size-3" />
					<span>Subscriptions ({subscriptions.length})</span>
					<ChevronDown className="ml-auto size-3" />
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-2 rounded-lg border border-border bg-card p-2 text-xs">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 font-medium">
					<Activity className="size-3" />
					<span>Active Subscriptions</span>
				</div>
				<Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)} className="size-5">
					<ChevronUp className="size-3" />
				</Button>
			</div>

			<div className="space-y-1">
				<div className="text-[9px] text-muted-foreground">WebSocket event subscriptions on this page</div>
				{subscriptions.length === 0 ? (
					<div className="text-muted-foreground">No active subscriptions</div>
				) : (
					<div className="max-h-40 space-y-0.5 overflow-y-auto text-[10px]">
						{subscriptions.map((sub, index) => (
							<div
								key={index}
								className="truncate rounded bg-muted/50 px-1.5 py-0.5 font-mono text-blue-500"
							>
								{sub}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
