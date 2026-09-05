import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { DialogBody, DialogFooter } from '@framework/components/overlays/Dialog';
import { Badge } from '@framework/components/primitives/Badge';
import { type FormAction, FormActions } from '@framework/features/forms/FormActions';
import { ArrayField } from '@framework/features/forms/fields/ArrayField';
import { ComboboxField, type ComboboxOption } from '@framework/features/forms/fields/ComboboxField';
import { DateField } from '@framework/features/forms/fields/DateField';
import { DateTimeField } from '@framework/features/forms/fields/DateTimeField';
import { EnhancedNumberField } from '@framework/features/forms/fields/EnhancedNumberField';
import { EnumField } from '@framework/features/forms/fields/EnumField';
import { FileField } from '@framework/features/forms/fields/FileField';
import { FolderField } from '@framework/features/forms/fields/FolderField';
import { KeyValueField } from '@framework/features/forms/fields/KeyValueField';
import { MarkdownField } from '@framework/features/forms/fields/MarkdownField';
import { MultiEnumField } from '@framework/features/forms/fields/MultiEnumField';
import { PasswordField } from '@framework/features/forms/fields/PasswordField';
import { PriorityField } from '@framework/features/forms/fields/PriorityField';
import { RegexField } from '@framework/features/forms/fields/RegexField';
import { SelectField } from '@framework/features/forms/fields/SelectField';
import { TextAreaField } from '@framework/features/forms/fields/TextAreaField';
import { TextField } from '@framework/features/forms/fields/TextField';
import { UrlField } from '@framework/features/forms/fields/UrlField';
import { useFormState } from '@framework/features/forms/useFormState';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FlowMetadata, NormalizedInputDefinition } from '@shared/api/flows.contract';
import type { CreateTask } from '@shared/api/tasks.contract';
import { AlertTriangle, GripVertical } from 'lucide-react';

import { projectsApi } from '../projects/projects.api';
import { useWorkers } from '../workers/useWorkers';
import { workersApi } from '../workers/workers.api';
import { tasksService } from './TasksService';

interface CreateTaskDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
	/**
	 * Default values to pre-fill the form
	 */
	defaultValues?: Partial<CreateTaskFormData>;
	/**
	 * Fields to lock (hide from UI). User cannot modify these fields.
	 * Supported: 'workerId', 'projectId'
	 */
	lockedFields?: Array<'workerId' | 'projectId'>;
}

// Flat form data structure for useFormState compatibility
interface CreateTaskFormData {
	description: string;
	priority: string;
	workerId: string;
	projectId: string;
	flowId: string;
}

const defaultFormData: CreateTaskFormData = {
	description: '',
	priority: 'medium',
	workerId: '',
	projectId: '',
	flowId: '',
};

// Constants for resizable splitter
const SPLITTER_STORAGE_KEY = 'createTaskDialog.splitterPosition';
const DEFAULT_LEFT_WIDTH = 45;
const MIN_WIDTH = 30;
const MAX_WIDTH = 70;
const FORM_ID = 'create-task-form';

