import { useEffect, useState } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { useDialogParam } from '@framework/hooks/useDialogParam';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Project } from '@shared/api/projects.contract';
import type { Ticket, TicketStatus } from '@shared/api/tickets.contract';
import { Plus } from 'lucide-react';

import { projectsApi } from '../projects/projects.api';
import { TicketCreateDialog } from './TicketCreateDialog';
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
	const [selectedProjectId, setSelectedProjectId] = useState<string>('');
	const [projects, setProjects] = useState<Project[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const createDialog = useDialogParam('create-ticket');

	const { tickets, loading, reload } = useTickets({
		projectId: selectedProjectId || undefined,
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
		console.log('Ticket clicked:', ticket);
		// TODO: Open ticket detail view/drawer
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
			<div className="space-y-2">
				{loading && (
					<div className="rounded-lg border border-border bg-card p-4 text-center text-muted-foreground">
						Loading tickets...
					</div>
				)}

				{!loading && tickets.length === 0 && (
					<div className="rounded-lg border border-border bg-card p-8 text-center">
						<p className="text-lg font-medium text-foreground">No tickets found</p>
						<p className="mt-2 text-sm text-muted-foreground">Create your first ticket to get started</p>
					</div>
				)}

				{!loading &&
					tickets.map(ticket => (
						<div
							key={ticket.id}
							className="cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
							onClick={() => handleTicketClick(ticket)}
						>
							<div className="flex items-start justify-between">
								<div className="flex-1">
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
								</div>
								<div className="ml-4 text-sm text-muted-foreground">
									Order: {ticket.order.toFixed(2)}
								</div>
							</div>
						</div>
					))}
			</div>

			{/* Create Dialog */}
			<TicketCreateDialog
				open={createDialog.isOpen}
				onOpenChange={createDialog.onOpenChange}
				onSuccess={handleTicketCreated}
			/>
		</Page>
	);
}
