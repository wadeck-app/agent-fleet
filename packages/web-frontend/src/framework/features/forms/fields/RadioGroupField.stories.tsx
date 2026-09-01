import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import type { RadioOption } from '../inputs/RadioGroupInput';
import { RadioGroupField } from './RadioGroupField';

/**
 * RadioGroupField is a complete form field with label, radio group, and error display.
 * Wraps RadioGroupInput to provide full form integration.
 *
 * Features:
 * - Label with optional required indicator
 * - Error message display
 * - Mutually exclusive options
 * - Horizontal or vertical layout
 * - Full accessibility
 */
const meta = {
	title: 'Features/Form/Fields/RadioGroupField',
	component: RadioGroupField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		orientation: {
			control: 'radio',
			options: ['horizontal', 'vertical'],
		},
	},
} satisfies Meta<typeof RadioGroupField>;

export default meta;
type Story = StoryObj<typeof meta>;

const sizeOptions: RadioOption[] = [
	{ value: 'small', label: 'Small' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'large', label: 'Large' },
];

const priorityOptions: RadioOption[] = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' },
];

/**
 * Default vertical radio group field
 */
export const Default: Story = {
	args: {
		label: 'Select size',
		value: 'medium',
		onChange: fn(),
		options: sizeOptions,
	},
};

/**
 * Required field with asterisk
 */
export const Required: Story = {
	args: {
		label: 'Select size',
		value: 'medium',
		onChange: fn(),
		options: sizeOptions,
		required: true,
	},
};

/**
 * Field with error message
 */
export const WithError: Story = {
	args: {
		label: 'Select priority',
		value: '',
		onChange: fn(),
		options: priorityOptions,
		required: true,
		error: 'Please select a priority level',
	},
};

/**
 * Horizontal orientation
 */
export const Horizontal: Story = {
	args: {
		label: 'Select size',
		value: 'medium',
		onChange: fn(),
		options: sizeOptions,
		orientation: 'horizontal',
	},
};

/**
 * Vertical orientation (default)
 */
export const Vertical: Story = {
	args: {
		label: 'Select priority',
		value: 'medium',
		onChange: fn(),
		options: priorityOptions,
		orientation: 'vertical',
	},
};

/**
 * With disabled option
 */
export const WithDisabledOption: Story = {
	args: {
		label: 'Select size',
		value: 'small',
		onChange: fn(),
		options: [
			{ value: 'small', label: 'Small' },
			{ value: 'medium', label: 'Medium (Out of stock)', disabled: true },
			{ value: 'large', label: 'Large' },
		],
	},
};

/**
 * Interactive field
 */ export const Interactive: Story = {
	args: undefined as any,
	render: () => {
		const [value, setValue] = useState('medium');
		const [error, setError] = useState('');

		const handleChange = (newValue: string) => {
			setValue(newValue);
			setError('');
		};

		const handleSubmit = (e: React.FormEvent) => {
			e.preventDefault();
			if (!value) {
				setError('Please select a size');
			} else {
				alert(`Selected: ${value}`);
			}
		};

		return (
			<form onSubmit={handleSubmit} className="w-80 space-y-4">
				<RadioGroupField
					label="T-shirt size"
					value={value}
					onChange={handleChange}
					options={sizeOptions}
					required={true}
					error={error}
				/>
				// violations-suppress: react/no-raw-button story fixture
				<button
					type="submit"
					className={`
       w-full rounded-md bg-primary px-4 py-2 text-primary-foreground
       hover:bg-primary/90
     `}
				>
					Submit
				</button>
			</form>
		);
	},
};

/**
 * Shipping method selection
 */ export const ShippingMethod: Story = {
	args: undefined as any,
	render: () => {
		const [shipping, setShipping] = useState('standard');

		return (
			<div className="w-96">
				<RadioGroupField
					label="Shipping method"
					value={shipping}
					onChange={setShipping}
					options={[
						{ value: 'standard', label: 'Standard (5-7 days)' },
						{ value: 'express', label: 'Express (2-3 days)' },
						{ value: 'overnight', label: 'Overnight' },
					]}
					required={true}
				/>
			</div>
		);
	},
};

