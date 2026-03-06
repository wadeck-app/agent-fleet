import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';

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
import type { Task, TaskStatus } from '@shared/api/tasks.contract';
import type { Ticket, TicketComment, TicketStatus } from '@shared/api/tickets.contract';
import { Loader2, MessageSquare, Zap } from 'lucide-react';
import remarkGfm from 'remark-gfm';

import { tasksApi } from '../tasks/tasks.api';
import { CommentPermalink } from './components/CommentPermalink';
import { ticketsApi } from './tickets.api';

interface TicketDetailLayoutEProps {
	ticket: Ticket;
	ticketId: string;
	onUpdate: (updates: Partial<Ticket>) => Promise<void>;
	onRefresh: () => Promise<void>;
}

const STATUS_VARIANTS: Record<TaskStatus, 'default' | 'secondary' | 'info' | 'success' | 'warning' | 'destructive'> = {
	backlog: 'secondary',
	refining: 'secondary',
	refined: 'secondary',
	prioritizing: 'secondary',
	todo: 'default',
	in_progress: 'info',
	awaiting_user: 'warning',
	testing: 'info',
	review: 'warning',
	reviewing: 'warning',
	changes_requested: 'destructive',
	approved: 'success',
	merged: 'success',
	blocked: 'destructive',
	cancelled: 'destructive',
};

type TimelineItem =
	| { type: 'comment'; id: string; createdAt: string; data: TicketComment }
	| { type: 'task'; id: string; createdAt: string; data: Task };

/**
 * Layout E (GitLab) - Unified timeline with interleaved comments and tasks
 */
