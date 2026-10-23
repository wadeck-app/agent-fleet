import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DRAWER_DEFAULT_WIDTH, DRAWER_MAX_WIDTH, DRAWER_MIN_WIDTH, StepPanelDock } from './StepPanelDock.js';
import type { StepPanelLayout } from './StepPanelExperiment.js';

function renderDock(layout: StepPanelLayout, withPanel = true) {
	return render(
		<StepPanelDock
			layout={layout}
			canvas={<div data-testid="canvas">canvas</div>}
			panel={withPanel ? <aside aria-label="Step details">panel</aside> : undefined}
		/>
	);
}

afterEach(() => {
	cleanup();
});

describe('StepPanelDock floating layouts', () => {
	it.each(['overlay', 'tabs', 'accordion'] as const)('%s floats over the canvas, inside the frame', layout => {
		renderDock(layout);
		const slot = screen.getByTestId('panel-slot');
		for (const cls of [
			'lg:absolute',
			'lg:inset-y-2',
			'lg:right-2',
			'lg:w-80',
			'lg:pointer-events-none',
			'lg:flex',
			'lg:flex-col',
		]) {
			expect(slot).toHaveClass(cls);
		}
		expect(screen.getByTestId('panel-dock')).toHaveClass('relative');
		expect(screen.queryByRole('separator')).toBeNull();
	});

	it('stacks the panel under the canvas on narrow windows', () => {
		renderDock('overlay');
		expect(screen.getByTestId('panel-slot')).toHaveClass('mt-3', 'lg:mt-0');
	});

	it('takes no room and draws no slot while nothing is selected', () => {
		renderDock('overlay', false);
		expect(screen.queryByTestId('panel-slot')).toBeNull();
		expect(screen.getByTestId('canvas')).toBeInTheDocument();
	});
});

describe('StepPanelDock drawer', () => {
	it('docks the panel beside the canvas, over the full canvas height, without adding height', () => {
		renderDock('drawer');
		expect(screen.getByTestId('panel-dock')).toHaveClass('flex', 'flex-col', 'lg:flex-row');
		const slot = screen.getByTestId('panel-slot');
		expect(slot).toHaveClass('relative', 'lg:w-[var(--step-drawer-width)]', 'lg:shrink-0');
		// The panel is absolutely placed in the slot so that its content never stretches the row taller than the canvas.
		expect(slot.querySelector('[data-testid="panel-fill"]')).toHaveClass('lg:absolute', 'lg:inset-0');
		expect(screen.getByTestId('canvas').parentElement).toHaveClass('min-w-0', 'flex-1');
	});

	it('starts at the default width, announced on a separator', () => {
		renderDock('drawer');
		const handle = screen.getByRole('separator', { name: 'Resize the step panel' });
		expect(handle).toHaveAttribute('aria-orientation', 'vertical');
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_DEFAULT_WIDTH));
		expect(handle).toHaveAttribute('aria-valuemin', String(DRAWER_MIN_WIDTH));
		expect(handle).toHaveAttribute('aria-valuemax', String(DRAWER_MAX_WIDTH));
		expect(screen.getByTestId('panel-slot').style.getPropertyValue('--step-drawer-width')).toBe(
			`${DRAWER_DEFAULT_WIDTH}px`
		);
	});

	it('widens with the left arrow, narrows with the right arrow and stays within its bounds', () => {
		renderDock('drawer');
		const handle = screen.getByRole('separator');
		fireEvent.keyDown(handle, { key: 'ArrowLeft' });
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_DEFAULT_WIDTH + 16));
		fireEvent.keyDown(handle, { key: 'ArrowRight' });
		fireEvent.keyDown(handle, { key: 'ArrowRight' });
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_DEFAULT_WIDTH - 16));
		fireEvent.keyDown(handle, { key: 'Home' });
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_MIN_WIDTH));
		fireEvent.keyDown(handle, { key: 'ArrowRight' });
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_MIN_WIDTH));
		fireEvent.keyDown(handle, { key: 'End' });
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_MAX_WIDTH));
		fireEvent.keyDown(handle, { key: 'ArrowLeft' });
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_MAX_WIDTH));
	});

	it('widens when dragged to the left', () => {
		renderDock('drawer');
		const handle = screen.getByRole('separator');
		fireEvent.pointerDown(handle, { clientX: 900, pointerId: 1 });
		fireEvent.pointerMove(window, { clientX: 840, pointerId: 1 });
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_DEFAULT_WIDTH + 60));
		fireEvent.pointerUp(window, { clientX: 840, pointerId: 1 });
		fireEvent.pointerMove(window, { clientX: 700, pointerId: 1 });
		expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_DEFAULT_WIDTH + 60));
	});

	it('keeps the width chosen while the panel is closed and reopened', () => {
		const view = renderDock('drawer');
		fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' });
		view.rerender(<StepPanelDock layout="drawer" canvas={<div>canvas</div>} panel={undefined} />);
		expect(screen.queryByRole('separator')).toBeNull();
		view.rerender(<StepPanelDock layout="drawer" canvas={<div>canvas</div>} panel={<aside>panel</aside>} />);
		expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', String(DRAWER_DEFAULT_WIDTH + 16));
	});
});
