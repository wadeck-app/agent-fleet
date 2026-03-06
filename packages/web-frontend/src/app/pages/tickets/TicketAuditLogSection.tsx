import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { TicketHistoryEntry } from '@shared/api/tickets.contract';
import { B2F_TASKS_UPDATED, B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED } from '@shared/transport';
import { Loader2 } from 'lucide-react';

import { useTransport } from '@/transport';

import { ticketsApi } from './tickets.api';

/**
 * Get label and content for audit entry
 */
function getAuditEntryData(
	entry: TicketHistoryEntry,
	expanded: Set<string>,
	onExpand: (id: string) => void
): {
	label: string;
	content: React.ReactNode;
} {
	const isExpanded = expanded.has(entry.id);

	switch (entry.event) {
		case 'ticket.created': {
			const status = entry.data.status as string | undefined;
			return {
				label: 'Ticket created',
				content: status ? (
					<Badge variant="secondary" className="text-xs">
						{status.replace(/_/g, ' ')}
					</Badge>
				) : null,
			};
		}
		case 'ticket.transitioned': {
			const from = entry.data.from as string | undefined;
			const to = entry.data.to as string | undefined;
			return {
				label: 'Status changed',
				content: (
					<span>
						<strong>{from?.replace(/_/g, ' ') ?? '?'}</strong> →{' '}
						<strong>{to?.replace(/_/g, ' ') ?? '?'}</strong>
					</span>
				),
			};
		}
		case 'ticket.comment_created': {
			const content = entry.data.content as string | undefined;
			if (!content) {
				return { label: 'Comment added', content: null };
			}
			if (content.length <= 100 || isExpanded) {
				return { label: 'Comment added', content: <p>{content}</p> };
			}
			return {
				label: 'Comment added',
				content: (
					<p>
						{content.slice(0, 100)}{' '}
						<Button
							variant="ghost"
							className="h-auto cursor-pointer p-0 text-xs underline hover:text-foreground"
							onClick={() => onExpand(entry.id)}
						>
							[...]
						</Button>
					</p>
				),
			};
		}
		case 'ticket.updated': {
			const changes = entry.data.changes as Record<string, { from: unknown; to: unknown }> | undefined;
			const fields = entry.data.fields as string[] | undefined;

			if (changes) {
				const fieldEntries = Object.entries(changes).filter(([field]) => field !== 'version');
				if (fieldEntries.length === 0) {
					return { label: 'Ticket updated', content: null };
				}
				return {
					label: 'Ticket updated',
					content: (
						<table className="w-full text-xs">
							<colgroup>
								<col style={{ width: '5rem' }} />
								<col style={{ width: '45%' }} />
								<col />
							</colgroup>
							<tbody>
								{fieldEntries.map(([field, change]) => {
									const toValue = change.to;
									const fromValue = change.from;
									// Use JSON.stringify for objects/arrays, String() for primitives
									const serialize = (v: unknown): string => {
										if (v == null) return '—';
										if (typeof v === 'object') return JSON.stringify(v, null, 2);
										return String(v);
									};
									const fromStr = serialize(fromValue);
									const toStr = serialize(toValue);
									const isMultiLine = fromStr.includes('\n') || toStr.includes('\n');
									const truncate = (s: string, max: number) =>
										s.length > max ? s.slice(0, max) + '…' : s;
									return (
										<tr key={field}>
											<td className="py-0.5 pr-3 pl-3 font-medium text-foreground align-top">
												{field}
											</td>
											{isMultiLine ? (
												<>
													<td className="py-0.5 pr-2 text-muted-foreground opacity-60 align-top">
														<pre className="line-through whitespace-pre-wrap break-all">
															{truncate(fromStr, 120)}
														</pre>
													</td>
													<td className="py-0.5 text-muted-foreground align-top">
														<pre className="whitespace-pre-wrap break-all">
															{truncate(toStr, 120)}
														</pre>
													</td>
												</>
											) : (
												<>
													<td className="py-0.5 pr-2 text-muted-foreground opacity-60 align-top">
														<span className="line-through">{truncate(fromStr, 40)}</span>
													</td>
													<td className="py-0.5 text-muted-foreground align-top">
														{truncate(toStr, 40)}
													</td>
												</>
											)}
										</tr>
									);
								})}
							</tbody>
						</table>
					),
				};
			}

			if (fields && fields.length > 0) {
				const visibleFields = fields.filter(f => f !== 'version');
				if (visibleFields.length === 0) {
					return { label: 'Ticket updated', content: null };
				}
				return {
					label: 'Ticket updated',
					content: <span className="text-muted-foreground">{visibleFields.join(', ')}</span>,
				};
			}

			return { label: 'Ticket updated', content: null };
		}
		default:
			return { label: entry.event, content: null };
	}
}

