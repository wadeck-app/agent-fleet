import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';
import { Folder } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * FOLDER FIELD - Folder path input
 * ===========================================================================================
 *
 * Specialized field component for folder type inputs.
 *
 * - Text input for path
 * - Folder icon indicator
 * - Note about browser limitations (no native browse)
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface FolderFieldOptions {
	mustExist?: boolean;
	createIfMissing?: boolean;
}

export interface FolderFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	options?: FolderFieldOptions;
}

export function FolderField({
	label,
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	error,
	className = '',
	id,
	description,
}: FolderFieldProps) {
	const inputId = generateFieldId(label, id);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<div className="relative">
				<Input
					id={inputId}
					type="text"
					value={value}
					onChange={e => onChange(e.target.value)}
					placeholder={placeholder || '/path/to/folder'}
					required={required}
					disabled={disabled}
					aria-invalid={!!error}
					className="pl-9"
				/>
				<div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
					<Folder className="h-4 w-4 text-muted-foreground" />
				</div>
			</div>
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			<p className="mt-1.5 text-xs text-muted-foreground">
				Note: Enter folder path manually. Browser security restricts folder browsing.
			</p>
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
