import { useEffect, useRef, useState } from 'react';

import { Input } from './Input';

export interface EditableTextProps {
	value: string | undefined;
	placeholder?: string;
	onSave: (newValue: string) => Promise<void>;
	onCancel?: () => void;
	maxLength?: number;
	className?: string;
	displayClassName?: string;
}

/**
 * Inline editable text component
 * Click to edit, Enter to save, Escape to cancel
 */
export function EditableText({
	value = '',
	placeholder = 'Click to edit',
	onSave,
	onCancel,
	maxLength = 100,
	className = '',
	displayClassName = '',
}: EditableTextProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(value);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Update editValue when value prop changes
	useEffect(() => {
		setEditValue(value);
	}, [value]);

	useEffect(() => {
		if (isEditing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [isEditing]);

	const handleSave = async () => {
		const trimmed = editValue.trim();

		// Validation
		if (trimmed === value) {
			setIsEditing(false);
			return;
		}

		if (trimmed.length === 0) {
			setError('Name cannot be empty');
			return;
		}

		if (trimmed.length > maxLength) {
			setError(`Name must be ${maxLength} characters or less`);
			return;
		}

		try {
			setIsSaving(true);
			setError(null);
			await onSave(trimmed);
			setIsEditing(false);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to save';
			setError(message);
		} finally {
			setIsSaving(false);
		}
	};

	const handleCancel = () => {
		setEditValue(value);
		setError(null);
		setIsEditing(false);
		onCancel?.();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSave();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			handleCancel();
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
					onBlur={handleSave}
					disabled={isSaving}
					maxLength={maxLength}
					className="text-sm"
				/>
				{error && <div className="text-xs text-destructive mt-1">{error}</div>}
			</div>
		);
	}

	return (
		<div
			className={`cursor-pointer hover:underline ${displayClassName}`}
			onClick={() => setIsEditing(true)}
			title="Click to edit"
		>
			{value || <span className="text-muted-foreground italic">{placeholder}</span>}
		</div>
	);
}
