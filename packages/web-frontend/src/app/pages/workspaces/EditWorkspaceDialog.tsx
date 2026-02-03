import React, { useMemo } from 'react';

import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { DialogBody, DialogFooter } from '@framework/components/overlays/Dialog';
import { ColorPicker } from '@framework/components/pickers/ColorPicker';
import { type FormAction, FormActions } from '@framework/features/forms/FormActions';
import { FormContainer } from '@framework/features/forms/FormContainer';
import { TextAreaField } from '@framework/features/forms/fields/TextAreaField';
import { TextField } from '@framework/features/forms/fields/TextField';
import { useFormState } from '@framework/features/forms/useFormState';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Workspace } from '@shared/api/workspaces.contract';

interface EditWorkspaceDialogProps {
	workspace: Workspace;
	open: boolean;
	onClose: () => void;
	onSave: (workspaceId: string, data: { name?: string; description?: string; color?: string }) => Promise<void>;
}

interface EditWorkspaceFormData {
	name: string;
	description: string;
	color: string;
}

const defaultFormData: EditWorkspaceFormData = {
	name: '',
	description: '',
	color: '#6366F1',
};

const FORM_ID = 'edit-workspace-form';

export function EditWorkspaceDialog({ workspace, open, onClose, onSave }: EditWorkspaceDialogProps) {
	const { showToast } = useToast();

	const initialData = useMemo(
		() => ({
			name: workspace.name || '',
			description: workspace.description || '',
			color: workspace.color || '#6366F1',
		}),
		[workspace.name, workspace.description, workspace.color]
	);

	const formState = useFormState<EditWorkspaceFormData>({
		defaultData: defaultFormData,
		initialData,
		validator: data => {
			const errors: Record<string, string> = {};

			if (data.name && data.name.length > 100) {
				errors.name = 'Name must be less than 100 characters';
			}

			if (data.description && data.description.length > 500) {
				errors.description = 'Description must be less than 500 characters';
			}

			if (data.color && !/^#[0-9A-Fa-f]{6}$/.test(data.color)) {
				errors.color = 'Color must be a valid hex color (e.g., #6366F1)';
			}

			return {
				valid: Object.keys(errors).length === 0,
				errors: Object.values(errors),
			};
		},
		errorFieldMapping: {
			'Name must be less than 100 characters': 'name',
			'Description must be less than 500 characters': 'description',
			'Color must be a valid hex color (e.g., #6366F1)': 'color',
		},
		onSubmit: async data => {
			try {
				await onSave(workspace.id, {
					name: data.name || undefined,
					description: data.description || undefined,
					color: data.color,
				});
				showToast('Workspace updated successfully', 'success');
				onClose();
			} catch (error) {
				showToast(getErrorMessage(error), 'error');
				throw error;
			}
		},
	});

	// Define form actions
	const formActions: FormAction[] = [
		{
			label: formState.isSubmitting ? 'Saving...' : 'Save Changes',
			type: 'submit',
			formId: FORM_ID,
			disabled: formState.isSubmitting,
		},
		{
			label: 'Annuler',
			type: 'button',
			variant: 'outline',
			onClick: onClose,
			disabled: formState.isSubmitting,
		},
	];

	return (
		<CrudDialog
			open={open}
			onOpenChange={onClose}
			title="Edit Workspace"
			description="Update workspace metadata"
			maxWidth="md"
			preventOutsideClick={true}
		>
			<DialogBody>
				<FormContainer
					id={FORM_ID}
					onSubmit={formState.handleSubmit}
					disableDefaultLayout
					className="space-y-4"
				>
					<TextField
						label="Name"
						value={formState.formData.name}
						onChange={value => formState.updateField('name', value)}
						placeholder="Enter workspace name"
						error={formState.validationErrors.name}
					/>

					<TextAreaField
						label="Description"
						value={formState.formData.description}
						onChange={value => formState.updateField('description', value)}
						placeholder="Enter workspace description"
						rows={3}
						error={formState.validationErrors.description}
					/>

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
				</FormContainer>
			</DialogBody>

			<DialogFooter>
				<FormActions actions={formActions} isSubmitting={formState.isSubmitting} />
			</DialogFooter>
		</CrudDialog>
	);
}
