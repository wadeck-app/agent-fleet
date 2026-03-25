import { useEffect, useRef, useState } from 'react';

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
import { cn } from '@framework/lib/utils';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Ticket, TicketStatus } from '@shared/api/tickets.contract';
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';

import { FlowFeedbackSection } from './FlowFeedbackSection';
import { FlowProposalSection } from './FlowProposalSection';
import { TicketActivitySection } from './TicketActivitySection';
import { TicketAuditLogSection } from './TicketAuditLogSection';
import { TicketCommentsSection } from './TicketCommentsSection';
import { TriggeredTasksSection } from './TriggeredTasksSection';
import { ticketsApi } from './tickets.api';
import { useFlowFeedbackCount } from './useFlowFeedbackCount';
import { useFlowProposals } from './useFlowProposals';
import { useProjectStatusConfig } from './useProjectStatusConfig';
import { useTicketActivityCount } from './useTicketActivityCount';
import { useTicketAuditCount } from './useTicketAuditCount';
import { useTicketCommentsCount } from './useTicketCommentsCount';
import { useTriggeredTasksCount } from './useTriggeredTasksCount';

interface TicketDetailLayoutGProps {
	ticket: Ticket;
	ticketId: string;
	onUpdate: (updates: Partial<Ticket>) => Promise<void>;
	onRefresh: () => Promise<void>;
}

