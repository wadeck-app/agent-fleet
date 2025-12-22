/**
 * RADIX UI WRAPPER PATTERN
 *
 * Always wrap Radix primitives in components/ui/ for consistency.
 * Never use Radix primitives directly in feature code.
 */
import { ReactNode } from 'react';
/**
 * KEY TAKEAWAYS:
 *
 * WRAPPER PATTERN:
 * 1. Create in components/ui/{Component}.tsx
 * 2. Apply project styling once
 * 3. Set sensible defaults
 * 4. Export clean API
 * 5. Hide Radix complexity
 *
 * BENEFITS:
 * - Consistency across project
 * - Single source of truth
 * - Easy global updates
 * - Clean feature code
 * - Reusability
 *
 * LOCATION:
 * ✅ Wrappers: packages/frontend/src/components/ui/
 * ✅ Features: packages/frontend/src/features/
 * ❌ Never: Radix imports in features
 */

import React from 'react';

import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';

// ==================== ❌ BAD: Using Radix Directly in Feature ====================

/**
 * ❌ DON'T: Use Radix primitives directly in feature code
 *
 * PROBLEMS:
 * - No styling consistency
 * - Repeated code
 * - Hard to update globally
 * - No project defaults
 */
function Bad_DirectUsage() {
	return (
		<Dialog.Root>
			<Dialog.Trigger className="px-4 py-2 bg-blue-500 text-white rounded">
				Open
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 bg-black/50" />
				<Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-lg">
					<Dialog.Title className="text-xl font-bold">Title</Dialog.Title>
					<Dialog.Description className="text-gray-600">Description</Dialog.Description>
					<Dialog.Close className="absolute top-2 right-2">X</Dialog.Close>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

// ==================== ✅ GOOD: Wrapper in components/ui/ ====================

/**
 * ✅ DO: Create wrapper in components/ui/Dialog.tsx
 *
 * LOCATION: packages/frontend/src/components/ui/Dialog.tsx
 *
 * BENEFITS:
 * - Consistent styling across project
 * - Single source of truth
 * - Easy to update globally
 * - Clean API for features
 */

// components/ui/Dialog.tsx
type DialogProps = {
	trigger: ReactNode;
	title: string;
	description?: string;
	children: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
};

export function CustomDialog({
	trigger,
	title,
	description,
	children,
	open,
	onOpenChange,
}: DialogProps) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Trigger asChild>{trigger}</Dialog.Trigger>

			<Dialog.Portal>
				{/* ✅ Project styling applied once */}
				<Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-fadeIn" />

				<Dialog.Content
					className="
            fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            bg-white rounded-lg shadow-xl p-6 w-full max-w-md
            data-[state=open]:animate-slideIn
          "
				>
					<Dialog.Title className="text-xl font-semibold mb-2">{title}</Dialog.Title>

					{description && (
						<Dialog.Description className="text-gray-600 mb-4">
							{description}
						</Dialog.Description>
					)}

					<div className="mt-4">{children}</div>

					<Dialog.Close
						className="
              absolute top-2 right-2 p-2 rounded-full
              hover:bg-gray-100 transition-colors
            "
						aria-label="Close"
					>
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</Dialog.Close>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

// ==================== ✅ GOOD: Usage in Feature Code ====================

/**
 * ✅ DO: Use wrapped component in features
 *
 * CLEAN: No Radix imports, no styling details
 */
function Good_UsingWrapper() {
	return (
		<CustomDialog
			trigger={<button className="btn-primary">Open Dialog</button>}
			title="Confirm Action"
			description="Are you sure you want to proceed?"
		>
			<div className="flex gap-2 justify-end">
				<button className="btn-secondary">Cancel</button>
				<button className="btn-primary">Confirm</button>
			</div>
		</CustomDialog>
	);
}

// ==================== WRAPPER PATTERN FOR SELECT ====================

// components/ui/Select.tsx
type SelectOption = { value: string; label: string };

type SelectProps = {
	value?: string;
	onValueChange?: (value: string) => void;
	options: SelectOption[];
	placeholder?: string;
	label?: string;
};

export function CustomSelect({
	value,
	onValueChange,
	options,
	placeholder = 'Select an option',
	label,
}: SelectProps) {
	return (
		<div className="flex flex-col gap-2">
			{label && <label className="text-sm font-medium">{label}</label>}

			<Select.Root value={value} onValueChange={onValueChange}>
				<Select.Trigger
					className="
            flex items-center justify-between
            px-4 py-2 bg-white border border-gray-300 rounded-lg
            hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500
          "
				>
					<Select.Value placeholder={placeholder} />
					<Select.Icon className="ml-2">▼</Select.Icon>
				</Select.Trigger>

				<Select.Portal>
					<Select.Content
						className="
              bg-white border border-gray-300 rounded-lg shadow-lg
              overflow-hidden
            "
					>
						<Select.Viewport>
							{options.map(option => (
								<Select.Item
									key={option.value}
									value={option.value}
									className="
                    px-4 py-2 cursor-pointer
                    hover:bg-gray-100 focus:bg-gray-100 focus:outline-none
                    data-[highlighted]:bg-blue-50
                  "
								>
									<Select.ItemText>{option.label}</Select.ItemText>
								</Select.Item>
							))}
						</Select.Viewport>
					</Select.Content>
				</Select.Portal>
			</Select.Root>
		</div>
	);
}

// ==================== USAGE IN FEATURE ====================

function FeatureUsingSelect() {
	const [value, setValue] = React.useState('');

	return (
		<CustomSelect
			label="Choose a category"
			value={value}
			onValueChange={setValue}
			options={[
				{ value: 'fiction', label: 'Fiction' },
				{ value: 'non-fiction', label: 'Non-Fiction' },
				{ value: 'science', label: 'Science' },
			]}
		/>
	);
}
