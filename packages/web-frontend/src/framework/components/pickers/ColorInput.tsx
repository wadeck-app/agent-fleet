import React, { useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { cn } from '@framework/lib/utils';

interface ColorInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
}

export function ColorInput({ value, onChange, placeholder = '#000000', className, disabled }: ColorInputProps) {
	const [localValue, setLocalValue] = useState(value);

	// Validate hex color format
	const isValidHex = (color: string): boolean => {
		return /^#[0-9A-Fa-f]{6}$/.test(color);
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		setLocalValue(newValue);

		if (isValidHex(newValue)) {
			onChange(newValue);
		}
	};

	const handleBlur = () => {
		// Reset to last valid value on blur if invalid
		if (!isValidHex(localValue)) {
			setLocalValue(value);
		}
	};

	const displayColor = isValidHex(localValue) ? localValue : placeholder;

	return (
		<div className={cn('relative', className)}>
			<Input
				type="text"
				value={localValue}
				onChange={handleChange}
				onBlur={handleBlur}
				placeholder={placeholder}
				disabled={disabled}
				className="pl-10"
				aria-invalid={!isValidHex(localValue)}
			/>
			{/* Color preview square */}
			<div
				className="absolute left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded border border-border"
				style={{ backgroundColor: displayColor }}
				aria-hidden="true"
			/>
		</div>
	);
}
