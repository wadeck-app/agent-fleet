import { useEffect, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Textarea } from '@framework/components/forms/Textarea';
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { DialogBody, DialogFooter } from '@framework/components/overlays/Dialog';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Project } from '@shared/api/projects.contract';
import type { TicketAnalysisPlan } from '@shared/api/tickets.contract';
import { Sparkles } from 'lucide-react';

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
 * Simple dialog for creating tickets with AI analysis:
 * 1. User selects project and enters description
 * 2. Click "Analyze with AI" to get title, labels, complexity
 * 3. Edit the title if needed
 * 4. Click "Create" to create the ticket
 *
 * ===========================================================================================
 */
export function TicketCreateDialog({ open, onOpenChange, onSuccess }: TicketCreateDialogProps) {
	const { showToast } = useToast();

	const [projects, setProjects] = useState<Project[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const [selectedProjectId, setSelectedProjectId] = useState<string>('');
	const [description, setDescription] = useState('');
	const [analyzing, setAnalyzing] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [analysis, setAnalysis] = useState<TicketAnalysisPlan | null>(null);
	const [editedTitle, setEditedTitle] = useState('');

	// Load projects when dialog opens
	useEffect(() => {
		if (!open) return;

		const loadProjects = async () => {
			try {
				setProjectsLoading(true);
				const response = await projectsApi.getProjectsList({ archived: false });
				setProjects(response.items ?? []);
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
			setDescription('');
			setAnalysis(null);
			setEditedTitle('');
			setSelectedProjectId('');
		}
	}, [open]);

	// Populate title from analysis
	useEffect(() => {
		if (analysis) {
			setEditedTitle(analysis.title);
		}
	}, [analysis]);

	const handleAnalyze = async () => {
		if (!description.trim()) {
			showToast('Please enter a description first', 'error');
			return;
		}
		if (!selectedProjectId) {
			showToast('Please select a project first', 'error');
			return;
		}

		try {
			setAnalyzing(true);
			const result = await ticketsApi.analyzeTicket({
				description,
				projectId: selectedProjectId,
			});
			setAnalysis(result);
		} catch (error) {
			showToast(getErrorMessage(error), 'error');
		} finally {
			setAnalyzing(false);
		}
	};

	const handleCreate = async () => {
		if (!analysis || !selectedProjectId) {
			showToast('Please analyze the ticket first', 'error');
			return;
		}

		try {
			setSubmitting(true);
			const planToSubmit: TicketAnalysisPlan = {
				...analysis,
				title: editedTitle || analysis.title,
			};

			await ticketsApi.createFromPlan({
				projectId: selectedProjectId,
				plan: planToSubmit,
			});

			showToast('Ticket created successfully', 'success');
			onSuccess();
			onOpenChange(false);
		} catch (error) {
			showToast(getErrorMessage(error), 'error');
		} finally {
			setSubmitting(false);
		}
	};

	const complexityVariant = (complexity: string) => {
		if (complexity === 'simple') return 'success' as const;
		if (complexity === 'medium') return 'warning' as const;
		return 'destructive' as const;
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
						<Label className="mb-1">
							Project <span className="text-destructive">*</span>
						</Label>
						<Select
							value={selectedProjectId}
							onValueChange={setSelectedProjectId}
							disabled={projectsLoading || analyzing}
						>
							<SelectTrigger>
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
							rows={6}
							disabled={analyzing}
						/>
					</div>

					{/* Analyze Button */}
					<Button
						type="button"
						onClick={handleAnalyze}
						disabled={analyzing || !description.trim() || !selectedProjectId}
						variant="secondary"
						className="w-full"
					>
						<Sparkles className="mr-2 size-4" />
						{analyzing ? 'Analyzing...' : 'Analyze with AI'}
					</Button>

					{/* Analysis Results */}
					{analysis && (
						<div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
							<h3 className="text-sm font-semibold text-foreground">Analysis Result</h3>

							{/* Editable Title */}
							<div>
								<Label className="mb-1" htmlFor="ticket-title">
									Title
								</Label>
								<Input
									id="ticket-title"
									type="text"
									value={editedTitle}
									onChange={e => setEditedTitle(e.target.value)}
									placeholder="Ticket title..."
								/>
							</div>

							{/* Complexity */}
							<div>
								<p className="mb-1 text-sm font-medium text-foreground">Complexity</p>
								<Badge variant={complexityVariant(analysis.complexity)}>
									{analysis.complexity.toUpperCase()}
								</Badge>
							</div>

							{/* Labels */}
							{analysis.labels.length > 0 && (
								<div>
									<p className="mb-1 text-sm font-medium text-foreground">Labels</p>
									<div className="flex flex-wrap gap-2">
										{analysis.labels.map(label => (
											<Badge key={label} variant="outline">
												{label}
											</Badge>
										))}
									</div>
								</div>
							)}

							{/* AI Analysis text */}
							{analysis.analysis && (
								<div>
									<p className="mb-1 text-sm font-medium text-foreground">AI Analysis</p>
									<p className="text-sm text-muted-foreground">{analysis.analysis}</p>
								</div>
							)}

							{/* Sub-tickets count */}
							{analysis.subTickets.length > 0 && (
								<p className="text-sm text-muted-foreground">
									{analysis.subTickets.length} sub-ticket{analysis.subTickets.length > 1 ? 's' : ''}{' '}
									will be created
								</p>
							)}
						</div>
					)}
				</div>
			</DialogBody>

			<DialogFooter>
				<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
					Cancel
				</Button>
				<Button type="button" onClick={handleCreate} disabled={submitting || !analysis} variant="default">
					{submitting ? 'Creating...' : 'Create'}
				</Button>
			</DialogFooter>
		</CrudDialog>
	);
}
