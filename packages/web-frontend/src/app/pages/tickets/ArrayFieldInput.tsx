import { useState } from 'react';

import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';

interface ArrayFieldInputProps {
	label: string;
	items: string[];
	onChange: (items: string[]) => void;
	placeholder?: string;
	required?: boolean;
}

export function ArrayFieldInput({ label, items, onChange, placeholder, required }: ArrayFieldInputProps) {
	const [draft, setDraft] = useState('');

	const inputId = `array-field-${label.toLowerCase().replace(/\s+/g, '-')}`;

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const trimmed = draft.trim();
			if (trimmed) {
				onChange([...items, trimmed]);
				setDraft('');
			}
		}
	};

	const handleBlur = () => {
		const trimmed = draft.trim();
		if (trimmed) {
			onChange([...items, trimmed]);
			setDraft('');
		}
	};

	const handleRemove = (index: number) => {
		onChange(items.filter((_, i) => i !== index));
	};

	const handleItemChange = (index: number, value: string) => {
		const updated = [...items];
		updated[index] = value;
		onChange(updated);
	};

	return (
		<div className="space-y-1">
			<Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground tracking-wide">
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</Label>
			<div className="space-y-1">
				{items.map((item, i) => (
					<div key={i} className="flex items-center gap-1 py-0.5">
						<Input
							value={item}
							onChange={e => handleItemChange(i, e.target.value)}
							className="flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
						/>
						<RemoveItemButton onRemove={() => handleRemove(i)} title="Remove item" />
					</div>
				))}
			</div>
			<Input
				id={inputId}
				value={draft}
				onChange={e => setDraft(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
				placeholder={placeholder ?? 'Type and press Enter to add...'}
				className="text-sm"
			/>
		</div>
	);
}
