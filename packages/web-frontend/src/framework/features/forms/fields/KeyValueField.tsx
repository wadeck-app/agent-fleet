import { Field } from '@framework/components/advanced/Field/Field';
import { FieldError } from '@framework/components/advanced/Field/FieldError';
import { FieldLabel } from '@framework/components/advanced/Field/FieldLabel';
import { Input } from '@framework/components/forms/Input';
import { Button } from '@framework/components/primitives/Button';
import { Plus, Trash2 } from 'lucide-react';

import { type BaseFieldProps, generateFieldId } from '../fieldUtils';

/**
 * ===========================================================================================
 * KEY-VALUE FIELD - Dynamic list of key-value pairs
 * ===========================================================================================
 *
 * Specialized field component for keyvalue type inputs.
 *
 * - List of key-value pairs with add/remove buttons
 * - Each pair on its own line
 * - Returns object as JSON {key: value}
 * - Uses shadcn Field system
 *
 * ===========================================================================================
 */

export interface KeyValueFieldOptions {
	minPairs?: number;
	maxPairs?: number;
}

export interface KeyValueFieldProps extends BaseFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	options?: KeyValueFieldOptions;
}

interface KeyValuePair {
	key: string;
	value: string;
}

export function KeyValueField({
	label,
	value,
	onChange,
	disabled = false,
	options,
	error,
	className = '',
	id,
	description,
	required = false,
}: KeyValueFieldProps) {
	const inputId = generateFieldId(label, id);

	// Parse value as JSON object and convert to array of pairs
	const pairs: KeyValuePair[] = (() => {
		try {
			const parsed = value ? JSON.parse(value) : {};
			if (typeof parsed === 'object' && !Array.isArray(parsed)) {
				return Object.entries(parsed).map(([key, val]) => ({
					key,
					value: String(val),
				}));
			}
			return [];
		} catch {
			return [];
		}
	})();

	const handlePairChange = (index: number, field: 'key' | 'value', newValue: string) => {
		const newPairs = [...pairs];
		newPairs[index][field] = newValue;

		const obj: Record<string, string> = {};
		newPairs.forEach(pair => {
			if (pair.key.trim()) {
				obj[pair.key] = pair.value;
			}
		});
		onChange(JSON.stringify(obj));
	};

	const handleAddPair = () => {
		if (options?.maxPairs && pairs.length >= options.maxPairs) return;
		const newPairs = [...pairs, { key: '', value: '' }];
		const obj: Record<string, string> = {};
		newPairs.forEach(pair => {
			if (pair.key.trim()) {
				obj[pair.key] = pair.value;
			}
		});
		onChange(JSON.stringify(obj));
	};

	const handleRemovePair = (index: number) => {
		if (options?.minPairs && pairs.length <= options.minPairs) return;
		const newPairs = pairs.filter((_, i) => i !== index);
		const obj: Record<string, string> = {};
		newPairs.forEach(pair => {
			if (pair.key.trim()) {
				obj[pair.key] = pair.value;
			}
		});
		onChange(JSON.stringify(obj));
	};

	const canAdd = !options?.maxPairs || pairs.length < options.maxPairs;
	const canRemove = !options?.minPairs || pairs.length > options.minPairs;

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
					onClick={handleAddPair}
					disabled={disabled || !canAdd}
					className="h-7"
				>
					<Plus className="mr-1 h-3.5 w-3.5" />
					Add Pair
				</Button>
			</div>

			<div className="space-y-2">
				{pairs.length === 0 ? (
					<div
						className={`
       rounded-md border border-input bg-muted/50 p-4 text-center text-sm
       text-muted-foreground
     `}
					>
						No key-value pairs. Click "Add Pair" to start.
					</div>
				) : (
					pairs.map((pair, index) => (
						<div key={index} className="flex items-center gap-2">
							<div className="grid flex-1 grid-cols-2 gap-2">
								<Input
									type="text"
									value={pair.key}
									onChange={e => handlePairChange(index, 'key', e.target.value)}
									placeholder="Key"
									disabled={disabled}
								/>
								<Input
									type="text"
									value={pair.value}
									onChange={e => handlePairChange(index, 'value', e.target.value)}
									placeholder="Value"
									disabled={disabled}
								/>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => handleRemovePair(index)}
								disabled={disabled || !canRemove}
								aria-label={`Remove pair ${index + 1}`}
								className="h-10 px-2"
							>
								<Trash2 className="h-4 w-4 text-destructive" />
							</Button>
						</div>
					))
				)}
			</div>

			{description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
			{options?.minPairs && (
				<p className="mt-1 text-xs text-muted-foreground">Minimum pairs: {options.minPairs}</p>
			)}
			{options?.maxPairs && (
				<p className="mt-1 text-xs text-muted-foreground">Maximum pairs: {options.maxPairs}</p>
			)}
			{error && <FieldError>{error}</FieldError>}
		</Field>
	);
}
