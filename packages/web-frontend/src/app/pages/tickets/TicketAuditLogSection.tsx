import { useEffect, useState } from 'react';

import { Label } from '@framework/components/forms/Label';
import { Badge } from '@framework/components/primitives/Badge';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { TicketHistoryEntry } from '@shared/api/tickets.contract';
import { B2F_TASKS_UPDATED, B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED } from '@shared/transport';
import { Loader2 } from 'lucide-react';

import { useTransport } from '@/transport';

import { ticketsApi } from './tickets.api';

/**
 * Render Jira-style rich audit log entry
 */
function renderAuditEntry(entry: TicketHistoryEntry) {
	const authorBadge = entry.author ? (
		<Badge variant="outline" className="ml-2 text-xs">
			{entry.author}
		</Badge>
	) : null;

	switch (entry.event) {
		case 'ticket.created': {
			const status = entry.data.status as string | undefined;
			return (
				<div className="space-y-1">
					<div className="flex items-center font-medium text-foreground">
						<span>Ticket created</span>
						{authorBadge}
					</div>
					{status && (
						<div>
							<Badge variant="secondary" className="text-xs">
								{status.replace(/_/g, ' ')}
							</Badge>
						</div>
					)}
				</div>
			);
		}
		case 'ticket.transitioned': {
			const from = entry.data.from as string | undefined;
			const to = entry.data.to as string | undefined;
			return (
				<div className="flex items-center font-medium text-foreground">
					<span>
						Status changed: <strong>{from?.replace(/_/g, ' ') ?? '?'}</strong> →{' '}
						<strong>{to?.replace(/_/g, ' ') ?? '?'}</strong>
					</span>
					{authorBadge}
				</div>
			);
		}
		case 'ticket.comment_created': {
			const content = entry.data.content as string | undefined;
			const truncated = content && content.length > 100 ? `${content.slice(0, 100)}...` : content;
			return (
				<div className="space-y-1">
					<div className="flex items-center font-medium text-foreground">
						<span>Comment added</span>
						{authorBadge}
					</div>
					{truncated && <p className="text-muted-foreground">{truncated}</p>}
				</div>
			);
		}
		case 'ticket.updated': {
			const fields = entry.data.fields as string[] | undefined;
			const changes = entry.data.changes as Record<string, { from: unknown; to: unknown }> | undefined;

			if (changes) {
				return (
					<div className="space-y-1">
						{Object.entries(changes).map(([field, change], index) => {
							const fromStr = String(change.from ?? '');
							const toStr = String(change.to ?? '');
							// Show full diff if both values are short
							if (fromStr.length + toStr.length < 50) {
								return (
									<div key={field} className="flex items-center text-foreground">
										<span>
											Updated <strong>{field}</strong>: {fromStr} → {toStr}
										</span>
										{index === 0 && authorBadge}
									</div>
								);
							}
							return (
								<div key={field} className="flex items-center text-foreground">
									<span>
										Updated <strong>{field}</strong>
									</span>
									{index === 0 && authorBadge}
								</div>
							);
						})}
					</div>
				);
			}

			if (fields && fields.length > 0) {
				return (
					<div className="flex items-center text-foreground">
						<span>
							Updated{' '}
							{fields.map((f, i) => (
								<strong key={i}>{i > 0 ? `, ${f}` : f}</strong>
							))}
						</span>
						{authorBadge}
					</div>
				);
			}

			return (
				<div className="flex items-center text-foreground">
					<span>Ticket updated</span>
					{authorBadge}
				</div>
			);
		}
		default:
			return (
				<div className="flex items-center text-foreground">
					<span>{entry.event}</span>
					{authorBadge}
				</div>
			);
	}
}

export function TicketAuditLogSection({ ticketId }: { ticketId: string }) {
	const [entries, setEntries] = useState<TicketHistoryEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const { transport } = useTransport();

	const fetchAuditLog = async () => {
		try {
			const response = await ticketsApi.getHistory(ticketId);
			// Sort newest first
			const sorted = response.entries.sort(
				(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
			);
			setEntries(sorted);
		} catch (err) {
			console.error('Failed to fetch audit log:', err);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchAuditLog();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId]);

	// Real-time refresh on new comments, tasks, or ticket updates
	useEffect(() => {
		const unsubComment = transport.subscribe(
			B2F_TICKET_COMMENT_ADDED,
			() => {
				fetchAuditLog();
			},
			{ ticketId }
		);

		const unsubTicketUpdated = transport.subscribe(
			B2F_TICKET_UPDATED,
			() => {
				fetchAuditLog();
			},
			{ ticketId }
		);

		const unsubTask = transport.subscribe(B2F_TASKS_UPDATED, () => {
			fetchAuditLog();
		});

		return () => {
			unsubComment();
			unsubTicketUpdated();
			unsubTask();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId, transport]);

	if (loading) {
		return (
			<div>
				<Label>Audit Log</Label>
				<div className="mt-2 flex items-center gap-2">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
					<span className="text-sm text-muted-foreground">Loading...</span>
				</div>
			</div>
		);
	}

	return (
		<div>
			<Label>Audit Log</Label>
			{entries.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">No activity yet</p>
			) : (
				<div className="mt-2 space-y-2">
					{entries.map(entry => (
						<div key={entry.id} className="rounded-md border bg-card p-2 text-xs">
							<div className="mb-1 text-muted-foreground">{formatRelativeTime(entry.timestamp)}</div>
							{renderAuditEntry(entry)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
