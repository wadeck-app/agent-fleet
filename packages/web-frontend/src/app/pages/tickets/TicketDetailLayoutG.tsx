import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';

import type { ItemActions } from '@framework/components2/list/EditableListField';
import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';
import type { KeyValueItem } from '@framework/components2/list/renderers/KeyValueItemRenderer';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { SelectWithSpinner } from '@framework/components/forms/SelectWithSpinner';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import {
	TabsContent,
	TabsList,
	TabsTrigger,
	TabsWithUrlState,
} from '@framework/components/primitives/TabsWithUrlState';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { useToast } from '@framework/features/toast/ToastContext';
import { useListItems } from '@framework/hooks2/form/useListItems';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Task, TaskStatus } from '@shared/api/tasks.contract';
import type { Ticket, TicketComment, TicketStatus } from '@shared/api/tickets.contract';
import { ArrowDown, ArrowUp, Loader2, MessageSquare, Zap } from 'lucide-react';
import remarkGfm from 'remark-gfm';

import { tasksApi } from '../tasks/tasks.api';
import { FlowProposalSection } from './FlowProposalSection';
import { TicketAuditLogSection } from './TicketAuditLogSection';
import { TicketCommentsSection } from './TicketCommentsSection';
import { TriggeredTasksSection } from './TriggeredTasksSection';
import { CommentPermalink } from './components/CommentPermalink';
import { ticketsApi } from './tickets.api';
import { useProjectStatusConfig } from './useProjectStatusConfig';

interface TicketDetailLayoutGProps {
	ticket: Ticket;
	ticketId: string;
	onUpdate: (updates: Partial<Ticket>) => Promise<void>;
	onRefresh: () => Promise<void>;
}

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

type TimelineItem =
	| { type: 'comment'; id: string; createdAt: string; data: TicketComment }
	| { type: 'task'; id: string; createdAt: string; data: Task };

// KeyValueRenderer component for custom fields
function KeyValueRenderer({
	item,
	actions,
	originalFields,
	originalKey,
}: {
	item: KeyValueItem;
	actions: ItemActions<KeyValueItem>;
	originalFields?: Record<string, string>;
	/** undefined = newly added row (not from saved ticket) */
	originalKey?: string;
}) {
	// New row: originalKey not in map → ring on CARD
	// Existing row key changed → ring on KEY input
	// Existing row value changed → ring on VALUE input
	const isAddedRow = originalKey === undefined;
	const isKeyModified = !isAddedRow && item.key !== originalKey;
	const isValueModified =
		!isAddedRow && originalKey !== undefined && item.value !== (originalFields ?? {})[originalKey];

	return (
		<div className={`flex gap-2 rounded-md border bg-card p-3 ${isAddedRow ? 'ring-1 ring-primary' : ''}`}>
			<div className="flex-1 space-y-1">
				<Label htmlFor={`key-${item.id}`} className="text-xs">
					Key
				</Label>
				<Input
					id={`key-${item.id}`}
					value={item.key}
					onChange={e => actions.update({ key: e.target.value })}
					placeholder="key"
					className={`h-8 ${isKeyModified ? 'ring-1 ring-primary' : ''}`}
				/>
			</div>

			<div className="flex-1 space-y-1">
				<Label htmlFor={`value-${item.id}`} className="text-xs">
					Value
				</Label>
				<Input
					id={`value-${item.id}`}
					value={item.value}
					onChange={e => actions.update({ value: e.target.value })}
					placeholder="value"
					className={`h-8 ${isValueModified ? 'ring-1 ring-primary' : ''}`}
				/>
			</div>

			<div className="flex items-end">
				<RemoveItemButton onRemove={actions.remove} title="Remove field" />
			</div>
		</div>
	);
}

/**
 * Layout G - Two-column: main (description + tabs) / sidebar (status + labels + fields)
 * Tabs: Comments, Triggered Tasks, History, Audit, Activity Timeline (from E)
 */
