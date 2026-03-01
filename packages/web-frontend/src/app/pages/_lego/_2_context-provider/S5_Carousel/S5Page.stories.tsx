import type { Meta, StoryObj } from '@storybook/react';

import { S5Page } from './S5Page';

/**
 * ===========================================================================================
 * S5: CAROUSEL VIEW - STORYBOOK
 * ===========================================================================================
 *
 * Demonstrates single-item carousel with field visibility toggles and pagination.
 *
 * ===========================================================================================
 */

const meta = {
	title: 'Lego/Approach 2 - Context Provider/S5 - Carousel',
	component: S5Page,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof S5Page>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
