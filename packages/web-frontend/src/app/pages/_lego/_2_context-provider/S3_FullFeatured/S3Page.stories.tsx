import type { Meta, StoryObj } from '@storybook/react';

import { S3Page } from './S3Page';

/**
 * ===========================================================================================
 * S3: FULL-FEATURED TABLE - STORYBOOK
 * ===========================================================================================
 *
 * Demonstrates complete CRUD table with all features enabled.
 *
 * ===========================================================================================
 */

const meta = {
	title: 'Lego/Approach 2 - Context Provider/S3 - Full Featured',
	component: S3Page,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof S3Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
