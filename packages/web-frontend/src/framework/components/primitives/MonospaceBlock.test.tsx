import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MonospaceBlock } from './MonospaceBlock';

describe('MonospaceBlock', () => {
	it('renders the text with its whitespace preserved under an accessible name', () => {
		render(<MonospaceBlock label="Output" text={'line 1\n  indented line 2'} />);

		const block = screen.getByLabelText('Output');
		expect(block.tagName).toBe('PRE');
		expect(block.textContent).toBe('line 1\n  indented line 2');
	});

	it('is keyboard focusable so that the scrollable content is reachable', () => {
		render(<MonospaceBlock label="Output" text="x" />);

		expect(screen.getByLabelText('Output')).toHaveAttribute('tabindex', '0');
	});
});