/** Renders the count badge inside a tab trigger, with a spinner while loading. */
function TabCountBadge({ count, loading }: { count: number; loading: boolean }) {
	if (loading) {
		return (
			<>
				{' '}
				(<Loader2 className="inline size-3 animate-spin" />)
			</>
		);
	}
	return <> ({count})</>;
}

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

	// Tab counts — real-time via WS-aware hooks
	const { count: commentsCount, loading: commentsCountLoading } = useTicketCommentsCount(ticketId);
	const { count: tasksCount, loading: tasksCountLoading } = useTriggeredTasksCount(ticketId);
	const { count: auditCount, loading: auditCountLoading } = useTicketAuditCount(ticketId);
	const { count: activityCount, loading: activityCountLoading } = useTicketActivityCount(ticketId);
	const { count: feedbackCount, loading: feedbackCountLoading } = useFlowFeedbackCount(
		ticket.currentFlowProposalId,
		ticketId
	);
	// Eager fetch for the Flow Design tab count badge — mirrors the pattern of other tab count hooks.
	// FlowProposalSection fetches its own data independently when it first mounts.
	const flowProposals = useFlowProposals(ticketId);

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

	// Sync local state with ticket — only reset fields that have no pending dirty changes
	useEffect(() => {
		setLocalStatus(ticket.status);
		// Only reset labels if the user has no pending changes (prevents overwriting in-progress edits)
		setDirtyFields(prev => {
			if (!prev.labels) {
				setLocalLabels(ticket.labels);
			}
			return prev;
		});

		const fieldsArray = Object.entries(ticket.fields).map(([key, value]) => ({
			id: crypto.randomUUID(),
			key,
			value,
		}));
		const setItems = fieldsItems.actions.set;
		setItems(fieldsArray);

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
							<TabsTrigger value="comments">
								Comments
								<TabCountBadge count={commentsCount} loading={commentsCountLoading} />
							</TabsTrigger>
							<TabsTrigger value="tasks">
								Triggered
								<TabCountBadge count={tasksCount} loading={tasksCountLoading} />
							</TabsTrigger>
							<TabsTrigger value="audit">
								Audit
								<TabCountBadge count={auditCount} loading={auditCountLoading} />
							</TabsTrigger>
							<TabsTrigger value="activity">
								Activity
								<TabCountBadge count={activityCount} loading={activityCountLoading} />
							</TabsTrigger>
							{/* cb fix: use proposals.length from the API response (with spinner while loading),
							    not ticket.currentFlowProposalId which is pre-loaded and shows instantly */}
							<TabsTrigger value="flow">
								Flow Design
								<TabCountBadge
									count={flowProposals.proposals.length}
									loading={flowProposals.isLoading}
								/>
							</TabsTrigger>
							{ticket.currentFlowProposalId ? (
								<TabsTrigger value="feedback">
									{/* ca fix: show spinner while loading, then count when available */}
									Feedback
									<TabCountBadge count={feedbackCount} loading={feedbackCountLoading} />
								</TabsTrigger>
							) : (
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											{/* span wrapper required: disabled button does not fire mouse events for tooltip */}
											<span>
												<TabsTrigger value="feedback" disabled>
													Feedback
													<TabCountBadge
														count={feedbackCount}
														loading={feedbackCountLoading}
													/>
												</TabsTrigger>
											</span>
										</TooltipTrigger>
										<TooltipContent>
											<p>Request a flow design first</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}
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

					<TabsContent value="feedback">
						{ticket.currentFlowProposalId ? (
							<FlowFeedbackSection
								ticketId={ticketId}
								flowRetrospectiveId={ticket.flowRetrospectiveId}
								currentFlowProposalId={ticket.currentFlowProposalId}
								onFeedbackSubmitted={() => {}}
								sortOrder={sortOrder}
							/>
						) : (
							<p className="py-4 text-sm text-muted-foreground">
								No flow design has been requested yet. Use the Flow Design tab to request one.
							</p>
						)}
					</TabsContent>

					<TabsContent value="activity">
						<TicketActivitySection ticketId={ticketId} sortOrder={sortOrder} />
					</TabsContent>
				</TabsWithUrlState>
			</div>

			{/* Right sidebar (25%): Status + Labels + Custom Fields — stacked layout */}
			<div className="col-span-1">
				<div className="flex flex-col gap-4">
					{/* Status */}
					<div className="flex flex-col gap-1">
						<Label htmlFor="status" className="text-sm font-medium">
							Status
						</Label>
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
								{/* Fallback: show raw status value when config hasn't loaded yet — bug #5 */}
								{!statusConfig.statuses.find(s => s.id === localStatus) && (
									<SelectItem value={localStatus}>{localStatus}</SelectItem>
								)}
							</SelectContent>
						</SelectWithSpinner>
					</div>

					{/* Labels */}
					{/* T7 fix: sr-only label associates "Labels" text with the input */}
					<Label htmlFor="labels-input" className="sr-only">
						Labels
					</Label>
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-1 text-sm font-medium">
							Labels
							{dirtyFields.labels &&
								(() => {
									const removedCount = ticket.labels.filter(l => !localLabels.includes(l)).length;
									const addedCount = localLabels.filter(l => !ticket.labels.includes(l)).length;
									return (
										<span className="flex gap-1 text-xs">
											{addedCount > 0 && (
												<span className="font-medium text-primary">+{addedCount}</span>
											)}
											{removedCount > 0 && (
												<span className="font-medium text-destructive">−{removedCount}</span>
											)}
										</span>
									);
								})()}
						</div>
						<div
							className={cn(
								'rounded-md py-1 transition-all',
								dirtyFields.labels && 'ring-2 ring-primary',
								saving && 'opacity-50 pointer-events-none'
							)}
						>
							<div className="space-y-2">
								<div className="flex flex-wrap gap-2">
									{localLabels.map(label => {
										const isNew = !ticket.labels.includes(label);
										return (
											<Badge
												key={label}
												variant="outline"
												className={cn(
													'cursor-pointer rounded-full px-2 py-1 text-sm',
													isNew && 'ring-1 ring-primary'
												)}
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
									{localLabels.length === 0 && <p className="text-sm text-muted-foreground">None</p>}
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
									id="labels-input"
									placeholder="Type label and press Enter..."
									className="w-full text-sm"
								/>
							</div>
						</div>
					</div>

					{/* Custom Fields */}
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-1 text-sm font-medium">
							Custom Fields
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
									const removed = Object.keys(ticket.fields).filter(
										k => !(k in currentFields)
									).length;
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
						<div
							className={cn(
								'rounded-md py-1 transition-all',
								fieldsChanged && 'ring-2 ring-primary',
								saving && 'opacity-50 pointer-events-none'
							)}
						>
							<div className="space-y-2">
								{fieldsItems.fstate.items.length === 0 ? (
									<p className="text-sm text-muted-foreground">No custom fields</p>
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
										onClick={() =>
											fieldsItems.actions.add({ id: crypto.randomUUID(), key: '', value: '' })
										}
									>
										+ Add Field
									</Button>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
