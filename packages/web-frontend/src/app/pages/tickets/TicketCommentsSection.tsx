import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import type { TicketComment } from '@shared/api/tickets.contract';
import { B2F_TICKET_COMMENT_ADDED } from '@shared/transport/B2FEventConstants';
import { Loader2 } from 'lucide-react';
import remarkGfm from 'remark-gfm';

import { useTransport } from '@/transport';

import { CommentPermalink } from './components/CommentPermalink';
import { ticketsApi } from './tickets.api';

// Stable reference — defined outside component to prevent ReactMarkdown from
// unmounting/remounting every time the parent re-renders. An inline object literal
// creates a new reference on every render, which ReactMarkdown treats as a config
// change and fully re-renders the markdown DOM (visible as content "flickering").
const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
	p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
	strong: ({ children }) => <strong className="font-bold">{children}</strong>,
	em: ({ children }) => <em className="italic">{children}</em>,
	code: ({ children, className }) => {
		const isBlock = className?.startsWith('language-');
		if (isBlock) {
			return <code className={className}>{children}</code>;
		}
		return <code className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">{children}</code>;
	},
	pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">{children}</pre>,
	ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
	ol: ({ children }) => <ol className="my-1 ml-4 list-decimal">{children}</ol>,
	li: ({ children }) => <li className="my-0.5">{children}</li>,
	blockquote: ({ children }) => (
		<blockquote className="my-1 border-l-2 border-muted-foreground pl-3 text-muted-foreground">
			{children}
		</blockquote>
	),
	a: ({ children, href }) => (
		<a href={href} className="text-primary underline hover:no-underline" target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	),
};

interface TicketCommentsSectionProps {
	ticketId: string;
	sortOrder?: 'asc' | 'desc';
	showLabel?: boolean;
}

/**
 * ===========================================================================================
 * TICKET COMMENTS SECTION
 * ===========================================================================================
 *
 * Comments display and input for ticket detail page.
 *
 * Features:
 * - Fetches comments on mount
 * - Appends new comments in real-time via B2F_TICKET_COMMENT_ADDED event
 * - Shows author badge and relative timestamp
 * - Allows adding new comments
 * - Permalink support with URL hash updates
 *
 * ===========================================================================================
 */
export function TicketCommentsSection({ ticketId, sortOrder = 'asc', showLabel = true }: TicketCommentsSectionProps) {
	const [comments, setComments] = useState<TicketComment[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [newComment, setNewComment] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const { transport } = useTransport();

	// Sort comments based on sortOrder
	const sortedComments = useMemo(() => {
		if (!comments) return [];
		const sorted = [...comments];
		sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
		return sortOrder === 'desc' ? sorted.reverse() : sorted;
	}, [comments, sortOrder]);

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

	// Handle adding a new comment
	const handleAddComment = async () => {
		if (!newComment.trim() || submitting) return;
		setSubmitting(true);
		try {
			await ticketsApi.addComment(ticketId, { content: newComment.trim() });
			setNewComment('');
		} catch (err) {
			console.error('Failed to add comment:', err);
		} finally {
			setSubmitting(false);
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
				console.log(
					'[TicketCommentsSection] B2F_TICKET_COMMENT_ADDED received:',
					comment.id,
					'author:',
					comment.author
				);
				setComments(prev => [...prev, comment]);
			},
			{ ticketId }
		);
		return unsub;
	}, [ticketId, transport]);

	// Derive selected comment from URL hash (permanent, no timeout)
	const selectedCommentId = window.location.hash.startsWith('#comment-')
		? window.location.hash.slice('#comment-'.length)
		: null;

	// Scroll to selected comment after comments load
	useEffect(() => {
		if (!selectedCommentId) return;
		const el = document.getElementById(`comment-${selectedCommentId}`);
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [comments, selectedCommentId]);

	if (loading) {
		return (
			<div>
				{showLabel && <Label>Comments</Label>}
				<div className="mt-2 flex justify-center">
					<Loader2 className="size-4 animate-spin text-muted-foreground" />
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div>
				{showLabel && <Label>Comments</Label>}
				<p className="mt-2 text-sm text-destructive">Failed to load comments</p>
			</div>
		);
	}

	return (
		<div>
			{showLabel && <Label>Comments</Label>}
			{sortedComments.length === 0 ? (
				<p className="mt-2 text-sm text-muted-foreground">No comments yet.</p>
			) : (
				<div className="mt-2 space-y-4">
					{sortedComments.map(comment => (
						<div
							key={comment.id}
							id={`comment-${comment.id}`}
							className={`rounded-md border bg-card p-4 border-l-[3px] ${selectedCommentId === comment.id ? 'border-l-primary' : 'border-l-transparent'}`}
						>
							<div className="mb-2 flex items-center gap-2">
								{comment.author && (
									<Badge variant="outline" className="text-xs">
										{comment.author}
									</Badge>
								)}
								<CommentPermalink commentId={comment.id} createdAt={comment.createdAt} />
							</div>
							<div className="max-w-none text-sm">
								<ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
									{comment.content}
								</ReactMarkdown>
							</div>
						</div>
					))}
				</div>
			)}

			{/* Add comment form - always visible */}
			<div className="mt-4 space-y-2">
				<Label>Add a comment</Label>
				<Textarea
					value={newComment}
					onChange={e => setNewComment(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
							e.preventDefault();
							void handleAddComment();
						}
					}}
					placeholder="Write a comment... (Ctrl+Enter to submit)"
					rows={3}
					disabled={submitting}
				/>
				<Button onClick={() => void handleAddComment()} disabled={!newComment.trim() || submitting} size="sm">
					{submitting ? 'Posting...' : 'Add Comment'}
				</Button>
			</div>
		</div>
	);
}
