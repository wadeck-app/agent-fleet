import type { Meta, StoryObj } from '@storybook/react';

import { S4Page } from './S4Page';

/**
 * ===========================================================================================
 * S4: GRID VIEW WITH CRUD POPUP - STORYBOOK
 * ===========================================================================================
 *
 * Demonstrates grid layout with search, pagination, and CRUD dialog.
 *
 * ===========================================================================================
 */

const meta = {
	title: 'Lego/Approach 2 - Context Provider/S4 - Grid Popup',
	component: S4Page,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof S4Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
