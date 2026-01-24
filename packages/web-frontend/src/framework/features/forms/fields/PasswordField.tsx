import { useState } from 'react';

import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';
import { Button } from '@framework/components/primitives/Button';
import { Eye, EyeOff } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * PASSWORD FIELD - Password input with visibility toggle
 * ===========================================================================================
 *
 * Specialized field component for password inputs with show/hide toggle.
 *
 * - Masked input by default
 * - Toggle visibility button
 * - Uses shadcn Field system
 * - Consistent styling with other fields
 *
 * ===========================================================================================
 */

export interface PasswordFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

export function PasswordField({
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
}: PasswordFieldProps) {
	const inputId = generateFieldId(label, id);
	const [showPassword, setShowPassword] = useState(false);

	return (
		<Field className={className} data-disabled={disabled}>
			<FieldLabel htmlFor={inputId}>
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</FieldLabel>
			<div className="relative">
				<Input
					id={inputId}
					type={showPassword ? 'text' : 'password'}
					value={value}
					onChange={e => onChange(e.target.value)}
					placeholder={placeholder}
					required={required}
					disabled={disabled}
					aria-invalid={!!error}
					className="pr-10"
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
					onClick={() => setShowPassword(!showPassword)}
					disabled={disabled}
					aria-label={showPassword ? 'Hide password' : 'Show password'}
				>
					{showPassword ? (
						<EyeOff className="h-4 w-4 text-muted-foreground" />
					) : (
						<Eye className="h-4 w-4 text-muted-foreground" />
					)}
				</Button>
			</div>
			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
