import { useEffect, useMemo, useState } from 'react';

import { Label } from '@framework/components/forms/Label';
import { Badge } from '@framework/components/primitives/Badge';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { TicketHistoryEntry } from '@shared/api/tickets.contract';
import { B2F_TASKS_UPDATED, B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED } from '@shared/transport';
import { Loader2 } from 'lucide-react';

import { useTransport } from '@/transport/useTransport';

import { ticketsApi } from './tickets.api';

/**
 * Map event types to badge variants
 */
const EVENT_VARIANTS: Record<
	string,
	'default' | 'secondary' | 'info' | 'success' | 'warning' | 'destructive' | 'outline'
> = {
	'ticket.created': 'success',
	'ticket.updated': 'info',
	'ticket.transitioned': 'warning',
	'ticket.comment_created': 'secondary',
};

/**
 * Render human-readable event descriptions
 */
function renderEventDescription(entry: TicketHistoryEntry): string {
	switch (entry.event) {
		case 'ticket.created':
			return 'Ticket created';
		case 'ticket.transitioned': {
			const from = entry.data.from as string | undefined;
			const to = entry.data.to as string | undefined;
			if (from && to) {
				return `Status: ${from.replace(/_/g, ' ')} → ${to.replace(/_/g, ' ')}`;
			}
			return 'Status changed';
		}
		case 'ticket.comment_created': {
			return 'Comment';
		}
		case 'ticket.updated': {
			const changes = entry.data.changes as Record<string, unknown> | undefined;
			if (changes) {
				const fields = Object.keys(changes).filter(f => f !== 'version');
				if (fields.length > 0) {
					return `Updated ${fields.join(', ')}`;
				}
			}
			return 'Ticket updated';
		}
		default:
			return entry.event;
	}
}

export function TicketEventHistorySection({
	ticketId,
	sortOrder = 'asc',
	showLabel = true,
}: {
	ticketId: string;
	sortOrder?: 'asc' | 'desc';
	showLabel?: boolean;
}) {
	const [entries, setEntries] = useState<TicketHistoryEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const { transport } = useTransport();

	// Sort entries based on sortOrder
	const sortedEntries = useMemo(() => {
		if (!entries) return [];
		const sorted = [...entries];
		sorted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		return sortOrder === 'desc' ? sorted.reverse() : sorted;
	}, [entries, sortOrder]);

	const fetchHistory = async () => {
		try {
			const response = await ticketsApi.getHistory(ticketId);
			setEntries(response.entries);
		} catch (err) {
			console.error('Failed to fetch event history:', err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchHistory();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId]);

	// Subscribe to real-time updates
	useEffect(() => {
		const unsubTicketUpdated = transport.subscribe(
			B2F_TICKET_UPDATED,
			() => {
				fetchHistory();
			},
			{ ticketId }
		);
		const unsubCommentAdded = transport.subscribe(
			B2F_TICKET_COMMENT_ADDED,
			() => {
				fetchHistory();
			},
			{ ticketId }
		);
		const unsubTasksUpdated = transport.subscribe(B2F_TASKS_UPDATED, () => {
			fetchHistory();
		});

		return () => {
			unsubTicketUpdated();
			unsubCommentAdded();
			unsubTasksUpdated();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId, transport]);

	if (loading) {
		return (
			<div>
				{showLabel && <Label>Event History</Label>}
				<div className="mt-2 flex items-center gap-2">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
					<span className="text-sm text-muted-foreground">Loading...</span>
				</div>
			</div>
		);
	}

	return (
		<div>
			{showLabel && <Label>Event History</Label>}
			{sortedEntries.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">No events yet</p>
			) : (
				<div className="mt-2 space-y-2">
					{sortedEntries.map(entry => (
						<div key={entry.id} className="rounded-md border bg-card p-3">
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant={EVENT_VARIANTS[entry.event] ?? 'default'} className="text-xs">
									{entry.event}
								</Badge>
								<span className="text-sm">{renderEventDescription(entry)}</span>
								{entry.author && (
									<Badge variant="outline" className="text-xs">
										{entry.author}
									</Badge>
								)}
								<span className="ml-auto text-xs text-muted-foreground">
									{formatRelativeTime(entry.timestamp)}
								</span>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