export function TicketDetailLayoutG({ ticket, ticketId, onUpdate, onRefresh }: TicketDetailLayoutGProps) {
	const { showToast } = useToast();
	const { config: statusConfig } = useProjectStatusConfig(ticket.projectId);
	const titleRef = useRef<HTMLDivElement>(null);
	const descriptionRef = useRef<HTMLDivElement>(null);
	const [localStatus, setLocalStatus] = useState<TicketStatus>(ticket.status);
	const [localLabels, setLocalLabels] = useState<string[]>(ticket.labels);
	const [labelInput, setLabelInput] = useState('');
	const [dirtyFields, setDirtyFields] = useState<Partial<Ticket>>({});
	const [saving, setSaving] = useState(false);
	const [statusSaving, setStatusSaving] = useState(false);
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

	// Fields editor
	const fieldsItems = useListItems<KeyValueItem>({
		initialItems: [],
	});
	// Tracks the original key of each item by ID (undefined = newly added row)
	const [originalKeys, setOriginalKeys] = useState<Record<string, string>>({});

	// Tab counts
	const [commentsCount, setCommentsCount] = useState(0);
	const [tasksCount, setTasksCount] = useState(0);
	const [countsLoading, setCountsLoading] = useState(true);

	// Activity timeline
	const [timeline, setTimeline] = useState<TimelineItem[]>([]);
	const [loadingTimeline, setLoadingTimeline] = useState(true);

	// Initialize contentEditable on mount
	useEffect(() => {
		if (titleRef.current) {
			titleRef.current.textContent = ticket.title;
		}
		if (descriptionRef.current) {
			descriptionRef.current.textContent = ticket.description;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Sync local state with ticket
	useEffect(() => {
		setLocalStatus(ticket.status);
		setLocalLabels(ticket.labels);

		const fieldsArray = Object.entries(ticket.fields).map(([key, value]) => ({
			id: crypto.randomUUID(),
			key,
			value,
		}));
		fieldsItems.actions.set(fieldsArray);

		// Track original keys for dirty-state detection in KeyValueRenderer
		const newOrigKeys: Record<string, string> = {};
		fieldsArray.forEach(item => {
			newOrigKeys[item.id] = item.key;
		});
		setOriginalKeys(newOrigKeys);

		// Update contentEditable DOM when ticket changes (avoid updating during edit)
		if (titleRef.current && document.activeElement !== titleRef.current) {
			titleRef.current.textContent = ticket.title;
		}
		if (descriptionRef.current && document.activeElement !== descriptionRef.current) {
			descriptionRef.current.textContent = ticket.description;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticket]);

	// Fetch tab counts
	useEffect(() => {
		const fetchCounts = async () => {
			try {
				setCountsLoading(true);
				const [commentsRes, tasksRes] = await Promise.all([
					ticketsApi.getComments(ticketId),
					tasksApi.getTasksList({ ticketId, pageSize: 1 }),
				]);
				setCommentsCount(commentsRes.comments.length);
				setTasksCount(tasksRes.pagination?.total || 0);
			} catch (err) {
				console.error('Failed to fetch counts:', err);
			} finally {
				setCountsLoading(false);
			}
		};

		fetchCounts();
	}, [ticketId]);

	// Fetch activity timeline (comments + tasks interleaved, sorted by date)
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

	const handleTitleChange = (value: string) => {
		if (value !== ticket.title) {
			setDirtyFields(prev => ({ ...prev, title: value }));
		} else {
			setDirtyFields(prev => {
				const { title: _title, ...rest } = prev;
				return rest;
			});
		}
	};

	const handleDescriptionChange = (value: string) => {
		if (value !== ticket.description) {
			setDirtyFields(prev => ({ ...prev, description: value }));
		} else {
			setDirtyFields(prev => {
				const { description: _description, ...rest } = prev;
				return rest;
			});
		}
	};

	const handleAddLabel = (label: string) => {
		if (!label.trim() || localLabels.includes(label)) {
			return;
		}
		const newLabels = [...localLabels, label.trim()];
		setLocalLabels(newLabels);
		setLabelInput('');
		setDirtyFields(prev => ({ ...prev, labels: newLabels }));
	};

	const handleRemoveLabel = (label: string) => {
		const newLabels = localLabels.filter(l => l !== label);
		setLocalLabels(newLabels);
		setDirtyFields(prev => ({ ...prev, labels: newLabels }));
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
		// Include fields from the EditableListField
		const fieldsObject = fieldsItems.fstate.items.reduce(
			(acc, item) => {
				if (item.key) {
					acc[item.key] = item.value;
				}
				return acc;
			},
			{} as Record<string, string>
		);

		const allDirtyFields = { ...dirtyFields };

		if (JSON.stringify(fieldsObject) !== JSON.stringify(ticket.fields)) {
			allDirtyFields.fields = fieldsObject;
		}

		if (Object.keys(allDirtyFields).length === 0 || saving) return;

		setSaving(true);
		try {
			await onUpdate(allDirtyFields);
			setDirtyFields({});
			// Reset local labels to match what was saved
			if (allDirtyFields.labels) {
				setLocalLabels(allDirtyFields.labels);
			}
			// Reset fieldsItems to match what was saved
			const savedFields = allDirtyFields.fields ?? ticket.fields;
			const resetOrigKeys: Record<string, string> = {};
			const resetItems = Object.entries(savedFields).map(([key, value]) => {
				const id = crypto.randomUUID();
				resetOrigKeys[id] = key;
				return { id, key, value };
			});
			fieldsItems.actions.set(resetItems);
			setOriginalKeys(resetOrigKeys);
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

	const fieldsChanged =
		JSON.stringify(
			fieldsItems.fstate.items.reduce(
				(acc, item) => {
					if (item.key) {
						acc[item.key] = item.value;
					}
					return acc;
				},
				{} as Record<string, string>
			)
		) !== JSON.stringify(ticket.fields);

	const hasDirtyFields = Object.keys(dirtyFields).length > 0 || fieldsChanged;

	return (
		<div className="grid grid-cols-4 gap-6">
			{/* Left main column (75%) */}
			<div className="col-span-3 space-y-6">
				<div className="space-y-2">
					<div
						ref={titleRef}
						contentEditable
						suppressContentEditableWarning
						onInput={e => handleTitleChange(e.currentTarget.textContent ?? '')}
						onBlur={e => handleTitleChange(e.currentTarget.textContent ?? '')}
						className={`mt-1 min-h-[2rem] rounded-md px-1 py-1 text-2xl font-bold outline-none
							cursor-text empty:before:content-['Title...'] empty:before:text-muted-foreground
							focus:ring-2 focus:ring-ring/20 hover:bg-muted/30
							transition-colors
							${dirtyFields.title ? 'ring-2 ring-primary' : ''}
							${saving ? 'opacity-50 pointer-events-none' : ''}`}
					/>
					<div
						ref={descriptionRef}
						contentEditable
						suppressContentEditableWarning
						onInput={e => handleDescriptionChange(e.currentTarget.textContent ?? '')}
						onBlur={e => handleDescriptionChange(e.currentTarget.textContent ?? '')}
						className={`mt-1 min-h-[120px] w-full rounded-md px-1 py-2 text-sm outline-none
							whitespace-pre-wrap cursor-text
							empty:before:content-['Description...'] empty:before:text-muted-foreground
							focus:ring-2 focus:ring-ring/20 hover:bg-muted/30
							transition-colors
							${dirtyFields.description ? 'ring-2 ring-primary' : ''}
							${saving ? 'opacity-50 pointer-events-none' : ''}`}
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
									? `Will save: ${[...Object.keys(dirtyFields), ...(fieldsChanged ? ['custom fields'] : [])].join(', ')}`
									: 'No unsaved changes'}
							</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>

				{/* Tabs */}
				<TabsWithUrlState paramKey="tab" defaultValue="comments">
					<div className="flex items-center justify-between">
						<TabsList>
							<TabsTrigger value="comments">Comments ({countsLoading ? '?' : commentsCount})</TabsTrigger>
							<TabsTrigger value="tasks">Triggered ({countsLoading ? '?' : tasksCount})</TabsTrigger>
							<TabsTrigger value="audit">Audit</TabsTrigger>
							<TabsTrigger value="activity">Activity</TabsTrigger>
							<TabsTrigger value="flow">Flow Design</TabsTrigger>
						</TabsList>
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'))}
										className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
									>
										{sortOrder === 'asc' ? (
											<>
												<ArrowDown className="size-3.5" />
												Oldest first
											</>
										) : (
											<>
												<ArrowUp className="size-3.5" />
												Newest first
											</>
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<p>Click to show {sortOrder === 'asc' ? 'newest' : 'oldest'} first</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>

					<TabsContent value="comments">
						<TicketCommentsSection ticketId={ticketId} sortOrder={sortOrder} showLabel={false} />
					</TabsContent>

					<TabsContent value="tasks">
						<TriggeredTasksSection ticketId={ticketId} sortOrder={sortOrder} showLabel={false} />
					</TabsContent>

					<TabsContent value="audit">
						<TicketAuditLogSection ticketId={ticketId} sortOrder={sortOrder} showLabel={false} />
					</TabsContent>

					<TabsContent value="flow">
						<FlowProposalSection
							ticketId={ticketId}
							onTicketRefresh={() => {
								void onRefresh();
							}}
						/>
					</TabsContent>

					<TabsContent value="activity">
						{loadingTimeline && (
							<div className="flex items-center gap-2 py-4">
								<Loader2 className="size-4 animate-spin text-muted-foreground" />
								<span className="text-sm text-muted-foreground">Loading activity...</span>
							</div>
						)}
						{!loadingTimeline && timeline.length === 0 && (
							<p className="py-4 text-sm text-muted-foreground">No activity yet</p>
						)}
						{!loadingTimeline && timeline.length > 0 && (
							<div className="mt-4 space-y-4">
								{(sortOrder === 'desc' ? [...timeline].reverse() : timeline).map(item => (
									<div key={`${item.type}-${item.id}`} className="flex gap-3">
										<div className="flex flex-col items-center">
											<div
												className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
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
												<div className="h-full w-px bg-border" />
											)}
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
																	<strong className="font-bold">{children}</strong>
																),
																em: ({ children }) => (
																	<em className="italic">{children}</em>
																),
																code: ({ children, className }) => {
																	const isBlock = className?.startsWith('language-');
																	if (isBlock) {
																		return (
																			<code className={className}>
																				{children}
																			</code>
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
																	<ol className="my-1 ml-4 list-decimal">
																		{children}
																	</ol>
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
														<Badge
															variant={
																TASK_STATUS_VARIANTS[item.data.status] ?? 'secondary'
															}
														>
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
					</TabsContent>
				</TabsWithUrlState>
			</div>

			{/* Right sidebar (25%): Status + Labels + Custom Fields */}
			<div className="col-span-1 space-y-4">
				<div>
					<Label htmlFor="status">Status</Label>
					<div className="mt-1">
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
							</SelectContent>
						</SelectWithSpinner>
					</div>
				</div>

				<div
					className={`rounded-md border-2 p-2 transition-colors ${dirtyFields.labels ? 'border-primary' : 'border-transparent'} ${saving ? 'opacity-50 pointer-events-none' : ''}`}
				>
					<div className="flex items-center justify-between">
						<Label>Labels</Label>
						{dirtyFields.labels &&
							(() => {
								const removedCount = ticket.labels.filter(l => !localLabels.includes(l)).length;
								const addedCount = localLabels.filter(l => !ticket.labels.includes(l)).length;
								return (
									<span className="flex gap-1 text-xs">
										{addedCount > 0 && (
											<span className="text-primary font-medium">+{addedCount}</span>
										)}
										{removedCount > 0 && (
											<span className="text-destructive font-medium">−{removedCount}</span>
										)}
									</span>
								);
							})()}
					</div>
					<div className="mt-2 space-y-2">
						<div className="flex flex-wrap gap-2">
							{localLabels.map(label => {
								const isNew = !ticket.labels.includes(label);
								return (
									<Badge
										key={label}
										variant="outline"
										className={`cursor-pointer rounded-full px-2 py-1 text-xs ${isNew ? 'ring-1 ring-primary' : ''}`}
									>
										{label}
										<Button
											type="button"
											variant="ghost"
											onClick={() => handleRemoveLabel(label)}
											className="ml-1 h-auto p-0 text-muted-foreground hover:text-foreground"
										>
											×
										</Button>
									</Badge>
								);
							})}
							{localLabels.length === 0 && <p className="text-xs text-muted-foreground">None</p>}
						</div>
						<Input
							value={labelInput}
							onChange={e => setLabelInput(e.target.value)}
							onKeyDown={e => {
								if (e.key === 'Enter') {
									e.preventDefault();
									handleAddLabel(labelInput);
								}
							}}
							placeholder="Type label and press Enter..."
							className="w-full text-xs"
						/>
					</div>
				</div>

				<div
					className={`rounded-md border-2 p-2 transition-colors ${fieldsChanged ? 'border-primary' : 'border-transparent'} ${saving ? 'opacity-50 pointer-events-none' : ''}`}
				>
					<div className="flex items-center justify-between">
						<Label>Custom Fields</Label>
						{fieldsChanged &&
							(() => {
								const currentFields = fieldsItems.fstate.items.reduce(
									(acc, item) => {
										if (item.key) acc[item.key] = item.value;
										return acc;
									},
									{} as Record<string, string>
								);
								const added = Object.keys(currentFields).filter(k => !(k in ticket.fields)).length;
								const removed = Object.keys(ticket.fields).filter(k => !(k in currentFields)).length;
								const modified = Object.keys(currentFields).filter(
									k => k in ticket.fields && currentFields[k] !== ticket.fields[k]
								).length;
								return (
									<span className="flex gap-1 text-xs">
										{added > 0 && <span className="font-medium text-primary">+{added}</span>}
										{modified > 0 && (
											<span className="font-medium text-foreground">~{modified}</span>
										)}
										{removed > 0 && (
											<span className="font-medium text-destructive">−{removed}</span>
										)}
									</span>
								);
							})()}
					</div>
					<div className="mt-2 space-y-2">
						{fieldsItems.fstate.items.length === 0 ? (
							<p className="text-xs text-muted-foreground">No custom fields</p>
						) : (
							fieldsItems.fstate.items.map((item, index) => (
								<KeyValueRenderer
									key={item.id}
									item={item}
									actions={{
										update: partial => fieldsItems.actions.update(index, partial),
										remove: () => fieldsItems.actions.remove(index),
									}}
									originalFields={ticket.fields}
									originalKey={originalKeys[item.id]}
								/>
							))
						)}
						<div className="flex justify-end">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => fieldsItems.actions.add({ id: crypto.randomUUID(), key: '', value: '' })}
							>
								+ Add Field
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
