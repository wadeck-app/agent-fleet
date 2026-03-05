import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '@framework/components2/list/SortableItem';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { useDragAndDrop } from '@framework/hooks2/form/useDragAndDrop';
import { useDialogParam } from '@framework/hooks/useDialogParam';
import { cn } from '@framework/lib/utils';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Project } from '@shared/api/projects.contract';
import type { Ticket, TicketStatus } from '@shared/api/tickets.contract';
import { Plus } from 'lucide-react';

import { projectsApi } from '../projects/projects.api';
import { TicketCreateDialog } from './TicketCreateDialog';
import { ticketsApi } from './tickets.api';
import { useTickets } from './useTickets';

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
 * ===========================================================================================
 * TICKETS PAGE
 * ===========================================================================================
 *
 * Simple list page showing tickets with filtering by project.
 *
 * Features:
 * - Filter by project
 * - Show ticket title, status, labels, order
 * - "New Ticket" button to open create dialog
 * - Click on ticket to view details (placeholder for now)
 *
 * ===========================================================================================
 */
export function TicketsPage() {
	const navigate = useNavigate();
	const [selectedProjectId, setSelectedProjectId] = useState<string>('');
	const [projects, setProjects] = useState<Project[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const createDialog = useDialogParam('create-ticket');

	const { tickets, loading, reload, refresh } = useTickets({
		projectId: selectedProjectId || undefined,
	});

	// Local display state for optimistic drag-and-drop updates
	const [localTickets, setLocalTickets] = useState<Ticket[]>([]);

	// Sync local tickets from server data (initial load + explicit reload)
	useEffect(() => {
		if (!loading) {
			const sorted = [...tickets].sort((a, b) => {
				const dateA = new Date(a.updatedAt ?? a.createdAt).getTime();
				const dateB = new Date(b.updatedAt ?? b.createdAt).getTime();
				return dateB - dateA;
			});
			setLocalTickets(sorted);
		}
	}, [tickets, loading]);

	// Setup drag and drop
	const dnd = useDragAndDrop({
		items: localTickets,
		getItemId: ticket => ticket.id,
		onReorder: async (fromIndex, toIndex) => {
			const snapshot = [...localTickets];
			const movedTicket = localTickets[fromIndex];

			// Calculate new order based on final neighbors after the move
			let newOrder: number;
			if (toIndex === 0) {
				// Moving to top
				newOrder = localTickets[0].order / 2;
			} else if (toIndex === localTickets.length - 1) {
				// Moving to bottom
				newOrder = localTickets[localTickets.length - 1].order + 1000;
			} else if (fromIndex < toIndex) {
				// Moving down: item lands AFTER the item at toIndex
				newOrder = (localTickets[toIndex].order + localTickets[toIndex + 1].order) / 2;
			} else {
				// Moving up: item lands BEFORE the item at toIndex
				newOrder = (localTickets[toIndex - 1].order + localTickets[toIndex].order) / 2;
			}

			// Optimistic local reorder (no loading flash)
			const reordered = [...localTickets];
			reordered.splice(fromIndex, 1);
			reordered.splice(toIndex, 0, { ...movedTicket, order: newOrder });
			setLocalTickets(reordered);

			try {
				setIsSaving(true);
				await ticketsApi.reorderTicket(movedTicket.id, {
					order: newOrder,
					version: movedTicket.version,
				});
				// Silent background sync — no loading flash
				void refresh();
			} catch (err) {
				console.error('Failed to reorder ticket:', getErrorMessage(err));
				// Revert to snapshot on error
				setLocalTickets(snapshot);
			} finally {
				setIsSaving(false);
			}
		},
		disabled: false,
		activationConstraint: { distance: 8 },
	});

	// Load projects for filter dropdown
	useEffect(() => {
		const loadProjects = async () => {
			try {
				setProjectsLoading(true);
				const response = await projectsApi.getProjectsList({ archived: false });
				const projectsList =
					'items' in response ? response.items : (response as { projects: Project[] }).projects;
				setProjects(projectsList);
			} catch (error) {
				console.error('Failed to load projects:', getErrorMessage(error));
			} finally {
				setProjectsLoading(false);
			}
		};

		loadProjects();
	}, []);

	const handleTicketCreated = () => {
		reload();
		createDialog.close();
	};

	const handleTicketClick = (ticket: Ticket) => {
		navigate(`/tickets/${ticket.id}`);
	};

	return (
		<Page>
			<PageHeader
				title="Tickets"
				onRefresh={reload}
				isRefreshing={loading}
				action={
					<Button onClick={() => createDialog.open()} variant="default" size="sm">
						<Plus />
						New Ticket
					</Button>
				}
			/>

			{/* Filters */}
			<div className="mb-4 flex items-center gap-4">
				<div className="w-64">
					<Select
						value={selectedProjectId === '' ? '__all__' : selectedProjectId}
						onValueChange={v => setSelectedProjectId(v === '__all__' ? '' : v)}
					>
						<SelectTrigger>
							<SelectValue placeholder={projectsLoading ? 'Loading projects...' : 'All Projects'} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__all__">All Projects</SelectItem>
							{projects.map(project => (
								<SelectItem key={project.id} value={project.id}>
									{project.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Tickets List */}
			{loading && (
				<div className="rounded-lg border border-border bg-card p-4 text-center text-muted-foreground">
					Loading tickets...
				</div>
			)}

			{!loading && localTickets.length === 0 && (
				<div className="rounded-lg border border-border bg-card p-8 text-center">
					<p className="text-lg font-medium text-foreground">No tickets found</p>
					<p className="mt-2 text-sm text-muted-foreground">Create your first ticket to get started</p>
				</div>
			)}

			{localTickets.length > 0 && (
				<DndContext sensors={dnd.sensors} collisionDetection={closestCenter} onDragEnd={dnd.handleDragEnd}>
					<SortableContext items={dnd.sortableIds} strategy={verticalListSortingStrategy}>
						<div className={cn('space-y-2', isSaving && 'pointer-events-none opacity-50 blur-sm')}>
							{localTickets.map(ticket => (
								<SortableItem key={ticket.id} id={ticket.id}>
									<div
										className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
										onClick={() => handleTicketClick(ticket)}
									>
										<h3 className="font-medium text-foreground">{ticket.title}</h3>
										{ticket.description && (
											<p className="mt-1 text-sm text-muted-foreground line-clamp-2">
												{ticket.description}
											</p>
										)}
										<div className="mt-2 flex items-center gap-2">
											<Badge variant={STATUS_VARIANTS[ticket.status]}>
												{formatStatus(ticket.status)}
											</Badge>
											{ticket.labels.map(label => (
												<Badge key={label} variant="outline">
													{label}
												</Badge>
											))}
										</div>
										<div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
											<span>Updated {formatRelativeTime(ticket.updatedAt)}</span>
											<span>Created {formatRelativeTime(ticket.createdAt)}</span>
										</div>
									</div>
								</SortableItem>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}

			{/* Create Dialog */}
			<TicketCreateDialog
				open={createDialog.isOpen}
				onOpenChange={createDialog.onOpenChange}
				onSuccess={handleTicketCreated}
			/>
		</Page>
	);
}
