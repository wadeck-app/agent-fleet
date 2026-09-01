import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';

import { Toast } from './Toast';

const meta = {
	title: 'Components/Toast',
	component: Toast,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = {
	args: undefined as any,
	render: () => {
		const [show, setShow] = useState(true);
		return show ? (
			<Toast message="Operation completed successfully!" type="success" onClose={() => setShow(false)} />
		) : (
			// violations-suppress: react/no-raw-button story fixture
			<button onClick={() => setShow(true)}>Show Toast</button>
		);
	},
};
export const Error: Story = {
	args: undefined as any,
	render: () => {
		const [show, setShow] = useState(true);
		return show ? (
			<Toast message="An error occurred. Please try again." type="error" onClose={() => setShow(false)} />
		) : (
			// violations-suppress: react/no-raw-button story fixture
			<button onClick={() => setShow(true)}>Show Toast</button>
		);
	},
};
export const Info: Story = {
	args: undefined as any,
	render: () => {
		const [show, setShow] = useState(true);
		return show ? (
			<Toast message="Your changes have been saved." type="info" onClose={() => setShow(false)} />
		) : (
			// violations-suppress: react/no-raw-button story fixture
			<button onClick={() => setShow(true)}>Show Toast</button>
		);
	},
};
export const Warning: Story = {
	args: undefined as any,
	render: () => {
		const [show, setShow] = useState(true);
		return show ? (
			<Toast
				message="Please review your changes before proceeding."
				type="warning"
				onClose={() => setShow(false)}
			/>
		) : (
			// violations-suppress: react/no-raw-button story fixture
			<button onClick={() => setShow(true)}>Show Toast</button>
		);
	},
};
export const LongMessage: Story = {
	args: undefined as any,
	render: () => {
		const [show, setShow] = useState(true);
		return show ? (
			<Toast
				message="This is a much longer message that demonstrates how the toast component handles more text content. The layout should adapt gracefully to accommodate the additional content."
				type="info"
				onClose={() => setShow(false)}
			/>
		) : (
			// violations-suppress: react/no-raw-button story fixture
			<button onClick={() => setShow(true)}>Show Toast</button>
		);
	},
};
export const AllTypes: Story = {
	args: undefined as any,
	render: () => {
		const [toasts, setToasts] = useState([
			{ id: 1, message: 'Success message', type: 'success' as const },
			{ id: 2, message: 'Error message', type: 'error' as const },
			{ id: 3, message: 'Info message', type: 'info' as const },
			{ id: 4, message: 'Warning message', type: 'warning' as const },
		]);

		return (
			<div className="flex flex-col gap-2">
				{toasts.map(toast => (
					<Toast
						key={toast.id}
						message={toast.message}
						type={toast.type}
						onClose={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
					/>
				))}
			</div>
		);
	},
};
