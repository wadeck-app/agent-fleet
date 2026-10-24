import type { Meta, StoryObj } from '@storybook/react';

import { MonospaceBlock } from './MonospaceBlock';

const meta = {
	title: 'UI/MonospaceBlock',
	component: MonospaceBlock,
	parameters: { layout: 'padded' },
	tags: ['autodocs'],
} satisfies Meta<typeof MonospaceBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Command output',
		text: 'Flow: nightly-build\nStatus: completed\n  step-1  completed  3s',
	},
};

export const LongLines: Story = {
	args: {
		label: 'Log output',
		text: `12:00:00.000 [INFO] ${'a very long message '.repeat(20)}\n12:00:01.000 [ERROR] boom`,
	},
};
