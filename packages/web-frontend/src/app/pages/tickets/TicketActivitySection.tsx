import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';

import { Badge } from '@framework/components/primitives/Badge';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Task, TaskStatus } from '@shared/api/tasks.contract';
import type { TicketComment, TicketHistoryEntry } from '@shared/api/tickets.contract';
import { Loader2, MessageSquare, Zap } from 'lucide-react';
import remarkGfm from 'remark-gfm';

import { tasksApi } from '../tasks/tasks.api';
import { CommentPermalink } from './components/CommentPermalink';
import { ticketsApi } from './tickets.api';

type TimelineItem =
	| { type: 'comment'; id: string; createdAt: string; data: TicketComment }
	| { type: 'task'; id: string; createdAt: string; data: Task }
	| { type: 'feedback'; id: string; createdAt: string; data: TicketHistoryEntry };

const TASK_STATUS_VARIANTS: Record<
	TaskStatus,
	'default' | 'secondary' | 'info' | 'success' | 'warning' | 'destructive'
> = {
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

interface TicketActivitySectionProps {
	ticketId: string;
	sortOrder: 'asc' | 'desc';
}

export function TicketActivitySection({ ticketId, sortOrder }: TicketActivitySectionProps) {
	const [timeline, setTimeline] = useState<TimelineItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchTimeline = async () => {
			try {
				setLoading(true);
				const [commentsRes, tasksRes, historyRes] = await Promise.all([
					ticketsApi.getComments(ticketId),
					tasksApi.getTasksList({ ticketId, pageSize: 100 }),
					ticketsApi.getHistory(ticketId),
				]);

				const feedbackEntries = historyRes.entries.filter(e => e.event === 'flow.feedback_submitted');

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
					...feedbackEntries.map(e => ({
						type: 'feedback' as const,
						id: e.id,
						createdAt: e.timestamp,
						data: e,
					})),
				];

				items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
				setTimeline(items);
			} catch (err) {
				console.error('Failed to fetch timeline:', err);
			} finally {
				setLoading(false);
			}
		};

		void fetchTimeline();
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

	if (loading) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Loading...</p>
			</div>
		);
	}

	if (timeline.length === 0) {
		return <p className="py-4 text-sm text-muted-foreground">No activity yet</p>;
	}

	const sorted = sortOrder === 'desc' ? [...timeline].reverse() : timeline;

	return (
		<div className="mt-4 space-y-4">
			{sorted.map(item => (
				<div key={`${item.type}-${item.id}`} className="flex gap-3">
					<div className="flex flex-col items-center">
						<div
							className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
								item.type === 'comment'
									? 'bg-muted'
									: item.type === 'feedback'
										? 'bg-success/20'
										: 'bg-accent'
							}`}
						>
							{item.type === 'comment' ? (
								<MessageSquare className="size-4 text-muted-foreground" />
							) : item.type === 'feedback' ? (
								<span className="text-xs font-bold text-success">★</span>
							) : (
								<Zap className="size-4 text-accent-foreground" />
							)}
						</div>
						{item !== timeline[timeline.length - 1] && <div className="h-full w-px bg-border" />}
					</div>

					<div
						id={item.type === 'comment' ? `comment-${item.id}` : undefined}
						className="mb-1 flex-1 rounded-md border bg-card p-4"
					>
						{item.type === 'comment' && (
							<div>
								<div className="mb-2 flex items-center gap-2">
									{item.data.author && (
										<Badge variant="outline" className="text-xs">
											{item.data.author}
										</Badge>
									)}
									<CommentPermalink commentId={item.id} createdAt={item.data.createdAt} />
								</div>
								<div className="max-w-none text-sm">
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										components={{
											p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
											strong: ({ children }) => <strong className="font-bold">{children}</strong>,
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
											ul: ({ children }) => <ul className="my-1 ml-4 list-disc">{children}</ul>,
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
										{item.data.content}
									</ReactMarkdown>
								</div>
							</div>
						)}

						{item.type === 'task' && (
							<div>
								<div className="mb-2 flex items-center gap-2">
									<Badge variant={TASK_STATUS_VARIANTS[item.data.status] ?? 'secondary'}>
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
								<Link to={`/tasks/${item.data.id}`} className="text-sm text-primary hover:underline">
									Task {item.data.id}
								</Link>
								{item.data.flowId && (
									<div className="mt-1 font-mono text-xs text-muted-foreground">
										{item.data.flowId}
									</div>
								)}
							</div>
						)}

						{item.type === 'feedback' && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<Badge variant="success" className="text-xs">
										Feedback
									</Badge>
									{item.data.author && (
										<Badge variant="outline" className="text-xs">
											{item.data.author}
										</Badge>
									)}
									<span className="ml-auto text-xs text-muted-foreground">
										{formatRelativeTime(item.data.timestamp)}
									</span>
								</div>
								{(item.data.data.rating as number) > 0 && (
									<p className="text-sm">
										Rating: <strong>{item.data.data.rating as number}/5</strong>
									</p>
								)}
								{(item.data.data.wentWell as string[] | undefined)?.length ? (
									<div className="space-y-0.5">
										<p className="text-xs text-muted-foreground">What went well</p>
										<ul className="list-disc list-inside">
											{(item.data.data.wentWell as string[]).map((w, i) => (
												<li key={i} className="text-sm">
													{w}
												</li>
											))}
										</ul>
									</div>
								) : null}
								{(item.data.data.wentWrong as string[] | undefined)?.length ? (
									<div className="space-y-0.5">
										<p className="text-xs text-muted-foreground">What went wrong</p>
										<ul className="list-disc list-inside">
											{(item.data.data.wentWrong as string[]).map((w, i) => (
												<li key={i} className="text-sm">
													{w}
												</li>
											))}
										</ul>
									</div>
								) : null}
								{(item.data.data.suggestions as string[] | undefined)?.length ? (
									<div className="space-y-0.5">
										<p className="text-xs text-muted-foreground">Suggestions</p>
										<ul className="list-disc list-inside">
											{(item.data.data.suggestions as string[]).map((s, i) => (
												<li key={i} className="text-sm">
													{s}
												</li>
											))}
										</ul>
									</div>
								) : null}
							</div>
						)}
					</div>
				</div>
			))}
		</div>
	);
}
