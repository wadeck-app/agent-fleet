import type { Meta, StoryObj } from '@storybook/react';

import { S2Page } from './S2Page';

/**
 * ===========================================================================================
 * S2: TABLE WITH PAGINATION - STORYBOOK
 * ===========================================================================================
 *
 * Demonstrates table with pagination and column reordering.
 *
 * ===========================================================================================
 */

const meta = {
	title: 'Lego/Approach 2 - Context Provider/S2 - Table Pagination',
	component: S2Page,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof S2Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
