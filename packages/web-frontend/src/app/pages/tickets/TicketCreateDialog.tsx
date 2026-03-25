import { useEffect, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Textarea } from '@framework/components/forms/Textarea';
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { DialogBody, DialogFooter } from '@framework/components/overlays/Dialog';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Project } from '@shared/api/projects.contract';
import { Loader2 } from 'lucide-react';

import { projectsApi } from '../projects/projects.api';
import { ticketsApi } from './tickets.api';

interface TicketCreateDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

/**
 * ===========================================================================================
 * TICKET CREATE DIALOG
 * ===========================================================================================
 *
 * Simple dialog for creating tickets with optional AI title generation:
 * 1. User selects project and enters description (required)
 * 2. User optionally enters title (if empty, AI will generate it)
 * 3. Click "Create" to create the ticket:
 *    - If title is empty: create with placeholder, AI generates real title async
 *    - If title is provided: create directly without AI
 *
 * ===========================================================================================
 */
export function TicketCreateDialog({ open, onOpenChange, onSuccess }: TicketCreateDialogProps) {
	const { showToast } = useToast();

	const [projects, setProjects] = useState<Project[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const [selectedProjectId, setSelectedProjectId] = useState<string>('');
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [creating, setCreating] = useState(false);

	// Load projects when dialog opens
	useEffect(() => {
		if (!open) return;

		const loadProjects = async () => {
			try {
				setProjectsLoading(true);
				const response = await projectsApi.getProjectsList({ archived: false });
				const projectsList =
					'items' in response ? response.items : (response as { projects: Project[] }).projects;
				setProjects((projectsList ?? []).sort((a, b) => a.name.localeCompare(b.name)));
			} catch (error) {
				showToast(getErrorMessage(error), 'error');
			} finally {
				setProjectsLoading(false);
			}
		};

		loadProjects();
	}, [open, showToast]);

	// Reset form when dialog closes
	useEffect(() => {
		if (!open) {
			setTitle('');
			setDescription('');
			setSelectedProjectId('');
		}
	}, [open]);

	const handleCreate = async () => {
		if (!description.trim()) {
			showToast('Please enter a description', 'error');
			return;
		}
		if (!selectedProjectId) {
			showToast('Please select a project', 'error');
			return;
		}

		try {
			setCreating(true);

			if (!title.trim()) {
				// Create immediately — title will be generated asynchronously by the backend
				await ticketsApi.createWithAiTitle({
					projectId: selectedProjectId,
					description,
				});
			} else {
				// Title provided: create directly
				await ticketsApi.createTicket({
					projectId: selectedProjectId,
					title: title.trim(),
					description,
					status: 'backlog',
					labels: [],
					fields: {},
				});
			}

			showToast('Ticket created successfully', 'success');
			onSuccess();
			onOpenChange(false);
		} catch (error) {
			showToast(getErrorMessage(error), 'error');
		} finally {
			setCreating(false);
		}
	};

	return (
		<CrudDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Create Ticket"
			description="Describe the ticket and let AI help you organize it"
			maxWidth="2xl"
			preventOutsideClick={true}
		>
			<DialogBody>
				<div className="space-y-4">
					{/* Project Selection */}
					<div>
						{/* T8 fix: connect label to select trigger via htmlFor/id */}
						<Label htmlFor="project-select" className="mb-1">
							Project <span className="text-destructive">*</span>
						</Label>
						<Select
							value={selectedProjectId}
							onValueChange={setSelectedProjectId}
							disabled={projectsLoading || creating}
						>
							<SelectTrigger id="project-select">
								<SelectValue
									placeholder={projectsLoading ? 'Loading projects...' : 'Select project...'}
								/>
							</SelectTrigger>
							<SelectContent>
								{projects.map(project => (
									<SelectItem key={project.id} value={project.id}>
										{project.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Title (optional) */}
					<div>
						<Label className="mb-1" htmlFor="ticket-title">
							Title
						</Label>
						<Input
							id="ticket-title"
							type="text"
							value={title}
							onChange={e => setTitle(e.target.value)}
							placeholder="will be filled automatically by a LLM from the description"
							disabled={creating}
						/>
					</div>

					{/* Description */}
					<div>
						<Label className="mb-1" htmlFor="ticket-description">
							Description <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="ticket-description"
							value={description}
							onChange={e => setDescription(e.target.value)}
							placeholder="Describe what needs to be done..."
							rows={8}
							disabled={creating}
						/>
					</div>
				</div>
			</DialogBody>

			<DialogFooter>
				<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
					Cancel
				</Button>
				<Button
					type="button"
					onClick={handleCreate}
					disabled={creating || !description.trim() || !selectedProjectId}
					variant="default"
				>
					{creating ? (
						<>
							<Loader2 className="mr-2 size-4 animate-spin" />
							Creating...
						</>
					) : (
						'Create'
					)}
				</Button>
			</DialogFooter>
		</CrudDialog>
	);
}
