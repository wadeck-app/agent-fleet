import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';
import { Button } from '@framework/components/primitives/Button';
import { Plus, Trash2 } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * ARRAY FIELD - Dynamic list of text inputs
 * ===========================================================================================
 *
 * Specialized field component for array type inputs.
 *
 * - List of text inputs with add/remove buttons
 * - Each item on its own line
 * - Returns array of strings as JSON
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface ArrayFieldOptions {
	minItems?: number;
	maxItems?: number;
	unique?: boolean;
}

export interface ArrayFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	options?: ArrayFieldOptions;
}

export function ArrayField({
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
}: ArrayFieldProps) {
	const inputId = generateFieldId(label, id);

	// Parse value as JSON array or empty array
	const items: string[] = (() => {
		try {
			const parsed = value ? JSON.parse(value) : [];
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	})();

	const handleItemChange = (index: number, newValue: string) => {
		const newItems = [...items];
		newItems[index] = newValue;
		onChange(JSON.stringify(newItems));
	};

	const handleAddItem = () => {
		if (options?.maxItems && items.length >= options.maxItems) return;
		const newItems = [...items, ''];
		onChange(JSON.stringify(newItems));
	};

	const handleRemoveItem = (index: number) => {
		if (options?.minItems && items.length <= options.minItems) return;
		const newItems = items.filter((_, i) => i !== index);
		onChange(JSON.stringify(newItems));
	};

	const canAdd = !options?.maxItems || items.length < options.maxItems;
	const canRemove = !options?.minItems || items.length > options.minItems;

	return (
		<Field className={className} data-disabled={disabled}>
			<div className="flex items-center justify-between">
				<FieldLabel htmlFor={inputId}>
					{label}
					{required && <span className="ml-1 text-destructive">*</span>}
				</FieldLabel>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleAddItem}
					disabled={disabled || !canAdd}
					className="h-7"
				>
					<Plus className="h-3.5 w-3.5 mr-1" />
					Add Item
				</Button>
			</div>

			<div className="space-y-2">
				{items.length === 0 ? (
					<div className="rounded-md border border-input bg-muted/50 p-4 text-center text-sm text-muted-foreground">
						No items. Click "Add Item" to start.
					</div>
				) : (
					items.map((item, index) => (
						<div key={index} className="flex items-center gap-2">
							<div className="flex-1">
								<Input
									type="text"
									value={item}
									onChange={e => handleItemChange(index, e.target.value)}
									placeholder={placeholder || `Item ${index + 1}`}
									disabled={disabled}
								/>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => handleRemoveItem(index)}
								disabled={disabled || !canRemove}
								aria-label={`Remove item ${index + 1}`}
								className="h-10 px-2"
							>
								<Trash2 className="h-4 w-4 text-destructive" />
							</Button>
						</div>
					))
				)}
			</div>

			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{options?.minItems && (
				<p className="mt-1 text-xs text-muted-foreground">Minimum items: {options.minItems}</p>
			)}
			{options?.maxItems && (
				<p className="mt-1 text-xs text-muted-foreground">Maximum items: {options.maxItems}</p>
			)}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
