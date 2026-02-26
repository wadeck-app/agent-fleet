import React from 'react';

import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { DialogBody, DialogFooter } from '@framework/components/overlays/Dialog';
import { ColorPicker } from '@framework/components/pickers/ColorPicker';
import { type FormAction, FormActions } from '@framework/features/forms/FormActions';
import { FormContainer } from '@framework/features/forms/FormContainer';
import { RadioGroupField, type RadioOption } from '@framework/features/forms/fields/RadioGroupField';
import { SelectField, type SelectOption } from '@framework/features/forms/fields/SelectField';
import { TextAreaField } from '@framework/features/forms/fields/TextAreaField';
import { TextField } from '@framework/features/forms/fields/TextField';
import { useFormState } from '@framework/features/forms/useFormState';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { CreateWorkspaceDto, Workspace } from '@shared/api/workspaces.contract';

import { workspacesApi } from './workspaces.api';

interface CreateWorkspaceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: (workspace: Workspace) => void;
}

interface CreateWorkspaceFormData {
	path: string;
	name: string;
	description: string;
	color: string;
	mode: 'development' | 'production' | 'staging';
	gitStrategy: 'none' | 'clone' | 'worktree';
	repositoryUrl: string;
	branch: string;
	sourceWorkspaceId: string;
}

const defaultFormData: CreateWorkspaceFormData = {
	path: '',
	name: '',
	description: '',
	color: '#6366F1',
	mode: 'development',
	gitStrategy: 'none',
	repositoryUrl: '',
	branch: '',
	sourceWorkspaceId: '',
};

const modeOptions: SelectOption[] = [
	{ value: 'development', label: 'Development' },
	{ value: 'production', label: 'Production' },
	{ value: 'staging', label: 'Staging' },
];

const gitStrategyOptions: RadioOption[] = [
	{ value: 'none', label: 'None (Empty folder)' },
	{ value: 'clone', label: 'Clone Repository' },
	{ value: 'worktree', label: 'Git Worktree (Coming Soon)', disabled: true },
];

const FORM_ID = 'create-workspace-form';

