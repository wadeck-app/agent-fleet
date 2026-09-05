import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { Label } from '@framework/components/forms/Label';
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { SelectWithSpinner } from '@framework/components/forms/SelectWithSpinner';
import { Textarea } from '@framework/components/forms/Textarea';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Ticket, TicketComment, TicketStatus } from '@shared/api/tickets.contract';
import { B2F_TICKET_COMMENT_ADDED } from '@shared/transport/B2FEventConstants';
import { Loader2, Send } from 'lucide-react';
import remarkGfm from 'remark-gfm';

import { useTransport } from '@/transport/useTransport';

import { TicketAuditLogSection } from './TicketAuditLogSection';
import { TriggeredTasksSection } from './TriggeredTasksSection';
import { CommentPermalink } from './components/CommentPermalink';
import { ticketsApi } from './tickets.api';
import { useProjectStatusConfig } from './useProjectStatusConfig';

interface TicketDetailLayoutFProps {
	ticket: Ticket;
	ticketId: string;
	onUpdate: (updates: Partial<Ticket>) => Promise<void>;
	onRefresh: () => Promise<void>;
}

/**
 * Layout F (AI Mode) - Side panel for AI conversation, main content for ticket data
 */
export function TicketDetailLayoutF({ ticket, ticketId, onUpdate, onRefresh }: TicketDetailLayoutFProps) {
	const { showToast } = useToast();
	const { config: statusConfig } = useProjectStatusConfig(ticket.projectId);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const wasAtBottomRef = useRef(true);
	const [localDescription, setLocalDescription] = useState(ticket.description);
	const [localStatus, setLocalStatus] = useState<TicketStatus>(ticket.status);
	const [comments, setComments] = useState<TicketComment[]>([]);
	const [commentsLoading, setCommentsLoading] = useState(true);
	const [replyContent, setReplyContent] = useState('');
	const [sending, setSending] = useState(false);
	const [dirtyFields, setDirtyFields] = useState<Partial<Ticket>>({});
	const [saving, setSaving] = useState(false);
	const [statusSaving, setStatusSaving] = useState(false);
	const { transport } = useTransport();

	// Fetch all comments
	useEffect(() => {
		const fetchComments = async () => {
			try {
				setCommentsLoading(true);
				const response = await ticketsApi.getComments(ticketId);
				setComments(response.comments);
			} catch (err) {
				console.error('Failed to fetch comments:', err);
			} finally {
				setCommentsLoading(false);
			}
		};

		fetchComments();
	}, [ticketId]);

	// Subscribe to new comments - capture scroll state BEFORE DOM update
	useEffect(() => {
		const unsub = transport.subscribe(
			B2F_TICKET_COMMENT_ADDED,
			(comment: TicketComment) => {
				// Capture whether user is at bottom BEFORE the new comment renders
				const el = scrollContainerRef.current;
				if (el) {
					wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
				}
				setComments(prev => [...prev, comment]);
			},
			{ ticketId }
		);
		return unsub;
	}, [ticketId, transport]);

	// Auto-scroll to bottom on new messages only if user was at bottom before the new message
	useEffect(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		if (wasAtBottomRef.current) {
			el.scrollTop = el.scrollHeight;
		}
	}, [comments.length]);

	// Scroll to and highlight comment from URL hash
	useEffect(() => {
		const hash = window.location.hash;
		if (!hash.startsWith('#comment-')) return;
		const targetId = hash.slice('#comment-'.length);
		const el = document.getElementById(`comment-${targetId}`);
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		el.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
		setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 3000);
	}, [comments]);

	const handleDescriptionChange = (value: string) => {
		setLocalDescription(value);
		if (value !== ticket.description) {
			setDirtyFields(prev => ({ ...prev, description: value }));
		} else {
			setDirtyFields(prev => {
				const { description: _description, ...rest } = prev;
				return rest;
			});
		}
	};

	const handleStatusChange = async (newStatus: string) => {
		setLocalStatus(newStatus as TicketStatus);
		setStatusSaving(true);
		try {
			await ticketsApi.updateTicket(ticketId, { status: newStatus as TicketStatus, version: ticket.version });
			await onRefresh();
		} catch (err) {
			setLocalStatus(ticket.status);
			const errMsg = getErrorMessage(err);
			if (errMsg.includes('version') || errMsg.includes('conflict') || errMsg.includes('409')) {
				showToast('This ticket was modified by someone else. Please refresh.', 'error');
			} else {
				showToast(`Failed to update status: ${errMsg}`, 'error');
			}
		} finally {
			setStatusSaving(false);
		}
	};

	const handleSaveChanges = async () => {
		if (Object.keys(dirtyFields).length === 0 || saving) return;

		setSaving(true);
		try {
			await onUpdate(dirtyFields);
			setDirtyFields({});
		} catch (err) {
			const errMsg = getErrorMessage(err);
			if (errMsg.includes('version') || errMsg.includes('conflict') || errMsg.includes('409')) {
				showToast('This ticket was modified by someone else. Please refresh.', 'error');
			} else {
				console.error('Failed to save changes:', err);
				showToast(`Failed to save changes: ${errMsg}`, 'error');
			}
		} finally {
			setSaving(false);
		}
	};

	const hasDirtyFields = Object.keys(dirtyFields).length > 0;

	const handleSendReply = async () => {
		if (!replyContent.trim() || sending) return;

		// User sends → always scroll to bottom when their message appears
		wasAtBottomRef.current = true;
		setSending(true);
		try {
			await ticketsApi.addComment(ticketId, { content: replyContent });
			setReplyContent('');
		} catch (err) {
			console.error('Failed to send comment:', err);
			showToast('Failed to send comment', 'error');
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="flex h-[calc(100vh-8rem)] gap-4">
			{/* Left panel: ticket content */}
			<div className="flex-1 space-y-6 overflow-y-auto pl-1 pr-4">
				<div>
					<h1 className="text-2xl font-bold">{ticket.title}</h1>
					<div className="mt-2 flex items-center gap-2">
						<span className="text-xs text-muted-foreground">
							Created {formatRelativeTime(ticket.createdAt)}
						</span>
					</div>
				</div>

				<div>
					<Label htmlFor="status">Status</Label>
					{/* w-48 constrains the flex container so the spinner stays adjacent to the select (a1 fix) */}
					<div className="mt-1 w-48">
						<SelectWithSpinner
							value={localStatus}
							onValueChange={newStatus => void handleStatusChange(newStatus)}
							loading={statusSaving}
						>
							<SelectTrigger id="status" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{statusConfig.statuses.map(s => (
									<SelectItem key={s.id} value={s.id}>
										{s.label}
									</SelectItem>
								))}

								{/* Fallback: show raw status value when config hasn't loaded yet -- bug #5 */}
								{!statusConfig.statuses.find(s => s.id === localStatus) && (
									<SelectItem value={localStatus}>{localStatus}</SelectItem>
								)}
							</SelectContent>
						</SelectWithSpinner>
					</div>
				</div>

				<div>
					<Label htmlFor="description">Description</Label>
					<Textarea
						id="description"
						value={localDescription}
						onChange={e => handleDescriptionChange(e.target.value)}
						rows={6}
						className={`mt-1 ${dirtyFields.description ? 'ring-2 ring-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary' : ''} ${saving ? 'opacity-50 transition-opacity' : ''}`}
					/>
				</div>

				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="inline-block">
								<Button onClick={handleSaveChanges} disabled={!hasDirtyFields || saving}>
									{saving && <Loader2 className="mr-2 size-4 animate-spin" />}
									Save changes
								</Button>
							</div>
						</TooltipTrigger>
						<TooltipContent>
							<p>
								{hasDirtyFields
									? `Will save: ${Object.keys(dirtyFields).join(', ')}`
									: 'No unsaved changes'}
							</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>

				<div>
					<Label>Labels</Label>
					<div className="mt-2 flex flex-wrap gap-2">
						{ticket.labels.map(label => (
							<Badge key={label} variant="outline">
								{label}
							</Badge>
						))}
						{ticket.labels.length === 0 && <p className="text-sm text-muted-foreground">No labels</p>}
					</div>
				</div>

				<div>
					<Label>Custom Fields</Label>
					<div className="mt-2 space-y-2">
						{Object.entries(ticket.fields).map(([key, value]) => (
							<div key={key} className="rounded-md border bg-card p-2 text-sm">
								<div className="font-medium text-muted-foreground">{key}</div>
								<div>{value}</div>
							</div>
						))}
						{Object.keys(ticket.fields).length === 0 && (
							<p className="text-sm text-muted-foreground">No custom fields</p>
						)}
					</div>
				</div>

				<TriggeredTasksSection ticketId={ticketId} />

				<TicketAuditLogSection ticketId={ticketId} />
			</div>

			{/* Right panel: AI conversation */}
			<div className="flex w-80 flex-col border-l bg-card">
				<div className="flex-shrink-0 border-b p-4">
					<h2 className="font-semibold">AI Assistant</h2>
				</div>

				<div ref={scrollContainerRef} className="flex-1 space-y-4 overflow-y-auto p-4">
					{!commentsLoading && comments.length === 0 ? (
						<p className="text-sm text-muted-foreground">No comments yet.</p>
					) : (
						<>
							{comments.map(comment => {
								const isWorker = comment.author?.startsWith('worker-');
								return (
									<div
										key={comment.id}
										id={`comment-${comment.id}`}
										className={`rounded-md border p-3 ${isWorker ? 'bg-accent' : 'bg-background'}`}
									>
										<div className="mb-1 flex items-center gap-2">
											{comment.author && (
												<Badge variant="outline" className="text-xs">
													{comment.author}
												</Badge>
											)}
											<CommentPermalink commentId={comment.id} createdAt={comment.createdAt} />
										</div>
										<div className="max-w-none text-sm">
											<ReactMarkdown
												remarkPlugins={[remarkGfm]}
												components={{
													p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
													strong: ({ children }) => (
														<strong className="font-semibold">{children}</strong>
													),
													em: ({ children }) => <em className="italic">{children}</em>,
													code: ({ children, className }) => {
														const isBlock = className?.startsWith('language-');
														if (isBlock) {
															return <code className={className}>{children}</code>;
														}
														return (
															<code className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">
																{children}
															</code>
														);
													},
													pre: ({ children }) => (
														<pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
															{children}
														</pre>
													),
													ul: ({ children }) => (
														<ul className="my-1 ml-4 list-disc">{children}</ul>
													),
													ol: ({ children }) => (
														<ol className="my-1 ml-4 list-decimal">{children}</ol>
													),
													li: ({ children }) => <li className="my-0.5">{children}</li>,
													blockquote: ({ children }) => (
														<blockquote className="my-1 border-l-2 border-muted-foreground pl-3 text-muted-foreground">
															{children}
														</blockquote>
													),
													a: ({ children, href }) => (
														<a
															href={href}
															className="text-primary underline hover:no-underline"
															target="_blank"
															rel="noopener noreferrer"
														>
															{children}
														</a>
													),
												}}
											>
												{comment.content}
											</ReactMarkdown>
										</div>
									</div>
								);
							})}
						</>
					)}
				</div>

				<div className="flex-shrink-0 border-t p-4">
					{/* T6 fix: add label for the AI reply textarea (visually hidden but accessible) */}
					<Label htmlFor="ai-reply" className="sr-only">
						Reply
					</Label>
					<div className="flex gap-2">
						<Textarea
							value={replyContent}
							onChange={e => setReplyContent(e.target.value)}
							onKeyDown={e => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									void handleSendReply();
								}
							}}
							id="ai-reply"
							placeholder="Ask the AI assistant..."
							rows={3}
							className="flex-1"
							disabled={sending}
						/>
						<Button
							onClick={() => void handleSendReply()}
							disabled={!replyContent.trim() || sending}
							size="sm"
						>
							{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
