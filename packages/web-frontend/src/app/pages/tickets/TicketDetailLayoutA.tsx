import { useState } from 'react';

import { Label } from '@framework/components/forms/Label';
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { SelectWithSpinner } from '@framework/components/forms/SelectWithSpinner';
import { Textarea } from '@framework/components/forms/Textarea';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Ticket, TicketStatus } from '@shared/api/tickets.contract';
import { Loader2 } from 'lucide-react';

import { TicketAuditLogSection } from './TicketAuditLogSection';
import { TicketCommentsSection } from './TicketCommentsSection';
import { TriggeredTasksSection } from './TriggeredTasksSection';
import { ticketsApi } from './tickets.api';
import { useProjectStatusConfig } from './useProjectStatusConfig';

interface TicketDetailLayoutAProps {
	ticket: Ticket;
	ticketId: string;
	onUpdate: (updates: Partial<Ticket>) => Promise<void>;
	onRefresh: () => Promise<void>;
}

/**
 * Layout A (Jira) - Two columns 60/40: left (description + comments), right (metadata)
 */
export function TicketDetailLayoutA({ ticket, ticketId, onUpdate, onRefresh }: TicketDetailLayoutAProps) {
	const { showToast } = useToast();
	const { config: statusConfig } = useProjectStatusConfig(ticket.projectId);
	const [localDescription, setLocalDescription] = useState(ticket.description);
	const [localStatus, setLocalStatus] = useState<TicketStatus>(ticket.status);
	const [localLabels, setLocalLabels] = useState<string[]>(ticket.labels);
	const [dirtyFields, setDirtyFields] = useState<Partial<Ticket>>({});
	const [saving, setSaving] = useState(false);
	const [statusSaving, setStatusSaving] = useState(false);

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
			// On error, revert to original status
			setLocalStatus(ticket.status);
			const errMsg = getErrorMessage(err);
			// Check for version conflict (optimistic locking)
			if (errMsg.includes('version') || errMsg.includes('conflict') || errMsg.includes('409')) {
				showToast('This ticket was modified by someone else. Please refresh.', 'error');
			} else {
				showToast(`Failed to update status: ${errMsg}`, 'error');
			}
		} finally {
			setStatusSaving(false);
		}
	};

	const handleRemoveLabel = (label: string) => {
		const newLabels = localLabels.filter(l => l !== label);
		setLocalLabels(newLabels);
		setDirtyFields(prev => ({ ...prev, labels: newLabels }));
	};

	const handleSaveChanges = async () => {
		if (Object.keys(dirtyFields).length === 0 || saving) return;

		setSaving(true);
		try {
			await onUpdate(dirtyFields);
			setDirtyFields({});
		} catch (err) {
			const errMsg = getErrorMessage(err);
			// Check for version conflict (optimistic locking)
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
		<div className="grid grid-cols-5 gap-6">
			{/* Left column (60%) */}
			<div className="col-span-3 space-y-6">
				<div>
					<Label htmlFor="description">Description</Label>
					<Textarea
						id="description"
						value={localDescription}
						onChange={e => handleDescriptionChange(e.target.value)}
						rows={10}
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

				<TicketCommentsSection ticketId={ticketId} />
			</div>

			{/* Right column (40%) */}
			<div className="col-span-2 space-y-6">
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
								{statusConfig.statuses.map(s => (
									<SelectItem key={s.id} value={s.id}>
										{s.label}
									</SelectItem>
								))}
							</SelectContent>
						</SelectWithSpinner>
					</div>
				</div>

				<div className={dirtyFields.labels ? 'rounded-md ring-2 ring-primary/30 p-2' : ''}>
					<Label>Labels</Label>
					<div className="mt-2 flex flex-wrap gap-2">
						{localLabels.map(label => (
							<Badge key={label} variant="outline" className="cursor-pointer px-2 py-1 text-xs">
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
						))}
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
		</div>
	);
}