export function TicketDetailLayoutE({ ticket, ticketId, onUpdate, onRefresh }: TicketDetailLayoutEProps) {
	const { showToast } = useToast();
	const [localDescription, setLocalDescription] = useState(ticket.description);
	const [localStatus, setLocalStatus] = useState<TicketStatus>(ticket.status);
	const [timeline, setTimeline] = useState<TimelineItem[]>([]);
	const [loadingTimeline, setLoadingTimeline] = useState(true);
	const [dirtyFields, setDirtyFields] = useState<Partial<Ticket>>({});
	const [saving, setSaving] = useState(false);
	const [statusSaving, setStatusSaving] = useState(false);

	// Fetch and merge comments and tasks into timeline
	useEffect(() => {
		const fetchTimeline = async () => {
			try {
				setLoadingTimeline(true);
				const [commentsRes, tasksRes] = await Promise.all([
					ticketsApi.getComments(ticketId),
					tasksApi.getTasksList({ ticketId, pageSize: 100 }),
				]);

				const items: TimelineItem[] = [
					...commentsRes.comments.map(c => ({
						type: 'comment' as const,
						id: c.id,
						createdAt: c.createdAt,
						data: c,
					})),
					...tasksRes.items.map(t => ({
						type: 'task' as const,
						id: t.id,
						createdAt: t.createdAt,
						data: t,
					})),
				];

				items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
				setTimeline(items);
			} catch (err) {
				console.error('Failed to fetch timeline:', err);
			} finally {
				setLoadingTimeline(false);
			}
		};

		fetchTimeline();
	}, [ticketId]);

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
	}, [timeline]);

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

	return (
		<div className="grid grid-cols-4 gap-6">
			{/* Left column (description) */}
			<div className="col-span-3 space-y-6">
				<div>
					<Label htmlFor="description">Description</Label>
					<Textarea
						id="description"
						value={localDescription}
						onChange={e => handleDescriptionChange(e.target.value)}
						rows={8}
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

				{/* Timeline */}
				<div>
					<Label>Activity Timeline</Label>
					{loadingTimeline && <p className="mt-2 text-sm text-muted-foreground">Loading activity...</p>}
					{!loadingTimeline && timeline.length === 0 && (
						<p className="mt-2 text-sm text-muted-foreground">No activity yet</p>
					)}
					{!loadingTimeline && timeline.length > 0 && (
						<div className="mt-4 space-y-4">
							{timeline.map(item => (
								<div key={`${item.type}-${item.id}`} className="flex gap-3">
									<div className="flex flex-col items-center">
										<div
											className={`flex size-8 items-center justify-center rounded-full ${
												item.type === 'comment' ? 'bg-muted' : 'bg-accent'
											}`}
										>
											{item.type === 'comment' ? (
												<MessageSquare className="size-4 text-muted-foreground" />
											) : (
												<Zap className="size-4 text-accent-foreground" />
											)}
										</div>
										{item !== timeline[timeline.length - 1] && (
											<div className="h-full w-px bg-border"></div>
										)}
									</div>

									<div
										id={item.type === 'comment' ? `comment-${item.id}` : undefined}
										className="flex-1 rounded-md border bg-card p-4"
									>
										{item.type === 'comment' && (
											<div>
												<div className="mb-2 flex items-center gap-2">
													{item.data.author && (
														<Badge variant="outline" className="text-xs">
															{item.data.author}
														</Badge>
													)}
													<CommentPermalink
														commentId={item.id}
														createdAt={item.data.createdAt}
													/>
												</div>
												<div className="max-w-none text-sm">
													<ReactMarkdown
														remarkPlugins={[remarkGfm]}
														components={{
															p: ({ children }) => (
																<p className="mb-1 last:mb-0">{children}</p>
															),
															strong: ({ children }) => (
																<strong className="font-semibold">{children}</strong>
															),
															em: ({ children }) => (
																<em className="italic">{children}</em>
															),
															code: ({ children, className }) => {
																const isBlock = className?.startsWith('language-');
																if (isBlock) {
																	return (
																		<code className={className}>{children}</code>
																	);
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
															li: ({ children }) => (
																<li className="my-0.5">{children}</li>
															),
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
														{item.data.content}
													</ReactMarkdown>
												</div>
											</div>
										)}

										{item.type === 'task' && (
											<div>
												<div className="mb-2 flex items-center gap-2">
													<Badge variant={STATUS_VARIANTS[item.data.status] ?? 'secondary'}>
														{item.data.status}
													</Badge>
													{item.data.metadata?.triggerEvent && (
														<Badge variant="outline" className="font-mono text-xs">
															{item.data.metadata.triggerEvent as string}
														</Badge>
													)}
													<span className="ml-auto text-xs text-muted-foreground">
														{formatRelativeTime(item.data.createdAt)}
													</span>
												</div>
												<Link
													to={`/tasks/${item.data.id}`}
													className="text-sm text-primary hover:underline"
												>
													Task {item.data.id}
												</Link>
												{item.data.flowId && (
													<div className="mt-1 font-mono text-xs text-muted-foreground">
														{item.data.flowId}
													</div>
												)}
											</div>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Right sidebar */}
			<div className="col-span-1 space-y-4">
				<div>
					<Label htmlFor="status">Status</Label>
					<div className="mt-1">
						<SelectWithSpinner
							value={localStatus}
							onValueChange={newStatus => void handleStatusChange(newStatus)}
							loading={statusSaving}
						>
							<SelectTrigger id="status" className="w-48">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="backlog">Backlog</SelectItem>
								<SelectItem value="todo">Todo</SelectItem>
								<SelectItem value="in_progress">In Progress</SelectItem>
								<SelectItem value="done">Done</SelectItem>
								<SelectItem value="cancelled">Cancelled</SelectItem>
								<SelectItem value="pending_integration">Pending Integration</SelectItem>
								<SelectItem value="integrated">Integrated</SelectItem>
							</SelectContent>
						</SelectWithSpinner>
					</div>
				</div>

				<div>
					<Label>Labels</Label>
					<div className="mt-2 flex flex-wrap gap-1">
						{ticket.labels.map(label => (
							<Badge key={label} variant="outline" className="text-xs">
								{label}
							</Badge>
						))}
						{ticket.labels.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
					</div>
				</div>

				<div>
					<Label>Custom Fields</Label>
					<div className="mt-2 space-y-1">
						{Object.entries(ticket.fields).map(([key, value]) => (
							<div key={key} className="text-xs">
								<span className="font-medium text-muted-foreground">{key}:</span> {value}
							</div>
						))}
						{Object.keys(ticket.fields).length === 0 && (
							<p className="text-xs text-muted-foreground">None</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
