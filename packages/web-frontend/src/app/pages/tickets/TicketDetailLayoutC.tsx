import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Label } from '@framework/components/forms/Label';
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { SelectWithSpinner } from '@framework/components/forms/SelectWithSpinner';
import { Textarea } from '@framework/components/forms/Textarea';
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
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Ticket, TicketStatus } from '@shared/api/tickets.contract';
import { Loader2 } from 'lucide-react';

import { TicketAuditLogSection } from './TicketAuditLogSection';
import { TicketCommentsSection } from './TicketCommentsSection';
import { TicketEventHistorySection } from './TicketEventHistorySection';
import { TriggeredTasksSection } from './TriggeredTasksSection';
import { ticketsApi } from './tickets.api';
import { useProjectStatusConfig } from './useProjectStatusConfig';
import { useTicketCommentsCount } from './useTicketCommentsCount';
import { useTicketHistoryCount } from './useTicketHistoryCount';
import { useTriggeredTasksCount } from './useTriggeredTasksCount';

interface TicketDetailLayoutCProps {
	ticket: Ticket;
	ticketId: string;
	onUpdate: (updates: Partial<Ticket>) => Promise<void>;
	onRefresh: () => Promise<void>;
}

/**
 * Layout C (YouTrack) - Compact header with tabs
 */
export function TicketDetailLayoutC({ ticket, ticketId, onUpdate, onRefresh }: TicketDetailLayoutCProps) {
	const { showToast } = useToast();
	const { config: statusConfig } = useProjectStatusConfig(ticket.projectId);

	const [localDescription, setLocalDescription] = useState(ticket.description);
	const [localStatus, setLocalStatus] = useState<TicketStatus>(ticket.status);
	const [dirtyFields, setDirtyFields] = useState<Partial<Ticket>>({});
	const [saving, setSaving] = useState(false);
	const [statusSaving, setStatusSaving] = useState(false);

	// Use hooks that automatically refresh on WebSocket events
	const commentsState = useTicketCommentsCount(ticketId);
	const tasksState = useTriggeredTasksCount(ticketId);
	const historyState = useTicketHistoryCount(ticketId);

	const countsLoading = commentsState.loading || tasksState.loading || historyState.loading;

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
		<div className="space-y-4">
			{/* Compact header */}
			<div className="flex items-center justify-between border-b pb-3">
				<h1 className="text-xl font-bold">{ticket.title}</h1>
				<div className="flex items-center gap-3">
					<Label htmlFor="status" className="text-sm">
						Status:
					</Label>
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

			{/* Always visible content */}
			<div className="space-y-4">
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
			</div>

			{/* Tabs */}
			<TabsWithUrlState paramKey="tab" defaultValue="comments">
				<TabsList>
					<TabsTrigger value="comments" asChild>
						<Link to={`?tab=comments`}>Comments ({countsLoading ? '?' : commentsState.count})</Link>
					</TabsTrigger>
					<TabsTrigger value="tasks" asChild>
						<Link to={`?tab=tasks`}>Triggered ({countsLoading ? '?' : tasksState.count})</Link>
					</TabsTrigger>
					<TabsTrigger value="history" asChild>
						<Link to={`?tab=history`}>History ({countsLoading ? '?' : historyState.count})</Link>
					</TabsTrigger>
					<TabsTrigger value="audit" asChild>
						<Link to={`?tab=audit`}>Audit ({countsLoading ? '?' : historyState.count})</Link>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="comments">
					<TicketCommentsSection ticketId={ticketId} />
				</TabsContent>

				<TabsContent value="tasks">
					<TriggeredTasksSection ticketId={ticketId} />
				</TabsContent>

				<TabsContent value="history">
					<TicketEventHistorySection ticketId={ticketId} />
				</TabsContent>

				<TabsContent value="audit">
					<TicketAuditLogSection ticketId={ticketId} />
				</TabsContent>
			</TabsWithUrlState>
		</div>
	);
}
