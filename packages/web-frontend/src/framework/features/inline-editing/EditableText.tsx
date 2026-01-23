import { useEffect, useRef } from 'react';

import { Input } from '@framework/components/forms/Input';
import { useEditableText } from '@framework/hooks/useEditableText';
import type { Validator } from '@framework/utils/validation/textValidation';
import { createValidator, validateMaxLength, validateNotEmpty } from '@framework/utils/validation/textValidation';

/**
 * ===========================================================================================
 * EDITABLE TEXT - Inline Editing Feature Component
 * ===========================================================================================
 *
 * A feature-level component for inline text editing.
 * Click to edit, Enter to save, Escape to cancel.
 *
 * This is NOT a primitive form component - it contains domain-specific behavior:
 * - Edit state management
 * - Validation
 * - Error handling
 * - Async save operations
 *
 * Location: framework/features/inline-editing/
 * (Previously misplaced in framework/components/forms/)
 *
 * Example usage:
 * ```typescript
 * <EditableText
 *   value={task.name}
 *   onSave={async (newName) => {
 *     await tasksApi.update(task.id, { name: newName });
 *   }}
 *   fieldName="Task name"
 *   maxLength={100}
 * />
 * ```
 *
 * ===========================================================================================
 */

export interface EditableTextProps {
	/**
	 * Current value of the text
	 */
	value: string | undefined;

	/**
	 * Placeholder text when value is empty
	 */
	placeholder?: string;

	/**
	 * Async function to save the new value
	 */
	onSave: (newValue: string) => Promise<void>;

	/**
	 * Optional callback when edit is cancelled
	 */
	onCancel?: () => void;

	/**
	 * Maximum length of the text
	 */
	maxLength?: number;

	/**
	 * Name of the field for validation messages (e.g., "Name", "Title")
	 * If not provided, generic "Value" will be used in error messages
	 */
	fieldName?: string;

	/**
	 * Custom validation function
	 * If not provided, default validation (not empty + max length) is used
	 */
	validation?: Validator;

	/**
	 * Optional callback after successful save
	 */
	onSuccess?: () => void;

	/**
	 * Optional callback when save fails
	 */
	onError?: (error: string) => void;

	/**
	 * CSS class for the container
	 */
	className?: string;

	/**
	 * CSS class for the display mode
	 */
	displayClassName?: string;
}

/**
 * Inline editable text component with validation and async save
 *
 * @example
 * ```typescript
 * // Basic usage
 * <EditableText
 *   value={project.name}
 *   onSave={async (newName) => await updateProject({ name: newName })}
 * />
 *
 * // With field name for better error messages
 * <EditableText
 *   value={task.title}
 *   onSave={async (newTitle) => await updateTask({ title: newTitle })}
 *   fieldName="Task title"
 *   maxLength={200}
 * />
 *
 * // With custom validation
 * <EditableText
 *   value={workspace.slug}
 *   onSave={async (newSlug) => await updateWorkspace({ slug: newSlug })}
 *   validation={(v) => /^[a-z0-9-]+$/.test(v) ? null : 'Only lowercase letters, numbers, and hyphens allowed'}
 * />
 * ```
 */
export function EditableText({
	value = '',
	placeholder = 'Click to edit',
	onSave,
	onCancel,
	maxLength = 100,
	fieldName = 'Value',
	validation,
	onSuccess,
	onError,
	className = '',
	displayClassName = '',
}: EditableTextProps) {
	const inputRef = useRef<HTMLInputElement>(null);

	// Create default validation if not provided
	const defaultValidation = createValidator(
		v => validateNotEmpty(v, fieldName),
		v => validateMaxLength(v, maxLength, fieldName)
	);

	const { isEditing, editValue, isSaving, error, setEditValue, startEdit, cancelEdit, saveEdit } = useEditableText({
		initialValue: value,
		onSave,
		validation: validation || defaultValidation,
		onCancel,
		onSuccess,
		onError,
	});

	// Focus input when entering edit mode
	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	};

	if (isEditing) {
		return (
			<div className={className}>
				<Input
					ref={inputRef}
					value={editValue}
					onChange={e => setEditValue(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={saveEdit}
					disabled={isSaving}
					maxLength={maxLength}
					className="text-sm"
				/>
				{error && <div className="mt-1 text-xs text-destructive">{error}</div>}
			</div>
		);
	}

	return (
		<div
			className={`
     cursor-pointer
     hover:underline
     ${displayClassName}
   `}
			onClick={startEdit}
			title="Click to edit"
		>
			{value || <span className="italic text-muted-foreground">{placeholder}</span>}
		</div>
	);
}
