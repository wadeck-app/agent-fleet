import { MemoryRouter } from 'react-router-dom';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FlowGraphNode } from 'flow-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StepDetailsPanel } from './StepDetailsPanel.js';
import { PREVIEW_CHARS } from './StepIODetails.js';
import { node } from './testing/GraphFixtures.js';

const LONG = 'x'.repeat(PREVIEW_CHARS + 100);

function recordedStep(): FlowGraphNode {
	return node('build', {
		status: 'completed',
		io: {
			declaredInputs: [{ name: 'env.REGION', value: 'eu', references: [] }],
			declaredOutputs: [],
			recorded: {
				relaunches: [],
				io: {
					inputs: {
						'env.REGION': { text: 'eu-west', truncated: false, chars: 7 },
						'secrets.TOKEN': { text: '[secret:TOKEN]', truncated: false, chars: 14 },
					},
					outputs: { plan: { text: LONG, truncated: true, chars: 9000 } },
					stderr: { text: 'warn', truncated: false, chars: 4 },
					truncated: true,
					storedChars: 700,
				},
			},
			usesOutputOf: [],
			usedBy: [],
			notes: { inputs: '', outputs: '' },
		},
	});
}

function oldStep(): FlowGraphNode {
	return node('build', {
		status: 'completed',
		io: {
			declaredInputs: [{ name: 'env.REGION', value: 'eu', references: [] }],
			declaredOutputs: [],
			recorded: { relaunches: [] },
			usesOutputOf: [],
			usedBy: [],
			notes: {
				inputs: 'Resolved values not recorded for this run (older record): the references are shown as written.',
				outputs: 'Outputs not recorded for this run (older record).',
			},
		},
	});
}

function renderPanel(step: FlowGraphNode) {
	return render(
		<MemoryRouter>
			<StepDetailsPanel
				step={step}
				labelOf={id => id}
				onSelectStep={() => undefined}
				onClose={() => undefined}
				logsPath={undefined}
				layout="overlay"
				density="comfortable"
			/>
		</MemoryRouter>
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('recorded values in the step panel', () => {
	it('shows the recorded inputs, including those that have no declaration, and no "not recorded" note', () => {
		renderPanel(recordedStep());
		const inputs = screen.getByRole('region', { name: 'Inputs' });

		expect(within(inputs).getByLabelText('env.REGION')).toHaveTextContent('eu-west');
		expect(within(inputs).getByLabelText('secrets.TOKEN')).toHaveTextContent('[secret:TOKEN]');
		expect(within(inputs).queryByText(/not recorded/)).toBeNull();
	});

	it('says in plain view that a value is truncated, and shows more on request', () => {
		renderPanel(recordedStep());
		const outputs = screen.getByRole('region', { name: 'Outputs' });

		expect(within(outputs).getByText(`truncated, 9000 chars (${LONG.length} shown)`)).toBeInTheDocument();
		expect(within(outputs).getByLabelText('plan').textContent).toHaveLength(PREVIEW_CHARS);
		fireEvent.click(within(outputs).getByRole('button', { name: /Show more/ }));
		expect(within(outputs).getByLabelText('plan').textContent).toHaveLength(LONG.length);
		expect(within(outputs).getByLabelText('stderr')).toHaveTextContent('warn');
	});

	it('copies the recorded value', async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		renderPanel(recordedStep());
		const inputs = screen.getByRole('region', { name: 'Inputs' });

		fireEvent.click(within(inputs).getByRole('button', { name: 'Copy secrets.TOKEN' }));

		await waitFor(() => expect(writeText).toHaveBeenCalledWith('[secret:TOKEN]'));
	});

	it('keeps the note of an older record and the declared values', () => {
		renderPanel(oldStep());
		const inputs = screen.getByRole('region', { name: 'Inputs' });

		expect(within(inputs).getByText('eu')).toBeInTheDocument();
		expect(within(inputs).getByText(/not recorded for this run \(older record\)/)).toBeInTheDocument();
	});
});
