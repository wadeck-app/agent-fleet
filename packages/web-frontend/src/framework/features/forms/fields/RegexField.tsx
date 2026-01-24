import { useState } from 'react';

import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';
import { Code } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * REGEX FIELD - Regular expression input with validation
 * ===========================================================================================
 *
 * Specialized field component for regex type inputs.
 *
 * - Text input with monospace font
 * - Real-time regex syntax validation
 * - Code icon indicator
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface RegexFieldOptions {
	validate?: boolean;
	testString?: string;
}

export interface RegexFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	options?: RegexFieldOptions;
}

export function RegexField({
	label,
	value,
	onChange,
	placeholder,
	required = false,
	disabled = false,
	options,
	error,
	className = '',
	id,
	description,
}: RegexFieldProps) {
	const inputId = generateFieldId(label, id);
	const [regexError, setRegexError] = useState<string | undefined>();

	const validateRegex = (pattern: string): boolean => {
		if (!pattern.trim()) {
			setRegexError(undefined);
			return true;
		}

		try {
			new RegExp(pattern);
			setRegexError(undefined);
			return true;
		} catch (e) {
			setRegexError((e as Error).message);
			return false;
		}
	};

	const handleChange = (newValue: string) => {
		onChange(newValue);
		if (options?.validate !== false) {
			validateRegex(newValue);
		}
	};

	const displayError = regexError || error;

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
					onChange={e => handleChange(e.target.value)}
					placeholder={placeholder || '^[a-zA-Z0-9]+$'}
					required={required}
					disabled={disabled}
					aria-invalid={!!displayError}
					className="pl-9 font-mono text-sm"
				/>
				<div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
					<Code className="h-4 w-4 text-muted-foreground" />
				</div>
			</div>
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{!displayError && value && options?.testString && (
				<p className="mt-1.5 text-xs text-muted-foreground">
					Test: {new RegExp(value).test(options.testString) ? '✓ Match' : '✗ No match'}
				</p>
			)}
			{displayError && <FieldError>{displayError}</FieldError>}
		</Field>
	);
}
