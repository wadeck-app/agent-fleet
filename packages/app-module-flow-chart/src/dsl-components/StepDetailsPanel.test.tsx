import { MemoryRouter } from 'react-router-dom';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FlowGraphNode } from 'flow-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StepDetailsPanel } from './StepDetailsPanel.js';
import type { StepPanelDensity, StepPanelLayout } from './StepPanelExperiment.js';
import { ANNOTATED_RUN_GRAPH, LONG_STDOUT } from './testing/GraphFixtures.js';

function failedStep(): FlowGraphNode {
	const step = ANNOTATED_RUN_GRAPH.nodes.find(node => node.id === 'test');
	if (step === undefined) {
		throw new Error("The fixture has no step 'test'.");
	}
	return step;
}

function okStep(): FlowGraphNode {
	const step = ANNOTATED_RUN_GRAPH.nodes.find(node => node.id === 'plan');
	if (step === undefined) {
		throw new Error("The fixture has no step 'plan'.");
	}
	return step;
}

interface Options {
	layout?: StepPanelLayout;
	density?: StepPanelDensity;
	step?: FlowGraphNode;
	onClose?: () => void;
	onSelectStep?: (id: string) => void;
}

function renderPanel({
	layout = 'overlay',
	density = 'comfortable',
	step = failedStep(),
	onClose,
	onSelectStep,
}: Options = {}) {
	return render(
		<MemoryRouter>
			<StepDetailsPanel
				step={step}
				labelOf={id => id}
				onSelectStep={onSelectStep ?? (() => undefined)}
				onClose={onClose ?? (() => undefined)}
				logsPath="/modules/flow/executions/exec1/logs?step=test"
				layout={layout}
				density={density}
			/>
		</MemoryRouter>
	);
}

afterEach(() => {
	cleanup();
});