export function TicketAuditLogSection({
	ticketId,
	sortOrder = 'asc',
	showLabel = true,
}: {
	ticketId: string;
	sortOrder?: 'asc' | 'desc';
	showLabel?: boolean;
}) {
	// React Compiler opt-out: fetchAuditLog is an async fn called from effects without
	// proper dependency tracking; compiler generates invalid code for this pattern.
	'use no memo';

	const [entries, setEntries] = useState<TicketHistoryEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const { transport } = useTransport();

	const onExpand = (id: string) => {
		setExpanded(prev => new Set([...prev, id]));
	};

	const fetchAuditLog = async () => {
		try {
			const response = await ticketsApi.getHistory(ticketId);
			setEntries(response.entries);
		} catch (err) {
			console.error('Failed to fetch audit log:', err);
		} finally {
			setLoading(false);
		}
	};

	// Sort entries based on sortOrder, filtering out ticket.updated when it only covers status
	// (status change is already represented by ticket.transitioned — avoid duplicates)
	const sortedEntries = useMemo(() => {
		if (!entries) return [];
		const filtered = entries.filter(entry => {
			if (entry.event !== 'ticket.updated') return true;
			const changes = entry.data.changes as Record<string, unknown> | undefined;
			const fields = entry.data.fields as string[] | undefined;
			if (changes) {
				const nonVersionKeys = Object.keys(changes).filter(k => k !== 'version');
				if (nonVersionKeys.length === 1 && nonVersionKeys[0] === 'status') return false;
				if (nonVersionKeys.length === 0) return false;
			}
			if (fields) {
				const nonVersionFields = fields.filter(f => f !== 'version' && f !== 'status');
				if (nonVersionFields.length === 0) return false;
			}
			// No structured changes at all — skip
			if (!changes && !fields) return false;
			return true;
		});
		const sorted = [...filtered];
		sorted.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
		return sortOrder === 'desc' ? sorted.reverse() : sorted;
	}, [entries, sortOrder]);

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
				{showLabel && (
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Audit Log</p>
				)}
				<div className="flex items-center gap-2">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
					<span className="text-sm text-muted-foreground">Loading...</span>
				</div>
			</div>
		);
	}

	return (
		<div>
			{showLabel && (
				<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Audit Log</p>
			)}
			{sortedEntries.length === 0 ? (
				<p className="text-sm text-muted-foreground">No activity yet</p>
			) : (
				<div>
					{sortedEntries.map(entry => {
						const { label, content } = getAuditEntryData(entry, expanded, onExpand);
						if (entry.event === 'ticket.updated' && !content) return null;
						return (
							<div key={entry.id} className="border-b py-2 last:border-b-0 text-xs">
								<div className="flex flex-wrap items-center gap-1.5">
									<span className="font-medium text-foreground">{label}</span>
									{entry.author && (
										<Badge variant="outline" className="text-xs">
											{entry.author}
										</Badge>
									)}
									<span className="text-muted-foreground">{formatRelativeTime(entry.timestamp)}</span>
								</div>
								{content && <div className="mt-1 text-muted-foreground">{content}</div>}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
