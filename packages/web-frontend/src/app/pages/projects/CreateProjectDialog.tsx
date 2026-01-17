import { useState } from 'react';

import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { ColorPicker } from '@framework/components/pickers/ColorPicker';
import { IconPicker } from '@framework/components/pickers/IconPicker';
import { FormContainer } from '@framework/features/forms/FormContainer';
import { TextAreaField } from '@framework/features/forms/fields/TextAreaField';
import { TextField } from '@framework/features/forms/fields/TextField';
import { useFormState } from '@framework/features/forms/useFormState';
import { useToast } from '@framework/features/toast/ToastContext';
import type { CreateProject } from '@shared/api/projects.contract';

import { projectsApi } from './projects.api';

interface CreateProjectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

interface CreateProjectFormData {
	name: string;
	description: string;
	icon: string;
	iconColor: string;
}

const defaultFormData: CreateProjectFormData = {
	name: '',
	description: '',
	icon: 'FolderKanban',
	iconColor: '#6366F1',
};

export function CreateProjectDialog({ open, onOpenChange, onSuccess }: CreateProjectDialogProps) {
	const { showToast } = useToast();

	const formState = useFormState<CreateProjectFormData>({
		defaultData: defaultFormData,
		validator: data => {
			const errors: Record<string, string> = {};

			if (!data.name?.trim()) {
				errors.name = 'Name is required';
			} else if (data.name.length > 100) {
				errors.name = 'Name must be less than 100 characters';
			}

			if (data.description && data.description.length > 500) {
				errors.description = 'Description must be less than 500 characters';
			}

			if (data.iconColor && !/^#[0-9A-Fa-f]{6}$/.test(data.iconColor)) {
				errors.iconColor = 'Icon color must be a valid hex color (e.g., #6366F1)';
			}

			return {
				valid: Object.keys(errors).length === 0,
				errors: Object.values(errors),
			};
		},
		errorFieldMapping: {
			'Name is required': 'name',
			'Name must be less than 100 characters': 'name',
			'Description must be less than 500 characters': 'description',
			'Icon color must be a valid hex color (e.g., #6366F1)': 'iconColor',
		},
		onSubmit: async data => {
			const createProjectData: CreateProject = {
				name: data.name.trim(),
				description: data.description?.trim() || undefined,
				icon: (data.icon?.trim() || undefined) as CreateProject['icon'],
				iconColor: data.iconColor?.trim() || undefined,
				workspaceIds: [],
				archived: false,
			};

			try {
				await projectsApi.createProject(createProjectData);
				showToast('Project created successfully', 'success');
				onSuccess();
				onOpenChange(false);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
				showToast(errorMessage, 'error');
				console.error('Failed to create project:', error);
				throw error;
			}
		},
	});

	return (
		<CrudDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Create New Project"
			description="Fill in the details to create a new project"
			maxWidth="lg"
		>
			<FormContainer
				isSubmitting={formState.isSubmitting}
				onSubmit={formState.handleSubmit}
				onCancel={() => onOpenChange(false)}
				submitLabel="Create Project"
			>
				<div className="col-span-2">
					<TextField
						label="Name"
						value={formState.formData.name}
						onChange={value => formState.updateField('name', value)}
						placeholder="Enter project name..."
						required
						error={formState.validationErrors.name}
					/>
				</div>

				<div className="col-span-2">
					<TextAreaField
						label="Description"
						value={formState.formData.description}
						onChange={value => formState.updateField('description', value)}
						placeholder="Enter project description (optional)..."
						rows={4}
						error={formState.validationErrors.description}
					/>
				</div>

				<div className="col-span-2">
					<Field>
						<FieldLabel>Icon</FieldLabel>
						<IconPicker
							value={formState.formData.icon}
							onChange={value => formState.updateField('icon', value)}
							iconColor={formState.formData.iconColor}
						/>
						{formState.validationErrors.icon && <FieldError>{formState.validationErrors.icon}</FieldError>}
					</Field>
				</div>

				<div className="col-span-2">
					<Field>
						<FieldLabel>Icon Color</FieldLabel>
						<ColorPicker
							value={formState.formData.iconColor}
							onChange={value => formState.updateField('iconColor', value)}
						/>
						{formState.validationErrors.iconColor && (
							<FieldError>{formState.validationErrors.iconColor}</FieldError>
						)}
					</Field>
					<div className="mt-2 flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Preview:</span>
						<DynamicLucideIcon
							name={formState.formData.icon}
							color={formState.formData.iconColor || '#6366F1'}
							className="h-6 w-6"
						/>
					</div>
				</div>
			</FormContainer>
		</CrudDialog>
	);
}