describe('StepDetailsPanel frame (baseline)', () => {
	it('never grows past its frame: capped height, hidden overflow, column layout', () => {
		renderPanel();
		const panel = screen.getByRole('complementary', { name: 'Step details' });
		// The floating slot lets the chart through around the panel; only the panel catches the pointer.
		for (const cls of [
			'flex',
			'flex-col',
			'overflow-hidden',
			'max-h-[70vh]',
			'lg:max-h-[min(100%,calc(100vh-1rem))]',
			'lg:pointer-events-auto',
			'lg:sticky',
			'lg:top-2',
		]) {
			expect(panel).toHaveClass(cls);
		}
	});

	it('keeps the header (name, status, Close) outside the scrolling body', () => {
		renderPanel();
		const header = screen.getByTestId('panel-header');
		const body = screen.getByTestId('panel-body');
		expect(header).toHaveClass('shrink-0');
		expect(within(header).getByText('test')).toBeInTheDocument();
		expect(within(header).getByText(/failed/)).toBeInTheDocument();
		expect(within(header).getByRole('button', { name: 'Close' })).toBeInTheDocument();
		expect(body).not.toContainElement(header);
		expect(body.contains(screen.getByRole('button', { name: 'Close' }))).toBe(false);
	});

	it('scrolls the body inside the panel and keeps wheel scrolling from reaching the chart', () => {
		renderPanel();
		const body = screen.getByTestId('panel-body');
		for (const cls of ['min-h-0', 'flex-1', 'overflow-y-auto', 'overscroll-contain']) {
			expect(body).toHaveClass(cls);
		}
	});

	it('caps a captured output block and shortens a long one', () => {
		renderPanel();
		const block = screen.getByLabelText(/^stdout/);
		expect(block).toHaveClass('max-h-56', 'overflow-auto');
		expect(block.textContent!.length).toBeLessThan(LONG_STDOUT.length);
	});

	it('caps the error block too', () => {
		renderPanel();
		expect(screen.getByLabelText('Error text')).toHaveClass('max-h-56', 'overflow-auto');
	});

	it('shows the sections in a reading order: summary, error, inputs, links, outputs', () => {
		renderPanel();
		const body = screen.getByTestId('panel-body');
		const order = ['Error', 'Inputs', 'Data flow', 'Outputs'].map(name =>
			Array.from(body.querySelectorAll('section')).findIndex(
				section => section.getAttribute('aria-label') === name
			)
		);
		expect(order.every(index => index >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});
});

describe('StepDetailsPanel density', () => {
	it('comfortable is the baseline text size and block height', () => {
		renderPanel({ density: 'comfortable' });
		expect(screen.getByRole('complementary', { name: 'Step details' })).toHaveClass('text-sm');
		expect(screen.getByLabelText(/^stdout/)).toHaveClass('max-h-56');
	});

	it('compact lowers the text size and the block height', () => {
		renderPanel({ density: 'compact' });
		expect(screen.getByRole('complementary', { name: 'Step details' })).toHaveClass('text-xs');
		expect(screen.getByLabelText(/^stdout/)).toHaveClass('max-h-32');
		expect(screen.getByLabelText('Error text')).toHaveClass('max-h-32');
	});
});

describe('StepDetailsPanel keyboard and focus', () => {
	function stubPanelTop(top: number) {
		const scrollIntoView = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoView;
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
		return scrollIntoView;
	}

	it('scrolls the page to the panel when it opens entirely below the visible part (narrow window: under the chart)', () => {
		const scrollIntoView = stubPanelTop(window.innerHeight + 400);
		renderPanel();
		expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
	});

	it('does not move the page when the panel opens in view', () => {
		const scrollIntoView = stubPanelTop(100);
		renderPanel();
		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it('moves the focus to the panel when it opens', () => {
		renderPanel();
		expect(screen.getByRole('complementary', { name: 'Step details' })).toHaveFocus();
	});

	it('moves the focus to the panel again when another step is shown', () => {
		const view = renderPanel();
		screen.getByRole('button', { name: 'Close' }).focus();
		view.rerender(
			<MemoryRouter>
				<StepDetailsPanel
					step={okStep()}
					labelOf={id => id}
					onSelectStep={() => undefined}
					onClose={() => undefined}
					logsPath={undefined}
					layout="overlay"
					density="comfortable"
				/>
			</MemoryRouter>
		);
		expect(screen.getByRole('complementary', { name: 'Step details' })).toHaveFocus();
	});

	it('closes on Escape from anywhere inside the panel', () => {
		const onClose = vi.fn();
		renderPanel({ onClose });
		fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('labels the close button and the scroll area for assistive technology', () => {
		renderPanel();
		expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
		expect(screen.getByTestId('panel-body')).toHaveAttribute('tabindex', '0');
		expect(screen.getByTestId('panel-body')).toHaveAttribute('aria-label', 'Step details content');
	});
});

describe('StepDetailsPanel copy', () => {
	function stubClipboard(writeText: (text: string) => Promise<void>) {
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
	}

	it('copies the whole captured output of a stream', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		stubClipboard(writeText);
		renderPanel();
		fireEvent.click(screen.getByRole('button', { name: 'Copy stdout' }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith(LONG_STDOUT));
		expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
	});

	it('copies the error text', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		stubClipboard(writeText);
		renderPanel();
		fireEvent.click(screen.getByRole('button', { name: 'Copy error' }));
		await waitFor(() => expect(writeText).toHaveBeenCalledWith('exit 1: 3 tests failed'));
	});

	it('says why a copy failed instead of failing silently', async () => {
		stubClipboard(() => Promise.reject(new Error('Document is not focused')));
		renderPanel();
		fireEvent.click(screen.getByRole('button', { name: 'Copy error' }));
		expect(await screen.findByRole('alert')).toHaveTextContent(/Copy failed: .*Document is not focused/);
	});
});

describe('StepDetailsPanel layout tabs', () => {
	it('shows one tab per block that has content, the error first for a failed step', () => {
		renderPanel({ layout: 'tabs' });
		const tabs = within(screen.getByRole('tablist', { name: 'Step sections' })).getAllByRole('tab');
		expect(tabs.map(tab => tab.textContent)).toEqual(['Summary', 'Error', 'Inputs', 'Links', 'Outputs']);
		expect(screen.getByRole('tab', { name: 'Error' })).toHaveAttribute('aria-selected', 'true');
	});

	it('opens on Summary for a step without error, and has no Error tab', () => {
		renderPanel({ layout: 'tabs', step: okStep() });
		expect(screen.queryByRole('tab', { name: 'Error' })).toBeNull();
		expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
	});

	it('shows only the selected block', () => {
		renderPanel({ layout: 'tabs' });
		expect(screen.getByLabelText('Error text')).toBeInTheDocument();
		expect(screen.queryByLabelText(/^stdout/)).toBeNull();
		fireEvent.click(screen.getByRole('tab', { name: 'Outputs' }));
		expect(screen.getByLabelText(/^stdout/)).toBeInTheDocument();
		expect(screen.queryByLabelText('Error text')).toBeNull();
		expect(screen.getByRole('tabpanel', { name: 'Outputs' })).toBeInTheDocument();
	});

	it('moves between tabs with the arrow keys (roving tabindex)', () => {
		renderPanel({ layout: 'tabs' });
		const error = screen.getByRole('tab', { name: 'Error' });
		expect(error).toHaveAttribute('tabindex', '0');
		expect(screen.getByRole('tab', { name: 'Inputs' })).toHaveAttribute('tabindex', '-1');
		fireEvent.keyDown(error, { key: 'ArrowRight' });
		expect(screen.getByRole('tab', { name: 'Inputs' })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('tab', { name: 'Inputs' })).toHaveFocus();
		fireEvent.keyDown(screen.getByRole('tab', { name: 'Inputs' }), { key: 'End' });
		expect(screen.getByRole('tab', { name: 'Outputs' })).toHaveAttribute('aria-selected', 'true');
		fireEvent.keyDown(screen.getByRole('tab', { name: 'Outputs' }), { key: 'ArrowRight' });
		expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
	});

	it('keeps the frame cap of the baseline', () => {
		renderPanel({ layout: 'tabs' });
		expect(screen.getByRole('complementary', { name: 'Step details' })).toHaveClass(
			'max-h-[70vh]',
			'lg:max-h-[min(100%,calc(100vh-1rem))]'
		);
		expect(screen.getByTestId('panel-body')).toHaveClass('overflow-y-auto');
	});

	it('goes back to the default tab when another step is shown', () => {
		const view = renderPanel({ layout: 'tabs' });
		fireEvent.click(screen.getByRole('tab', { name: 'Outputs' }));
		view.rerender(
			<MemoryRouter>
				<StepDetailsPanel
					step={okStep()}
					labelOf={id => id}
					onSelectStep={() => undefined}
					onClose={() => undefined}
					logsPath={undefined}
					layout="tabs"
					density="comfortable"
				/>
			</MemoryRouter>
		);
		expect(screen.getByRole('tab', { name: 'Summary' })).toHaveAttribute('aria-selected', 'true');
	});
});

describe('StepDetailsPanel layout accordion', () => {
	it('opens the error and collapses the other sections', () => {
		renderPanel({ layout: 'accordion' });
		expect(screen.getByRole('button', { name: /^Error/ })).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByRole('button', { name: /^Inputs/ })).toHaveAttribute('aria-expanded', 'false');
		expect(screen.getByRole('button', { name: /^Outputs/ })).toHaveAttribute('aria-expanded', 'false');
		expect(screen.getByRole('button', { name: /^Summary/ })).toHaveAttribute('aria-expanded', 'false');
		expect(screen.getByLabelText('Error text')).toBeInTheDocument();
		expect(screen.queryByLabelText(/^stdout/)).toBeNull();
	});

	it('opens the summary when the step has no error to show', () => {
		renderPanel({ layout: 'accordion', step: okStep() });
		expect(screen.getByRole('button', { name: /^Summary/ })).toHaveAttribute('aria-expanded', 'true');
	});

	it('expands and collapses a section on click', () => {
		renderPanel({ layout: 'accordion' });
		fireEvent.click(screen.getByRole('button', { name: /^Outputs/ }));
		expect(screen.getByRole('button', { name: /^Outputs/ })).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByLabelText(/^stdout/)).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: /^Outputs/ }));
		expect(screen.queryByLabelText(/^stdout/)).toBeNull();
	});

	it('keeps the frame cap of the baseline', () => {
		renderPanel({ layout: 'accordion' });
		expect(screen.getByRole('complementary', { name: 'Step details' })).toHaveClass(
			'max-h-[70vh]',
			'lg:max-h-[min(100%,calc(100vh-1rem))]'
		);
		expect(screen.getByTestId('panel-body')).toHaveClass('overflow-y-auto');
	});
});

describe('StepDetailsPanel layout drawer', () => {
	it('fills the height of the drawer slot, with the same internal scroll', () => {
		renderPanel({ layout: 'drawer' });
		const panel = screen.getByRole('complementary', { name: 'Step details' });
		expect(panel).toHaveClass(
			'lg:h-[min(100%,calc(100vh-1rem))]',
			'max-h-[70vh]',
			'lg:max-h-[min(100%,calc(100vh-1rem))]'
		);
		expect(screen.getByTestId('panel-body')).toHaveClass('overflow-y-auto');
	});
});

describe('StepDetailsPanel links', () => {
	it('selects the linked step', () => {
		const onSelectStep = vi.fn();
		renderPanel({ onSelectStep });
		fireEvent.click(screen.getByRole('button', { name: 'plan' }));
		expect(onSelectStep).toHaveBeenCalledWith('plan');
	});
});