/**
 * Notification preferences
 */ export const NotificationPreferences: Story = {
	args: undefined as any,
	render: () => {
		const [preference, setPreference] = useState('important');

		return (
			<div className="w-96 space-y-4 rounded-lg border border-border p-6">
				<div>
					<h3 className="text-lg font-medium">Email Notifications</h3>
					<p className="text-sm text-muted-foreground">Choose when you want to receive emails</p>
				</div>

				<RadioGroupField
					label="Frequency"
					value={preference}
					onChange={setPreference}
					options={[
						{ value: 'all', label: 'All notifications' },
						{ value: 'important', label: 'Important only' },
						{ value: 'none', label: 'None' },
					]}
				/>

				<p className="text-xs text-muted-foreground">
					Current: <strong className="text-foreground">{preference}</strong>
				</p>
			</div>
		);
	},
};

/**
 * Multiple radio groups in form
 */ export const MultipleInForm: Story = {
	args: undefined as any,
	render: () => {
		const [size, setSize] = useState('medium');
		const [color, setColor] = useState('blue');
		const [delivery, setDelivery] = useState('standard');

		return (
			<form className="w-96 space-y-6 rounded-lg border border-border p-6">
				<h3 className="text-lg font-medium">Product Options</h3>

				<RadioGroupField label="Size" value={size} onChange={setSize} options={sizeOptions} required={true} />

				<RadioGroupField
					label="Color"
					value={color}
					onChange={setColor}
					options={[
						{ value: 'blue', label: 'Blue' },
						{ value: 'red', label: 'Red' },
						{ value: 'green', label: 'Green' },
					]}
					orientation="horizontal"
					required={true}
				/>

				<RadioGroupField
					label="Delivery"
					value={delivery}
					onChange={setDelivery}
					options={[
						{ value: 'standard', label: 'Standard (Free)' },
						{ value: 'express', label: 'Express ($9.99)' },
					]}
					required={true}
				/>

				// violations-suppress: react/no-raw-button story fixture
				<button
					type="submit"
					className={`
       w-full rounded-md bg-primary px-4 py-2 text-primary-foreground
       hover:bg-primary/90
     `}
					onClick={e => {
						e.preventDefault();
						alert(`Size: ${size}, Color: ${color}, Delivery: ${delivery}`);
					}}
				>
					Add to cart
				</button>
			</form>
		);
	},
};

/**
 * Validation states
 */ export const ValidationStates: Story = {
	args: undefined as any,
	render: () => {
		return (
			<div className="w-96 space-y-8">
				<div>
					<h4 className="mb-3 text-sm font-medium">Valid</h4>
					<RadioGroupField
						label="Priority"
						value="high"
						onChange={() => {}}
						options={priorityOptions}
						required={true}
					/>
				</div>

				<div>
					<h4 className="mb-3 text-sm font-medium">Error</h4>
					<RadioGroupField
						label="Priority"
						value=""
						onChange={() => {}}
						options={priorityOptions}
						required={true}
						error="Please select a priority level"
					/>
				</div>

				<div>
					<h4 className="mb-3 text-sm font-medium">Optional</h4>
					<RadioGroupField label="Priority" value="" onChange={() => {}} options={priorityOptions} />
				</div>
			</div>
		);
	},
};

/**
 * With long option labels
 */
export const LongLabels: Story = {
	args: {
		label: 'Privacy settings',
		value: 'private',
		onChange: fn(),
		options: [
			{ value: 'public', label: 'Public - Anyone can see this content' },
			{ value: 'private', label: 'Private - Only you can see this content' },
			{ value: 'friends', label: 'Friends - Only your friends can see this content' },
		],
		required: true,
	},
};

/**
 * Theme selection form
 */ export const ThemeSelection: Story = {
	args: undefined as any,
	render: () => {
		const [theme, setTheme] = useState('system');
		const [error, setError] = useState('');

		return (
			<div className="w-96 space-y-6 rounded-lg border border-border p-6">
				<div>
					<h3 className="text-lg font-medium">Appearance</h3>
					<p className="text-sm text-muted-foreground">Customize how the app looks on your device</p>
				</div>

				<RadioGroupField
					label="Theme"
					value={theme}
					onChange={value => {
						setTheme(value);
						setError('');
					}}
					options={[
						{ value: 'light', label: 'Light' },
						{ value: 'dark', label: 'Dark' },
						{ value: 'system', label: 'System' },
					]}
					error={error}
				/>

				// violations-suppress: react/no-raw-button story fixture
				<button
					className={`
       w-full rounded-md bg-primary px-4 py-2 text-primary-foreground
       hover:bg-primary/90
     `}
					onClick={() => alert(`Theme set to: ${theme}`)}
				>
					Save preferences
				</button>
			</div>
		);
	},
};
