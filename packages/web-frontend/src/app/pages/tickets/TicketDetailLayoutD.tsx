import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { EditableListField } from '@framework/components2/list/EditableListField';
import type { KeyValueItem } from '@framework/components2/list/renderers/KeyValueItemRenderer';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { SelectWithSpinner } from '@framework/components/forms/SelectWithSpinner';
import { Textarea } from '@framework/components/forms/Textarea';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { useToast } from '@framework/features/toast/ToastContext';
import { useListItems } from '@framework/hooks2/form/useListItems';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Ticket, TicketStatus } from '@shared/api/tickets.contract';
import { Loader2, Trash2 } from 'lucide-react';

import { KeyValueRendererBasic } from './KeyValueRendererBasic';
import { TicketAuditLogSection } from './TicketAuditLogSection';
import { TicketCommentsSection } from './TicketCommentsSection';
import { TriggeredTasksSection } from './TriggeredTasksSection';
import { ticketsApi } from './tickets.api';
import { useProjectStatusConfig } from './useProjectStatusConfig';

// Status badge variant mapping - keyed by status id, falls back to 'secondary' for unknown statuses
const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'info' | 'success' | 'warning' | 'destructive'> = {
	backlog: 'secondary',
	todo: 'default',
	in_progress: 'info',
	flow_analysis: 'info',
	flow_proposed: 'warning',
	flow_approved: 'success',
	plan_in_review: 'warning',
	plan_approved: 'success',
	done: 'success',
	cancelled: 'destructive',
	pending_integration: 'warning',
	integrated: 'success',
};

function formatStatus(status: TicketStatus): string {
	return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}


interface TicketDetailLayoutDProps {
	ticket: Ticket;
	ticketId: string;
	onRefresh: () => void | Promise<void>;
}

/**
 * Layout D (Linear) - Default full-width layout with collapsible sections
 */