export function CreateTaskDialog({
	open,
	onOpenChange,
	onSuccess,
	defaultValues,
	lockedFields = [],
}: CreateTaskDialogProps) {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { data: workersData, loading: workersLoading } = useWorkers();
	const [workerFlowsMetadata, setWorkerFlowsMetadata] = useState<FlowMetadata[]>([]);
	const [flowsLoading, setFlowsLoading] = useState(false);
	const [flowInputs, setFlowInputs] = useState<Record<string, string>>({});
	const [projects, setProjects] = useState<ComboboxOption[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);

	// Resizable splitter state
	const [leftWidth, setLeftWidth] = useState<number>(() => {
		const saved = localStorage.getItem(SPLITTER_STORAGE_KEY);
		return saved ? parseFloat(saved) : DEFAULT_LEFT_WIDTH;
	});
	const [isDragging, setIsDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Transform workers to ComboboxOption format
	const workerOptions: ComboboxOption[] = (workersData?.workers || []).map(w => ({
		value: w.workerId,
		label: `${w.workerId}${w.taskId ? ' (busy)' : ' (idle)'}`,
	}));

	const formState = useFormState<CreateTaskFormData>({
		defaultData: { ...defaultFormData, ...defaultValues },
		validator: data => {
			const errors: Record<string, string> = {};

			if (!data.description?.trim()) {
				errors.description = 'Description is required';
			}

			if (!data.priority) {
				errors.priority = 'Priority is required';
			}

			// Only validate workerId if not locked (locked fields are pre-filled)
			if (!lockedFields.includes('workerId') && !data.workerId) {
				errors.workerId = 'Worker assignment is required';
			}

			// Validate flow inputs if flow is selected
			// Find the selected flow to check its inputs
			const selectedFlow = workerFlowsMetadata.find(f => f.id === data.flowId);
			if (data.flowId && selectedFlow?.inputs) {
				for (const [inputName, inputDef] of Object.entries(selectedFlow.inputs)) {
					// Only validate required inputs
					if (inputDef.required && !flowInputs[inputName]?.trim()) {
						errors[`input_${inputName}`] = `${inputName} is required`;
					}
				}
			}

			return {
				valid: Object.keys(errors).length === 0,
				errors: Object.values(errors),
			};
		},
		errorFieldMapping: {
			'Description is required': 'description',
			'Priority is required': 'priority',
			'Worker assignment is required': 'workerId',
		},
		onSubmit: async data => {
			// Transform flat form data to nested CreateTask structure
			// IMPORTANT: Empty strings must be undefined for Zod validation
			const createTaskData: CreateTask = {
				description: data.description,
				priority: data.priority as CreateTask['priority'],
				assignedTo: { workerId: data.workerId },
				projectId: data.projectId?.trim() || undefined,
				flowId: data.flowId?.trim() || undefined,
				// Pass the actual flow inputs if flow is selected
				flowInputs: data.flowId && Object.keys(flowInputs).length > 0 ? flowInputs : undefined,
			};

			try {
				await tasksService.createTask(createTaskData);
				showToast('Task created successfully', 'success');
				onSuccess();
				onOpenChange(false);
			} catch (error) {
				// Show error toast to user
				showToast(getErrorMessage(error), 'error');
				console.error('Failed to create task:', error);
				// Re-throw to let useFormState handle the isSubmitting state
				throw error;
			}
		},
	});

	// Get selected flow metadata (computed after formState is defined)
	const selectedFlow = useMemo(
		() => workerFlowsMetadata.find(f => f.id === formState.formData.flowId),
		[workerFlowsMetadata, formState.formData.flowId]
	);

	// Resizable splitter handlers
	const handleMouseDown = useCallback(() => {
		setIsDragging(true);
	}, []);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isDragging || !containerRef.current) return;

			const container = containerRef.current;
			const containerRect = container.getBoundingClientRect();
			const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

			// Clamp between MIN_WIDTH and MAX_WIDTH
			const clampedWidth = Math.min(Math.max(newLeftWidth, MIN_WIDTH), MAX_WIDTH);
			setLeftWidth(clampedWidth);
			localStorage.setItem(SPLITTER_STORAGE_KEY, clampedWidth.toString());
		},
		[isDragging]
	);

	const handleMouseUp = useCallback(() => {
		setIsDragging(false);
	}, []);

	// Add event listeners for dragging
	useEffect(() => {
		if (isDragging) {
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
			return () => {
				document.removeEventListener('mousemove', handleMouseMove);
				document.removeEventListener('mouseup', handleMouseUp);
			};
		}
	}, [isDragging, handleMouseMove, handleMouseUp]);

	// Render field based on input type
	const renderField = (inputName: string, inputDef: NormalizedInputDefinition) => {
		const value = flowInputs[inputName] || '';
		const error = formState.validationErrors[`input_${inputName}`];
		const placeholder = inputDef.default !== undefined ? `Default: ${inputDef.default}` : `Enter ${inputName}...`;

		const commonProps = {
			label: inputDef.description || inputName,
			value,
			onChange: (val: string) => setFlowInputs(prev => ({ ...prev, [inputName]: val })),
			required: inputDef.required,
			placeholder,
			error,
			description: inputDef.description,
		};

		switch (inputDef.type) {
			case 'text':
				return <TextAreaField {...commonProps} rows={4} />;
			case 'url':
				return <UrlField {...commonProps} />;
			case 'markdown':
				return <MarkdownField {...commonProps} rows={6} />;
			case 'integer':
			case 'percentage':
			case 'duration':
				return <EnhancedNumberField {...commonProps} type={inputDef.type} options={inputDef.options} />;
			case 'enum':
				return <EnumField {...commonProps} options={inputDef.options} />;
			case 'multi-enum':
				return <MultiEnumField {...commonProps} options={inputDef.options} />;
			case 'file':
				return <FileField {...commonProps} options={inputDef.options} />;
			case 'folder':
				return <FolderField {...commonProps} options={inputDef.options} />;
			case 'date':
				return <DateField {...commonProps} min={inputDef.options?.min} max={inputDef.options?.max} />;
			case 'datetime':
				return <DateTimeField {...commonProps} min={inputDef.options?.min} max={inputDef.options?.max} />;
			case 'regex':
				return <RegexField {...commonProps} options={inputDef.options} />;
			case 'array':
				return <ArrayField {...commonProps} options={inputDef.options} />;
			case 'keyvalue':
				return <KeyValueField {...commonProps} options={inputDef.options} />;
			case 'password':
				return <PasswordField {...commonProps} />;
			case 'priority':
				return <PriorityField {...commonProps} />;
			case 'number':
				return <EnhancedNumberField {...commonProps} type="number" options={inputDef.options} />;
			case 'string':
			case 'boolean':
			case 'object':
			default:
				return <TextField {...commonProps} />;
		}
	};

	// Load projects when dialog opens
	useEffect(() => {
		const loadProjects = async () => {
			if (!open) return;

			try {
				setProjectsLoading(true);
				const response = await projectsApi.getProjectsList({ archived: false });
				const projectOptions: ComboboxOption[] = [
					{ value: '', label: 'No Project (assign to workspace/worker)' },
					...(response.items || []).map(p => ({
						value: p.id,
						label: p.name,
					})),
				];
				setProjects(projectOptions);
			} catch (error) {
				showToast(getErrorMessage(error), 'error');
				console.error('Failed to load projects:', error);
				setProjects([{ value: '', label: 'No Project (assign to workspace/worker)' }]);
			} finally {
				setProjectsLoading(false);
			}
		};

		loadProjects();
	}, [open, showToast]);

	// Load flows when worker is selected
	useEffect(() => {
		const loadWorkerFlows = async () => {
			if (!formState.formData.workerId) {
				setWorkerFlowsMetadata([]);
				return;
			}

			try {
				setFlowsLoading(true);
				const flows = await workersApi.getWorkerFlows(formState.formData.workerId);
				setWorkerFlowsMetadata(flows);
			} catch (error) {
				showToast(getErrorMessage(error), 'error');
				console.error('Failed to load worker flows:', error);
				setWorkerFlowsMetadata([]);
			} finally {
				setFlowsLoading(false);
			}
		};

		loadWorkerFlows();
		// Reset flowId when worker changes
		if (formState.formData.flowId) {
			formState.updateField('flowId', '');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [formState.formData.workerId]);

	// Reset flow inputs when flow changes
	useEffect(() => {
		if (selectedFlow?.inputs) {
			// Initialize flow inputs with default values or empty strings
			const initialInputs: Record<string, string> = {};
			for (const [inputName, inputDef] of Object.entries(selectedFlow.inputs)) {
				// Use default value if available and it's a string, otherwise empty string
				initialInputs[inputName] = inputDef.default !== undefined ? String(inputDef.default) : '';
			}
			setFlowInputs(initialInputs);
		} else {
			setFlowInputs({});
		}
	}, [selectedFlow]);

	// Convert flow metadata to combobox options
	// Mark invalid flows with a badge and disable them
	const flowOptions: ComboboxOption[] = workerFlowsMetadata.map(flow => ({
		value: flow.id,
		label: flow.isValid
			? flow.name || flow.id
			: `${flow.name || flow.id} ❌ Invalid (${flow.validationErrors?.length || 0} errors)`,
		disabled: !flow.isValid, // Disable invalid flows
	}));

	// Handler for "Create and open" button
	const handleCreateAndOpen = async () => {
		// Validate form first
		const validation = formState.validator(formState.formData);
		console.log('[CreateTaskDialog] handleCreateAndOpen validation:', {
			valid: validation.valid,
			errors: validation.errors,
			formData: formState.formData,
			flowInputs,
			selectedFlowInputs: selectedFlow?.inputs,
		});
		if (!validation.valid) {
			// Show specific errors in the toast + set field-level errors
			const errorMessages = validation.errors.join(', ');
			showToast(`Validation failed: ${errorMessages}`, 'error');

			// Set field-level validation errors so fields are highlighted
			const fieldErrors: Record<string, string> = {};
			for (const error of validation.errors) {
				for (const [errorKey, fieldName] of Object.entries(formState.validationErrors)) {
					if (error.includes(errorKey)) {
						fieldErrors[fieldName] = error;
					}
				}
				// Also map flow input errors
				if (error.includes(' is required')) {
					const inputName = error.replace(' is required', '');
					fieldErrors[`input_${inputName}`] = error;
				}
			}
			// Trigger validation display via handleSubmit (which sets validationErrors)
			const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
			await formState.handleSubmit(fakeEvent);
			return;
		}

		// Transform flat form data to nested CreateTask structure
		const createTaskData: CreateTask = {
			description: formState.formData.description,
			priority: formState.formData.priority as CreateTask['priority'],
			assignedTo: { workerId: formState.formData.workerId },
			projectId: formState.formData.projectId?.trim() || undefined,
			flowId: formState.formData.flowId?.trim() || undefined,
			flowInputs: formState.formData.flowId && Object.keys(flowInputs).length > 0 ? flowInputs : undefined,
		};

		try {
			const createdTask = await tasksService.createTask(createTaskData);
			showToast('Task created successfully', 'success');
			// Only navigate — do NOT call onSuccess/onOpenChange as they use
			// setSearchParams({ replace: true }) which overrides the navigation
			navigate(`/tasks/${createdTask.id}`);
		} catch (error) {
			showToast(getErrorMessage(error), 'error');
			console.error('Failed to create task:', error);
		}
	};

	// Define form actions
	const formActions: FormAction[] = [
		{
			label: formState.isSubmitting ? 'Saving...' : 'Créer tâche',
			type: 'submit',
			formId: FORM_ID,
			disabled: formState.isSubmitting,
		},
		{
			label: 'Create and open',
			type: 'button',
			onClick: handleCreateAndOpen,
			disabled: formState.isSubmitting,
		},
		{
			label: 'Annuler',
			type: 'button',
			variant: 'outline',
			onClick: () => onOpenChange(false),
			disabled: formState.isSubmitting,
		},
	];

	return (
		<CrudDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Créer une tâche"
			description="Remplissez les détails pour créer une nouvelle tâche"
			maxWidth="4xl"
			preventOutsideClick={true}
		>
			<DialogBody>
				<form id={FORM_ID} onSubmit={formState.handleSubmit}>
					{/* Two-column layout with resizable splitter */}
					<div ref={containerRef} className="flex min-h-[500px] gap-0">
						{/* Left Column - Basic Information */}
						<div className="flex flex-col space-y-4 pr-3 pb-6" style={{ width: `${leftWidth}%` }}>
							<h3 className="text-sm font-semibold text-foreground">Informations de base</h3>

							<TextAreaField
								label="Description"
								value={formState.formData.description}
								onChange={value => formState.updateField('description', value)}
								placeholder="Enter task description..."
								required
								rows={4}
								error={formState.validationErrors.description}
							/>

							<SelectField
								label="Priority"
								value={formState.formData.priority}
								onChange={value => formState.updateField('priority', value)}
								options={[
									{ value: 'low', label: 'Low' },
									{ value: 'medium', label: 'Medium' },
									{ value: 'high', label: 'High' },
									{ value: 'urgent', label: 'Urgent' },
								]}
								required
								error={formState.validationErrors.priority}
							/>

							{/* Hide project field if locked */}
							{!lockedFields.includes('projectId') && (
								<ComboboxField
									label="Project (Optional)"
									value={formState.formData.projectId}
									onChange={value => formState.updateField('projectId', value)}
									options={projects}
									placeholder={
										projectsLoading ? 'Loading projects...' : 'Select project or leave empty...'
									}
									disabled={projectsLoading}
									error={formState.validationErrors.projectId}
								/>
							)}

							{/* Hide worker field if locked */}
							{!lockedFields.includes('workerId') && (
								<ComboboxField
									label="Assign to Worker"
									value={formState.formData.workerId}
									onChange={value => formState.updateField('workerId', value)}
									options={workerOptions}
									placeholder="Select worker..."
									required
									disabled={workersLoading || workerOptions.length === 0}
									error={formState.validationErrors.workerId}
								/>
							)}

							{/* Show badges for locked fields */}
							{lockedFields.length > 0 && (
								<div className="rounded-md border border-primary/20 bg-primary/10 p-3">
									<p className="text-sm font-medium text-foreground">Auto-assigned:</p>
									<div className="mt-2 flex flex-wrap gap-2">
										{lockedFields.includes('workerId') && formState.formData.workerId && (
											<Badge variant="info">Worker: {formState.formData.workerId}</Badge>
										)}
										{lockedFields.includes('projectId') &&
											formState.formData.projectId &&
											projects.find(p => p.value === formState.formData.projectId) && (
												<Badge variant="info">
													Project:{' '}
													{
														projects.find(p => p.value === formState.formData.projectId)
															?.label
													}
												</Badge>
											)}
									</div>
								</div>
							)}
						</div>

						{/* Resizable Splitter */}
						<div
							className={`
         group relative flex w-1 cursor-col-resize items-center justify-center
         ${
				isDragging
					? 'bg-primary/50'
					: `
           bg-border
           hover:bg-primary/30
         `
			}
         transition-colors
       `}
							onMouseDown={handleMouseDown}
						>
							<div className="absolute flex items-center justify-center">
								<GripVertical
									className={`
           h-4 w-4
           ${
				isDragging
					? 'text-primary'
					: `
             text-muted-foreground
             group-hover:text-primary
           `
			}
         `}
								/>
							</div>
						</div>

						{/* Right Column - Flow Configuration */}
						<div className="flex flex-col space-y-4 pl-3 pb-6" style={{ width: `${100 - leftWidth}%` }}>
							<h3 className="text-sm font-semibold text-foreground">Configuration du flow</h3>

							<ComboboxField
								label="Flow (Optional)"
								value={formState.formData.flowId}
								onChange={value => formState.updateField('flowId', value)}
								options={flowOptions}
								placeholder={
									!formState.formData.workerId
										? 'Select a worker first...'
										: flowsLoading
											? 'Loading flows...'
											: flowOptions.length === 0
												? 'No flows available'
												: 'Select a flow...'
								}
								disabled={!formState.formData.workerId || flowsLoading}
							/>

							{/* Warning for invalid flows in the list */}
							{workerFlowsMetadata.some(f => !f.isValid) && (
								<div className="rounded-md border border-warning/20 bg-warning/10 p-3">
									<div className="flex items-start">
										<div className="flex-shrink-0">
											<AlertTriangle className="h-5 w-5 text-warning" />
										</div>
										<div className="ml-3 flex-1">
											<p className="text-sm text-foreground">
												Some flows have validation errors and cannot be selected. They can be
												edited in the Flow Editor.
											</p>
										</div>
									</div>
								</div>
							)}

							{/* Separator line after flow selector */}
							{formState.formData.flowId &&
								selectedFlow?.inputs &&
								Object.keys(selectedFlow.inputs).length > 0 && (
									<div className="border-t border-border" />
								)}

							{/* Dynamic Flow Inputs Section */}
							{selectedFlow?.inputs && Object.keys(selectedFlow.inputs).length > 0 && (
								<div className="space-y-4">
									<h4 className="text-sm font-semibold text-foreground">Paramètres</h4>
									<div className="space-y-3">
										{Object.entries(selectedFlow.inputs).map(([inputName, inputDef]) => (
											<div key={inputName} className="flex items-start gap-2">
												<div className="flex-1">{renderField(inputName, inputDef)}</div>
												{inputDef.source === 'auto-discovered' && (
													<Badge variant="info" className="mt-8">
														Auto
													</Badge>
												)}
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</form>
			</DialogBody>

			<DialogFooter>
				<FormActions actions={formActions} isSubmitting={formState.isSubmitting} />
			</DialogFooter>
		</CrudDialog>
	);
}
