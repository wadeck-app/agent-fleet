import { useEffect, useState } from 'react';

import { Label } from '@framework/components/forms/Label';
import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { Badge } from '@framework/components/primitives/Badge';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { TicketComment } from '@shared/api/tickets.contract';
import { B2F_TICKET_COMMENT_ADDED } from '@shared/transport/B2FEventConstants';

import { useTransport } from '@/transport';

import { ticketsApi } from './tickets.api';

interface TicketCommentsSectionProps {
	ticketId: string;
}

/**
 * ===========================================================================================
 * TICKET COMMENTS SECTION
 * ===========================================================================================
 *
 * Read-only comments display for ticket detail page.
 *
 * Features:
 * - Fetches comments on mount
 * - Appends new comments in real-time via B2F_TICKET_COMMENT_ADDED event
 * - Shows author badge and relative timestamp
 * - Empty state when no comments
 *
 * ===========================================================================================
 */
export function TicketCommentsSection({ ticketId }: TicketCommentsSectionProps) {
	const [comments, setComments] = useState<TicketComment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const { transport } = useTransport();

	// Fetch comments
	const fetchComments = async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await ticketsApi.getComments(ticketId);
			setComments(response.comments);
		} catch (err) {
			console.error('Failed to fetch comments:', err);
			setError(err instanceof Error ? err : new Error('Failed to fetch comments'));
		} finally {
			setLoading(false);
		}
	};

	// Initial load
	useEffect(() => {
		fetchComments();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId]);

	// Subscribe to real-time comment additions
	useEffect(() => {
		const unsub = transport.subscribe(
			B2F_TICKET_COMMENT_ADDED,
			(comment: TicketComment) => {
				setComments(prev => [...prev, comment]);
			},
			{ ticketId }
		);
		return unsub;
	}, [ticketId, transport]);

	if (loading) {
		return (
			<div>
				<Label>Comments</Label>
				<div className="mt-2 flex items-center gap-2">
					<LoadingSpinner size="sm" />
					<span className="text-sm text-muted-foreground">Loading comments...</span>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div>
				<Label>Comments</Label>
				<p className="mt-2 text-sm text-destructive">Failed to load comments</p>
			</div>
		);
	}

	// Empty state
	if (comments.length === 0) {
		return null;
	}

	return (
		<div>
			<Label>Comments</Label>
			<div className="mt-2 space-y-4">
				{comments.map(comment => (
					<div key={comment.id} className="rounded-md border bg-card p-4">
						<div className="mb-2 flex items-center gap-2">
							{comment.author && (
								<Badge variant="outline" className="text-xs">
									{comment.author}
								</Badge>
							)}
							<span className="text-xs text-muted-foreground">
								{formatRelativeTime(comment.createdAt)}
							</span>
						</div>
						<p className="whitespace-pre-wrap text-sm">{comment.content}</p>
					</div>
				))}
			</div>
		</div>
	);
}
