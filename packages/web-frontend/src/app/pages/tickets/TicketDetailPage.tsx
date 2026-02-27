import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { ItemActions } from '@framework/components2/list/EditableListField';
import { EditableListField } from '@framework/components2/list/EditableListField';
import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';
import { ErrorAlert } from '@framework/components/feedback/ErrorAlert';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Textarea } from '@framework/components/forms/Textarea';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { LoadingSpinner } from '@framework/components/loading/LoadingSpinner';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { useListItems } from '@framework/hooks2/form/useListItems';
import { cn } from '@framework/lib/utils';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Ticket, TicketStatus } from '@shared/api/tickets.contract';
import { ArrowLeft, Trash2 } from 'lucide-react';

import { ticketsApi } from './tickets.api';
import { useTicket } from './useTicket';

/**
 * Status badge variant mapping
 */
const STATUS_VARIANTS: Record<TicketStatus, 'default' | 'secondary' | 'info' | 'success' | 'warning' | 'destructive'> =
	{
		backlog: 'secondary',
		todo: 'default',
		in_progress: 'info',
		done: 'success',
		cancelled: 'destructive',
		pending_integration: 'warning',
		integrated: 'success',
	};

/**
 * Format status for display
 */
function formatStatus(status: TicketStatus): string {
	return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Key-Value field item interface
 */
interface KeyValueItem {
	key: string;
	value: string;
}

/**
 * Key-Value field renderer for EditableListField
 */
function KeyValueRenderer({ item, actions }: { item: KeyValueItem; actions: ItemActions<KeyValueItem> }) {
	return (
		<div className="flex gap-2 rounded-md border bg-card p-3">
			<div className="flex-1 space-y-1">
				<Label htmlFor={`key-${item.key}`} className="text-xs">
					Key
				</Label>
				<Input
					id={`key-${item.key}`}
					value={item.key}
					onChange={e => actions.update({ key: e.target.value })}
					placeholder="key"
					className="h-8"
				/>
			</div>

			<div className="flex-1 space-y-1">
				<Label htmlFor={`value-${item.key}`} className="text-xs">
					Value
				</Label>
				<Input
					id={`value-${item.key}`}
					value={item.value}
					onChange={e => actions.update({ value: e.target.value })}
					placeholder="value"
					className="h-8"
				/>
			</div>

			<div className="flex items-end">
				<RemoveItemButton onRemove={actions.remove} title="Remove field" />
			</div>
		</div>
	);
}

/**
 * ===========================================================================================
 * TICKET DETAIL PAGE
 * ===========================================================================================
 *
 * Full ticket detail page with inline editing.
 *
 * Sections:
 * 1. Header: Editable title, status select, delete button
 * 2. Description: Editable textarea
 * 3. Labels: Multi-select with autocomplete
 * 4. Fields: Key-value editor
 * 5. Sub-tickets: List of child tickets
 * 6. Tasks: List of linked task IDs
 *
 * All edits use optimistic locking with version field.
 *
 * ===========================================================================================
 */
export function TicketDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { ticket, loading, error, refresh } = useTicket(id);

	// Local state for editable fields
	const [localTitle, setLocalTitle] = useState('');
	const [localDescription, setLocalDescription] = useState('');
	const [localStatus, setLocalStatus] = useState<TicketStatus>('backlog');
	const [localLabels, setLocalLabels] = useState<string[]>([]);
	const [labelInput, setLabelInput] = useState('');
	const [labelSuggestions, setLabelSuggestions] = useState<string[]>([]);
	const [showLabelSuggestions, setShowLabelSuggestions] = useState(false);
	const [savingField, setSavingField] = useState<string | null>(null);

	// Sub-tickets and tasks
	const [subTickets, setSubTickets] = useState<Ticket[]>([]);
	const [loadingSubTickets, setLoadingSubTickets] = useState(false);

	// Fields editor
	const fieldsItems = useListItems<KeyValueItem>({
		initialItems: [],
	});

	// Sync local state with ticket
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (ticket) {
			setLocalTitle(ticket.title);
			setLocalDescription(ticket.description);
			setLocalStatus(ticket.status);
			setLocalLabels(ticket.labels);

			// Convert fields object to array
			const fieldsArray = Object.entries(ticket.fields).map(([key, value]) => ({ key, value }));
			fieldsItems.actions.set(fieldsArray);
		}
		// Only re-sync when the ticket itself changes, not when the actions reference changes
	}, [ticket]); // eslint-disable-line react-hooks/exhaustive-deps

	// Load sub-tickets
	useEffect(() => {
		if (!id) {
			return;
		}

		const loadSubTickets = async () => {
			try {
				setLoadingSubTickets(true);
				const response = await ticketsApi.getTicketsList({ parentId: id });
				setSubTickets(response.items);
			} catch (err) {
				console.error('Failed to load sub-tickets:', err);
			} finally {
				setLoadingSubTickets(false);
			}
		};

		loadSubTickets();
	}, [id]);

	// Load label suggestions
	useEffect(() => {
		if (!ticket?.projectId || labelInput.length < 1) {
			setLabelSuggestions([]);
			return;
		}

		const loadSuggestions = async () => {
			try {
				const response = await ticketsApi.getLabels({ projectId: ticket.projectId, q: labelInput });
				// Filter out already selected labels
				setLabelSuggestions(response.labels.filter(l => !localLabels.includes(l)));
			} catch (err) {
				console.error('Failed to load label suggestions:', err);
			}
		};

		// Debounce
		const timeoutId = setTimeout(loadSuggestions, 300);
		return () => clearTimeout(timeoutId);
	}, [labelInput, ticket?.projectId, localLabels]);

	// Update ticket helper
	const updateTicket = useCallback(
		async (field: string, updates: Partial<Ticket>, revertFn?: () => void) => {
			if (!ticket || !id) {
				return;
			}
			setSavingField(field);
			try {
				await ticketsApi.updateTicket(id, {
					...updates,
					version: ticket.version,
				});
				// Await refresh so the saving indicator stays visible until data reloads
				await refresh();
			} catch (err) {
				setSavingField(null);
				revertFn?.();
				console.error('Failed to update ticket:', getErrorMessage(err));
				// Show error to user
				alert(`Failed to update ticket: ${getErrorMessage(err)}`);
			} finally {
				setSavingField(null);
			}
		},
		[ticket, id, refresh]
	);

	// Handle title blur
	const handleTitleBlur = () => {
		if (localTitle !== ticket?.title) {
			updateTicket('title', { title: localTitle }, () => setLocalTitle(ticket!.title));
		}
	};

	// Handle description blur
	const handleDescriptionBlur = () => {
		if (localDescription !== ticket?.description) {
			updateTicket('description', { description: localDescription }, () =>
				setLocalDescription(ticket!.description)
			);
		}
	};

	// Handle status change
	const handleStatusChange = (newStatus: string) => {
		const previousStatus = localStatus;
		setLocalStatus(newStatus as TicketStatus);
		updateTicket('status', { status: newStatus as TicketStatus }, () => setLocalStatus(previousStatus));
	};

	// Handle label addition
	const handleAddLabel = (label: string) => {
		if (!label.trim() || localLabels.includes(label)) {
			return;
		}
		const previousLabels = localLabels;
		const newLabels = [...localLabels, label.trim()];
		setLocalLabels(newLabels);
		setLabelInput('');
		setShowLabelSuggestions(false);
		updateTicket('labels', { labels: newLabels }, () => setLocalLabels(previousLabels));
	};

	// Handle label removal
	const handleRemoveLabel = (label: string) => {
		const previousLabels = localLabels;
		const newLabels = localLabels.filter(l => l !== label);
		setLocalLabels(newLabels);
		updateTicket('labels', { labels: newLabels }, () => setLocalLabels(previousLabels));
	};

	// Handle fields save
	const handleFieldsSave = () => {
		// Convert array back to object
		const fieldsObject = fieldsItems.fstate.items.reduce(
			(acc, item) => {
				if (item.key) {
					acc[item.key] = item.value;
				}
				return acc;
			},
			{} as Record<string, string>
		);

		// Store previous fields for revert
		const previousFields = ticket?.fields
			? Object.entries(ticket.fields).map(([key, value]) => ({ key, value }))
			: [];

		updateTicket('fields', { fields: fieldsObject }, () => fieldsItems.actions.set(previousFields));
	};

	// Handle delete
	const handleDelete = async () => {
		if (!id) {
			return;
		}

		if (!confirm('Are you sure you want to delete this ticket?')) {
			return;
		}

		try {
			await ticketsApi.deleteTicket(id);
			navigate('/tickets');
		} catch (err) {
			console.error('Failed to delete ticket:', getErrorMessage(err));
			alert(`Failed to delete ticket: ${getErrorMessage(err)}`);
		}
	};

	if (loading) {
		return (
			<Page>
				<PageHeader title="Loading Ticket..." />
				<div className="flex h-96 items-center justify-center">
					<LoadingSpinner />
				</div>
			</Page>
		);
	}

	if (error || !ticket) {
		return (
			<Page>
				<PageHeader title="Error" />
				<ErrorAlert message={error?.message || 'Ticket not found'} onDismiss={() => navigate('/tickets')} />
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title={ticket.title}
				action={
					<Button variant="outline" size="sm" onClick={() => navigate('/tickets')}>
						<ArrowLeft className="mr-2 size-4" />
						Back to Tickets
					</Button>
				}
			/>

			<div className="space-y-6">
				{/* Header Row: Title, Status, Delete */}
				<div
					className={cn(
						'flex items-start gap-4 transition-opacity duration-300',
						(savingField === 'title' || savingField === 'status') && 'opacity-60 pointer-events-none'
					)}
				>
					<div className="flex-1">
						<Label htmlFor="ticket-title">Title</Label>
						<Input
							id="ticket-title"
							value={localTitle}
							onChange={e => setLocalTitle(e.target.value)}
							onBlur={handleTitleBlur}
							placeholder="Ticket title"
							autoComplete="off"
							className="text-lg font-medium"
						/>
					</div>
					<div className="w-48">
						<Label htmlFor="ticket-status">Status</Label>
						<Select value={localStatus} onValueChange={handleStatusChange}>
							<SelectTrigger id="ticket-status">
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
						</Select>
					</div>
					<div className="pt-6">
						<Button variant="destructive" size="sm" onClick={handleDelete}>
							<Trash2 className="size-4" />
							Delete
						</Button>
					</div>
				</div>

				{/* Description */}
				<div
					className={cn(
						'transition-opacity duration-300',
						savingField === 'description' && 'opacity-60 pointer-events-none'
					)}
				>
					<Label htmlFor="ticket-description">Description</Label>
					<Textarea
						id="ticket-description"
						value={localDescription}
						onChange={e => setLocalDescription(e.target.value)}
						onBlur={handleDescriptionBlur}
						placeholder="Ticket description"
						rows={6}
					/>
				</div>

				{/* Labels */}
				<div
					className={cn(
						'transition-opacity duration-300',
						savingField === 'labels' && 'opacity-60 pointer-events-none'
					)}
				>
					<Label>Labels</Label>
					<div className="space-y-2">
						{/* Selected labels */}
						<div className="flex flex-wrap gap-2">
							{localLabels.map(label => (
								<Badge key={label} variant="outline" className="cursor-pointer">
									{label}
									<Button
										type="button"
										variant="ghost"
										onClick={() => handleRemoveLabel(label)}
										className="ml-2 h-auto p-0 text-muted-foreground hover:text-foreground"
									>
										×
									</Button>
								</Badge>
							))}
						</div>

						{/* Label input with autocomplete */}
						<div className="relative">
							<Input
								value={labelInput}
								onChange={e => setLabelInput(e.target.value)}
								onFocus={() => setShowLabelSuggestions(true)}
								onBlur={() => setTimeout(() => setShowLabelSuggestions(false), 200)}
								onKeyDown={e => {
									if (e.key === 'Enter') {
										e.preventDefault();
										handleAddLabel(labelInput);
									}
								}}
								placeholder="Type to add label..."
								className="w-full"
							/>
							{showLabelSuggestions && labelSuggestions.length > 0 && (
								<div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
									{labelSuggestions.slice(0, 5).map(suggestion => (
										<Button
											key={suggestion}
											type="button"
											variant="ghost"
											onClick={() => handleAddLabel(suggestion)}
											className="block w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
										>
											{suggestion}
										</Button>
									))}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Fields (Key-Value Pairs) */}
				<div
					className={cn(
						'transition-opacity duration-300',
						savingField === 'fields' && 'opacity-60 pointer-events-none'
					)}
				>
					<EditableListField
						label="Custom Fields"
						items={fieldsItems}
						renderItem={(item, _index, actions) => <KeyValueRenderer item={item} actions={actions} />}
						addButtonLabel="Add Field"
						emptyMessage="No custom fields"
						createDefault={() => ({ key: '', value: '' })}
						getItemId={(item, index) => item.key || `field-${index}`}
					/>
					<Button variant="outline" size="sm" onClick={handleFieldsSave} className="mt-2">
						Save Fields
					</Button>
				</div>

				{/* Sub-tickets */}
				<div>
					<Label>Sub-tickets</Label>
					{loadingSubTickets && <p className="text-sm text-muted-foreground">Loading sub-tickets...</p>}
					{!loadingSubTickets && subTickets.length === 0 && (
						<p className="text-sm text-muted-foreground">No sub-tickets</p>
					)}
					{!loadingSubTickets && subTickets.length > 0 && (
						<div className="space-y-2">
							{subTickets.map(subTicket => (
								<Link
									key={subTicket.id}
									to={`/tickets/${subTicket.id}`}
									className="block rounded-md border bg-card p-3 hover:bg-accent"
								>
									<div className="flex items-center justify-between">
										<span className="font-medium">{subTicket.title}</span>
										<Badge variant={STATUS_VARIANTS[subTicket.status]}>
											{formatStatus(subTicket.status)}
										</Badge>
									</div>
								</Link>
							))}
						</div>
					)}
				</div>

				{/* Tasks */}
				<div>
					<Label>Linked Tasks</Label>
					{ticket.taskIds.length === 0 && <p className="text-sm text-muted-foreground">No linked tasks</p>}
					{ticket.taskIds.length > 0 && (
						<div className="space-y-2">
							{ticket.taskIds.map(taskId => (
								<Link
									key={taskId}
									to={`/tasks/${taskId}`}
									className="block rounded-md border bg-card p-3 hover:bg-accent"
								>
									<span className="font-mono text-sm">{taskId}</span>
								</Link>
							))}
						</div>
					)}
				</div>
			</div>
		</Page>
	);
}
