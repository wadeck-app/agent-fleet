import type { Meta, StoryObj } from '@storybook/react';

import { S1Page } from './S1Page';

/**
 * ===========================================================================================
 * S1: SIMPLE TABLE - STORYBOOK
 * ===========================================================================================
 *
 * Demonstrates the basic read-only table with context provider pattern.
 *
 * ===========================================================================================
 */

const meta = {
	title: 'Lego/Approach 2 - Context Provider/S1 - Simple Table',
	component: S1Page,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof S1Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
