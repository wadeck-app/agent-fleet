import type { Meta, StoryObj } from '@storybook/react';

import { S6Page } from './S6Page';

/**
 * ===========================================================================================
 * S6: MASTER-DETAIL VIEW - STORYBOOK
 * ===========================================================================================
 *
 * Demonstrates table on left, detail panel on right with inline editing.
 * Cross-widget communication through shared context.
 *
 * ===========================================================================================
 */

const meta = {
	title: 'Lego/Approach 2 - Context Provider/S6 - Item Detail',
	component: S6Page,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof S6Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