export function CreateWorkspaceDialog({ open, onOpenChange, onSuccess }: CreateWorkspaceDialogProps) {
	const { showToast } = useToast();

	const formState = useFormState<CreateWorkspaceFormData>({
		defaultData: defaultFormData,
		validator: data => {
			const errors: Record<string, string> = {};

			if (!data.path?.trim()) {
				errors.path = 'Path is required';
			}

			if (data.gitStrategy === 'clone') {
				if (!data.repositoryUrl?.trim()) {
					errors.repositoryUrl = 'Repository URL is required for clone strategy';
				} else {
					try {
						new URL(data.repositoryUrl);
					} catch {
						errors.repositoryUrl = 'Must be a valid URL';
					}
				}
			}

			return {
				valid: Object.keys(errors).length === 0,
				errors: Object.values(errors),
			};
		},
		errorFieldMapping: {
			'Path is required': 'path',
			'Repository URL is required for clone strategy': 'repositoryUrl',
			'Must be a valid URL': 'repositoryUrl',
		},
		onSubmit: async data => {
			const createWorkspaceData: CreateWorkspaceDto = {
				path: data.path.trim(),
				name: data.name?.trim() || undefined,
				description: data.description?.trim() || undefined,
				color: data.color?.trim() || undefined,
				mode: data.mode,
			};

			// Add git options if strategy is not 'none'
			if (data.gitStrategy !== 'none') {
				createWorkspaceData.gitOptions = {
					strategy: data.gitStrategy,
				};

				if (data.gitStrategy === 'clone') {
					createWorkspaceData.gitOptions.repositoryUrl = data.repositoryUrl.trim();
					if (data.branch?.trim()) {
						createWorkspaceData.gitOptions.branch = data.branch.trim();
					}
				} else if (data.gitStrategy === 'worktree') {
					createWorkspaceData.gitOptions.sourceWorkspaceId = data.sourceWorkspaceId.trim();
					if (data.branch?.trim()) {
						createWorkspaceData.gitOptions.branch = data.branch.trim();
					}
				}
			}

			try {
				const workspace = await workspacesApi.createWorkspace(createWorkspaceData);
				showToast('Workspace created successfully', 'success');
				onSuccess(workspace);
				onOpenChange(false);
			} catch (error) {
				showToast(getErrorMessage(error), 'error');
				console.error('Failed to create workspace:', error);
				throw error;
			}
		},
	});

	// Define form actions
	const formActions: FormAction[] = [
		{
			label: formState.isSubmitting ? 'Saving...' : 'Create Workspace',
			type: 'submit',
			formId: FORM_ID,
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
			title="Create New Workspace"
			description="Fill in the details to create a new workspace"
			maxWidth="lg"
			preventOutsideClick={true}
		>
			<DialogBody>
				<FormContainer id={FORM_ID} onSubmit={formState.handleSubmit}>
					{/* Basic Fields */}
					<div className="col-span-2">
						<TextField
							label="Path"
							value={formState.formData.path}
							onChange={value => formState.updateField('path', value)}
							placeholder="Enter workspace path (absolute)..."
							required
							error={formState.validationErrors.path}
						/>
					</div>

					<div className="col-span-2">
						<TextField
							label="Name"
							value={formState.formData.name}
							onChange={value => formState.updateField('name', value)}
							placeholder="Enter workspace name (optional)..."
							error={formState.validationErrors.name}
						/>
					</div>

					<div className="col-span-2">
						<TextAreaField
							label="Description"
							value={formState.formData.description}
							onChange={value => formState.updateField('description', value)}
							placeholder="Enter workspace description (optional)..."
							rows={3}
							error={formState.validationErrors.description}
						/>
					</div>

					<div className="col-span-2">
						<Field>
							<FieldLabel>Color</FieldLabel>
							<ColorPicker
								value={formState.formData.color}
								onChange={value => formState.updateField('color', value)}
							/>
							{formState.validationErrors.color && (
								<FieldError>{formState.validationErrors.color}</FieldError>
							)}
						</Field>
					</div>

					<div className="col-span-2">
						<SelectField
							label="Mode"
							value={formState.formData.mode}
							onChange={value => formState.updateField('mode', value as CreateWorkspaceFormData['mode'])}
							options={modeOptions}
							placeholder="Select workspace mode..."
							error={formState.validationErrors.mode}
						/>
					</div>

					{/* Git Options */}
					<div className="col-span-2">
						<RadioGroupField
							label="Git Strategy"
							value={formState.formData.gitStrategy}
							onChange={value =>
								formState.updateField('gitStrategy', value as CreateWorkspaceFormData['gitStrategy'])
							}
							options={gitStrategyOptions}
							orientation="vertical"
							error={formState.validationErrors.gitStrategy}
						/>
					</div>

					{/* Conditional fields based on git strategy */}
					{formState.formData.gitStrategy === 'clone' && (
						<>
							<div className="col-span-2">
								<TextField
									label="Repository URL"
									value={formState.formData.repositoryUrl}
									onChange={value => formState.updateField('repositoryUrl', value)}
									placeholder="https://github.com/user/repo.git"
									required
									error={formState.validationErrors.repositoryUrl}
								/>
							</div>

							<div className="col-span-2">
								<TextField
									label="Branch"
									value={formState.formData.branch}
									onChange={value => formState.updateField('branch', value)}
									placeholder="main (optional)"
									error={formState.validationErrors.branch}
								/>
							</div>
						</>
					)}

					{formState.formData.gitStrategy === 'worktree' && (
						<>
							<div className="col-span-2">
								<TextField
									label="Source Workspace"
									value={formState.formData.sourceWorkspaceId}
									onChange={value => formState.updateField('sourceWorkspaceId', value)}
									placeholder="Coming Soon"
									disabled
									error={formState.validationErrors.sourceWorkspaceId}
								/>
								<p className="mt-1 text-xs text-muted-foreground">
									Git worktree support is coming soon. Please use clone strategy for now.
								</p>
							</div>

							<div className="col-span-2">
								<TextField
									label="Branch"
									value={formState.formData.branch}
									onChange={value => formState.updateField('branch', value)}
									placeholder="feature/new-branch"
									disabled
									error={formState.validationErrors.branch}
								/>
							</div>
						</>
					)}
				</FormContainer>
			</DialogBody>

			<DialogFooter>
				<FormActions actions={formActions} isSubmitting={formState.isSubmitting} />
			</DialogFooter>
		</CrudDialog>
	);
}
