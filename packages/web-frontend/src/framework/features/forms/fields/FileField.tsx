import { useRef } from 'react';

import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';
import { Button } from '@framework/components/primitives/Button';
import { File, Upload, X } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * FILE FIELD - File input with drag-and-drop support
 * ===========================================================================================
 *
 * Specialized field component for file type inputs.
 *
 * - File input with drag-and-drop zone
 * - Show file name when selected
 * - Validate extensions from options
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface FileFieldOptions {
	extensions?: string[];
	mustExist?: boolean;
}

export interface FileFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	options?: FileFieldOptions;
}

export function FileField({
	label,
	value,
	onChange,
	placeholder: _placeholder,
	required = false,
	disabled = false,
	options,
	error,
	className = '',
	id,
	description,
}: FileFieldProps) {
	const inputId = generateFieldId(label, id);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			onChange(file.name);
		}
	};

	const handleClear = () => {
		onChange('');
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
	};

	const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		const file = e.dataTransfer.files?.[0];
		if (file) {
			onChange(file.name);
		}
	};

	const acceptedExtensions = options?.extensions?.join(',') || '*';

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>

			<div
				className={`
      relative rounded-md border-2 border-dashed border-input bg-background p-4
      transition-colors
      hover:border-primary/50
    `}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
			>
				<Input
					ref={fileInputRef}
					id={inputId}
					type="file"
					accept={acceptedExtensions}
					onChange={handleFileSelect}
					disabled={disabled}
					className="absolute inset-0 cursor-pointer opacity-0"
					aria-invalid={!!error}
				/>

				{value ? (
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<File className="h-5 w-5 text-primary" />
							<span className="text-sm font-medium">{value}</span>
						</div>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleClear}
							disabled={disabled}
							aria-label="Clear file"
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
				) : (
					<div
						className={`
       flex flex-col items-center justify-center gap-2 text-center
     `}
					>
						<Upload className="h-8 w-8 text-muted-foreground" />
						<div className="text-sm">
							<span className="font-medium text-primary">Click to upload</span>
							<span className="text-muted-foreground"> or drag and drop</span>
						</div>
						{options?.extensions && (
							<p className="text-xs text-muted-foreground">Accepted: {options.extensions.join(', ')}</p>
						)}
					</div>
				)}
			</div>

			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