export function TicketDetailLayoutD({ ticket, ticketId, onRefresh }: TicketDetailLayoutDProps) {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { config: statusConfig } = useProjectStatusConfig(ticket.projectId);

	// Local state for editable fields
	const [localTitle, setLocalTitle] = useState('');
	const [localDescription, setLocalDescription] = useState('');
	const [localStatus, setLocalStatus] = useState<TicketStatus>('backlog');
	const [localLabels, setLocalLabels] = useState<string[]>([]);
	const [labelInput, setLabelInput] = useState('');
	const [labelSuggestions, setLabelSuggestions] = useState<string[]>([]);
	const [showLabelSuggestions, setShowLabelSuggestions] = useState(false);
	const [dirtyFields, setDirtyFields] = useState<Partial<Ticket>>({});
	const [saving, setSaving] = useState(false);
	const [statusSaving, setStatusSaving] = useState(false);

	// Sub-tickets
	const [subTickets, setSubTickets] = useState<Ticket[]>([]);
	const [loadingSubTickets, setLoadingSubTickets] = useState(false);

	// Fields editor
	const fieldsItems = useListItems<KeyValueItem>({
		initialItems: [],
	});

	// Sync local state with ticket
	useEffect(() => {
		if (ticket) {
			setLocalTitle(ticket.title);
			setLocalDescription(ticket.description);
			setLocalStatus(ticket.status);
			setLocalLabels(ticket.labels);

			const fieldsArray = Object.entries(ticket.fields).map(([key, value]) => ({
				id: crypto.randomUUID(),
				key,
				value,
			}));
			fieldsItems.actions.set(fieldsArray);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticket]);

	// Load sub-tickets
	useEffect(() => {
		const loadSubTickets = async () => {
			try {
				setLoadingSubTickets(true);
				const response = await ticketsApi.getTicketsList({ parentId: ticketId });
				setSubTickets(response.items);
			} catch (err) {
				console.error('Failed to load sub-tickets:', err);
			} finally {
				setLoadingSubTickets(false);
			}
		};

		loadSubTickets();
	}, [ticketId]);

	// Load label suggestions
	useEffect(() => {
		if (!ticket?.projectId || labelInput.length < 1) {
			setLabelSuggestions([]);
			return;
		}

		const loadSuggestions = async () => {
			try {
				const response = await ticketsApi.getLabels({ projectId: ticket.projectId, q: labelInput });
				setLabelSuggestions(response.labels.filter(l => !localLabels.includes(l)));
			} catch (err) {
				console.error('Failed to load label suggestions:', err);
			}
		};

		const timeoutId = setTimeout(loadSuggestions, 300);
		return () => clearTimeout(timeoutId);
	}, [labelInput, ticket?.projectId, localLabels]);

	const handleTitleChange = (value: string) => {
		setLocalTitle(value);
		if (value !== ticket?.title) {
			setDirtyFields(prev => ({ ...prev, title: value }));
		} else {
			setDirtyFields(prev => {
				const { title: _title, ...rest } = prev;
				return rest;
			});
		}
	};

	const handleDescriptionChange = (value: string) => {
		setLocalDescription(value);
		if (value !== ticket?.description) {
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

	const handleAddLabel = (label: string) => {
		if (!label.trim() || localLabels.includes(label)) {
			return;
		}
		const newLabels = [...localLabels, label.trim()];
		setLocalLabels(newLabels);
		setLabelInput('');
		setShowLabelSuggestions(false);
		setDirtyFields(prev => ({ ...prev, labels: newLabels }));
	};

	const handleRemoveLabel = (label: string) => {
		const newLabels = localLabels.filter(l => l !== label);
		setLocalLabels(newLabels);
		setDirtyFields(prev => ({ ...prev, labels: newLabels }));
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

		if (JSON.stringify(fieldsObject) !== JSON.stringify(ticket?.fields)) {
			allDirtyFields.fields = fieldsObject;
		}

		if (Object.keys(allDirtyFields).length === 0 || saving) return;

		setSaving(true);
		try {
			await ticketsApi.updateTicket(ticketId, {
				...allDirtyFields,
				version: ticket.version,
			});
			await onRefresh();
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
		) !== JSON.stringify(ticket?.fields);

	const hasDirtyFields = Object.keys(dirtyFields).length > 0 || fieldsChanged;

	const handleDelete = async () => {
		if (!confirm('Are you sure you want to delete this ticket?')) {
			return;
		}

		try {
			await ticketsApi.deleteTicket(ticketId);
			navigate('/tickets');
		} catch (err) {
			console.error('Failed to delete ticket:', getErrorMessage(err));
			showToast(`Failed to delete ticket: ${getErrorMessage(err)}`, 'error');
		}
	};

	return (
		<div className="space-y-6">
			{/* Header Row: Title, Status, Delete */}
			<div className="relative flex items-end gap-4">
				<div className="flex-1">
					<Label htmlFor="ticket-title">Title</Label>
					<Input
						id="ticket-title"
						value={localTitle}
						onChange={e => handleTitleChange(e.target.value)}
						placeholder="Ticket title"
						autoComplete="off"
						className={`mt-1 text-lg font-medium ${dirtyFields.title ? 'ring-2 ring-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary' : ''} ${saving ? 'opacity-50 transition-opacity' : ''}`}
					/>
				</div>
				<div className="w-48">
					<Label htmlFor="ticket-status">Status</Label>
					<div className="mt-1">
						<SelectWithSpinner
							value={localStatus}
							onValueChange={newStatus => void handleStatusChange(newStatus)}
							loading={statusSaving}
						>
							<SelectTrigger id="ticket-status" className="w-48">
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
					<Button variant="destructive" onClick={handleDelete}>
						<Trash2 className="size-4" />
						Delete
					</Button>
				</div>
			</div>

			{/* Description */}
			<div className="relative">
				<Label htmlFor="ticket-description">Description</Label>
				<Textarea
					id="ticket-description"
					value={localDescription}
					onChange={e => handleDescriptionChange(e.target.value)}
					placeholder="Ticket description"
					rows={6}
					className={`mt-1 ${dirtyFields.description ? 'ring-2 ring-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary' : ''} ${saving ? 'opacity-50 transition-opacity' : ''}`}
				/>
			</div>

			{/* Labels */}
			<div className="relative">
				{/* T5 fix: connect label to input via htmlFor/id */}
				<Label htmlFor="label-input">Labels</Label>
				<div className="mt-2 space-y-2">
					<div className="flex flex-wrap gap-2">
						{localLabels.map(label => (
							<Badge key={label} variant="outline" className="cursor-pointer px-3 py-1 text-sm">
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
							id="label-input"
							placeholder="Type label and press Enter to add..."
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
			<div className="relative">
				<EditableListField
					label="Custom Fields"
					items={fieldsItems}
					renderItem={(item, _index, actions) => <KeyValueRendererBasic item={item} actions={actions} />}
					addButtonLabel="Add Field"
					emptyMessage="No custom fields"
					createDefault={() => ({ id: crypto.randomUUID(), key: '', value: '' })}
					getItemId={item => item.id}
				/>
			</div>

			{/* Batch Save Button */}
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

			{/* Sub-tickets */}
			<div>
				<Label>Sub-tickets</Label>
				{loadingSubTickets && <p className="text-sm text-muted-foreground">Loading sub-tickets...</p>}
				{!loadingSubTickets && subTickets.length === 0 && (
					<p className="text-sm text-muted-foreground">No sub-tickets</p>
				)}
				{!loadingSubTickets && subTickets.length > 0 && (
					<div className="mt-2 space-y-2">
						{subTickets.map(subTicket => (
							<Link
								key={subTicket.id}
								to={`/tickets/${subTicket.id}`}
								className="block rounded-md border bg-card p-3 hover:bg-accent"
							>
								<div className="flex items-center justify-between">
									<span className="font-medium">{subTicket.title}</span>
									<Badge variant={STATUS_VARIANTS[subTicket.status] ?? 'secondary'}>
										{formatStatus(subTicket.status)}
									</Badge>
								</div>
							</Link>
						))}
					</div>
				)}
			</div>

			{/* Triggered Tasks */}
			<TriggeredTasksSection ticketId={ticketId} />

			{/* Audit Log */}
			<TicketAuditLogSection ticketId={ticketId} />

			{/* Comments */}
			<TicketCommentsSection ticketId={ticketId} />
		</div>
	);
}
