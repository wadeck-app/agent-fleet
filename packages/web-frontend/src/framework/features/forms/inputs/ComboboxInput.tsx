import { useState } from 'react';

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@framework/components/forms/Command';
import { Popover, PopoverContent, PopoverTrigger } from '@framework/components/forms/Popover';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';

/**
 * ===========================================================================================
 * COMBOBOX INPUT - shadcn-style combobox with search
 * ===========================================================================================
 *
 * Based on shadcn/ui Combobox pattern (Popover + Command).
 * - No label or error display (use ComboboxField for that)
 * - Searchable dropdown with keyboard navigation
 * - Type-safe string value
 * - Options with value/label pairs and optional disabled state
 * - Real-time search/filter functionality
 *
 * ===========================================================================================
 */

export interface ComboboxOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface ComboboxInputProps {
	value: string;
	onChange: (value: string) => void;
	options: ComboboxOption[];
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	className?: string;
	id?: string;
}

export function ComboboxInput({
	value,
	onChange,
	options,
	placeholder = 'Select...',
	disabled,
	id,
}: ComboboxInputProps) {
	const [open, setOpen] = useState(false);

	// Find the selected option to display its label
	const selectedOption = options.find(opt => opt.value === value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
				>
					{selectedOption ? selectedOption.label : placeholder}
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
				<Command>
					<CommandInput placeholder={`Search...`} />
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						<CommandGroup>
							{options.map(option => (
								<CommandItem
									key={option.value}
									value={option.value}
									disabled={option.disabled}
									onSelect={currentValue => {
										// cmdk lowercases the value, so we need to find the original
										const selectedOpt = options.find(
											opt => opt.value.toLowerCase() === currentValue.toLowerCase()
										);
										if (selectedOpt && !selectedOpt.disabled) {
											onChange(selectedOpt.value);
											setOpen(false);
										}
									}}
								>
									<Check
										className={cn(
											'mr-2 h-4 w-4',
											value === option.value ? 'opacity-100' : 'opacity-0'
										)}
									/>
									{option.label}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
