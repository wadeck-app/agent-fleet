// @ts-nocheck - Example code, not compiled
// Storybook Stories Pattern
// Every component MUST have stories demonstrating all variants

import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

/**
 * Button component stories
 * Demonstrates all variants and states
 */
const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'destructive'],
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

/**
 * Primary button variant
 */
export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
  },
};

/**
 * Secondary button variant
 */
export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
};

/**
 * Destructive button variant (for dangerous actions)
 */
export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Delete',
  },
};

/**
 * Disabled state
 */
export const Disabled: Story = {
  args: {
    variant: 'primary',
    disabled: true,
    children: 'Disabled Button',
  },
};

/**
 * Small size
 */
export const Small: Story = {
  args: {
    variant: 'primary',
    size: 'small',
    children: 'Small Button',
  },
};

/**
 * Large size
 */
export const Large: Story = {
  args: {
    variant: 'primary',
    size: 'large',
    children: 'Large Button',
  },
};
