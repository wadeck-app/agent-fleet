import { useEffect, useMemo, useState } from 'react';

import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { FormContainer } from '@framework/features/forms/FormContainer';
import { SelectField, type SelectOption } from '@framework/features/forms/fields/SelectField';
import { TextAreaField } from '@framework/features/forms/fields/TextAreaField';
import { TextField } from '@framework/features/forms/fields/TextField';
import { useFormState } from '@framework/features/forms/useFormState';
import type { FlowMetadata } from '@shared/api/flows.contract';
import type { CreateTask } from '@shared/api/tasks.contract';

import { useWorkers } from '../workers/useWorkers';
import { workersApi } from '../workers/workers.api';
import { tasksService } from './TasksService';

interface CreateTaskDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

// Flat form data structure for useFormState compatibility
interface CreateTaskFormData {
	description: string;
	priority: string;
	workerId: string;
	flowId: string;
}

const defaultFormData: CreateTaskFormData = {
	description: '',
	priority: 'medium',
	workerId: '',
	flowId: '',
};

export function CreateTaskDialog({ open, onOpenChange, onSuccess }: CreateTaskDialogProps) {
	const { data: workersData, loading: workersLoading } = useWorkers();
	const [workerFlowsMetadata, setWorkerFlowsMetadata] = useState<FlowMetadata[]>([]);
	const [flowsLoading, setFlowsLoading] = useState(false);
	const [flowInputs, setFlowInputs] = useState<Record<string, string>>({});

	// Transform workers to SelectOption format
	const workerOptions: SelectOption[] =
		workersData?.workers.map(w => ({
			value: w.workerId,
			label: `${w.workerId}${w.taskId ? ' (busy)' : ' (idle)'}`,
		})) || [];

	const formState = useFormState<CreateTaskFormData>({
		defaultData: defaultFormData,
		validator: data => {
			const errors: Record<string, string> = {};

			if (!data.description?.trim()) {
				errors.description = 'Description is required';
			}

			if (!data.priority) {
				errors.priority = 'Priority is required';
			}

			if (!data.workerId) {
				errors.workerId = 'Worker assignment is required';
			}

			// Validate flow inputs if flow is selected
			// Find the selected flow to check its inputs
			const selectedFlow = workerFlowsMetadata.find(f => f.id === data.flowId);
			if (data.flowId && selectedFlow?.inputs) {
				for (const [inputName] of Object.entries(selectedFlow.inputs)) {
					if (!flowInputs[inputName]?.trim()) {
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
			const createTaskData: CreateTask = {
				description: data.description,
				priority: data.priority as CreateTask['priority'],
				assignedTo: { workerId: data.workerId },
				flowId: data.flowId || undefined,
				// Pass the actual flow inputs if flow is selected
				flowInputs: data.flowId && Object.keys(flowInputs).length > 0 ? flowInputs : undefined,
			};
			await tasksService.createTask(createTaskData);
			onSuccess();
			onOpenChange(false);
		},
	});

	// Get selected flow metadata (computed after formState is defined)
	const selectedFlow = useMemo(
		() => workerFlowsMetadata.find(f => f.id === formState.formData.flowId),
		[workerFlowsMetadata, formState.formData.flowId]
	);

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
			// Initialize flow inputs with empty strings
			const initialInputs: Record<string, string> = {};
			for (const inputName of Object.keys(selectedFlow.inputs)) {
				initialInputs[inputName] = '';
			}
			setFlowInputs(initialInputs);
		} else {
			setFlowInputs({});
		}
	}, [selectedFlow]);

	// Convert flow metadata to select options
	const flowOptions: SelectOption[] = workerFlowsMetadata.map(flow => ({
		value: flow.id,
		label: flow.name || flow.id,
	}));

	return (
		<CrudDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Create New Task"
			description="Fill in the details to create a new task"
			maxWidth="lg"
		>
			<FormContainer
				isSubmitting={formState.isSubmitting}
				onSubmit={formState.handleSubmit}
				onCancel={() => onOpenChange(false)}
				submitLabel="Create Task"
			>
				<div className="col-span-2">
					<TextAreaField
						label="Description"
						value={formState.formData.description}
						onChange={value => formState.updateField('description', value)}
						placeholder="Enter task description..."
						required
						rows={4}
						error={formState.validationErrors.description}
					/>
				</div>

				<div className="col-span-2">
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
				</div>

				<div className="col-span-2">
					<SelectField
						label="Assign to Worker"
						value={formState.formData.workerId}
						onChange={value => formState.updateField('workerId', value)}
						options={workerOptions}
						placeholder="Select worker..."
						required
						disabled={workersLoading || workerOptions.length === 0}
						error={formState.validationErrors.workerId}
					/>
				</div>

				<div className="col-span-2">
					<SelectField
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
				</div>

				{/* Dynamic Flow Inputs Section */}
				{selectedFlow?.inputs && Object.keys(selectedFlow.inputs).length > 0 && (
					<div className="col-span-2 space-y-4">
						<div className="border-t border-gray-200 dark:border-gray-700 pt-4">
							<h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Flow Inputs</h3>
							<div className="space-y-3 pl-2 border-l-2 border-blue-500 dark:border-blue-400">
								{Object.entries(selectedFlow.inputs).map(([inputName, inputType]) => {
									const value = flowInputs[inputName] || '';
									const error = formState.validationErrors[`input_${inputName}`];

									// Render different input types based on the variable type
									if (inputType === 'string') {
										return (
											<div key={inputName}>
												<TextField
													label={inputName}
													value={value}
													onChange={val =>
														setFlowInputs(prev => ({ ...prev, [inputName]: val }))
													}
													placeholder={`Enter ${inputName}...`}
													required
													error={error}
												/>
											</div>
										);
									}

									// For now, treat all other types as text inputs
									// TODO: Add number, boolean, object input handling
									return (
										<div key={inputName}>
											<TextField
												label={`${inputName} (${inputType})`}
												value={value}
												onChange={val => setFlowInputs(prev => ({ ...prev, [inputName]: val }))}
												placeholder={`Enter ${inputName} (${inputType})...`}
												required
												error={error}
											/>
										</div>
									);
								})}
							</div>
						</div>
					</div>
				)}
			</FormContainer>
		</CrudDialog>
	);
}
