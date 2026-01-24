import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';
import { ExternalLink } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * URL FIELD - URL input with validation and icon
 * ===========================================================================================
 *
 * Specialized field component for URL inputs with client-side validation.
 *
 * - Text input with URL type
 * - Protocol icon (http/https)
 * - Client-side URL validation
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface UrlFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

export function UrlField({
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
}: UrlFieldProps) {
	const inputId = generateFieldId(label, id);

	// Simple URL validation
	const isValidUrl = (url: string): boolean => {
		if (!url.trim()) return true;
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	};

	const validationError = value && !isValidUrl(value) ? 'Invalid URL format' : error;

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<div className="relative">
				<Input
					id={inputId}
					type="url"
					value={value}
					onChange={e => onChange(e.target.value)}
					placeholder={placeholder || 'https://example.com'}
					required={required}
					disabled={disabled}
					aria-invalid={!!validationError}
					className="pl-9"
				/>
				<div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
					<ExternalLink className="h-4 w-4 text-muted-foreground" />
				</div>
			</div>
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{validationError && <FieldError>{validationError}</FieldError>}
		</Field>
	);
}
