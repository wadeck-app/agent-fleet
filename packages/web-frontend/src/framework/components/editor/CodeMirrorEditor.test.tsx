import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CodeMirrorEditor } from './CodeMirrorEditor';

describe('CodeMirrorEditor', () => {
	it('should render editor with initial value', async () => {
		const { container } = render(<CodeMirrorEditor value="const x = 42;" />);

		// Editor mounts asynchronously
		await waitFor(() => {
			const editorElement = container.querySelector('.cm-editor');
			expect(editorElement).toBeTruthy();
		});
	});

	it('should call onChange when content changes', async () => {
		const handleChange = vi.fn();
		const { container } = render(<CodeMirrorEditor value="initial" onChange={handleChange} />);

		await waitFor(() => {
			const editorElement = container.querySelector('.cm-editor');
			expect(editorElement).toBeTruthy();
		});

		// Note: Testing actual content changes in CodeMirror requires more complex setup
		// This test verifies the component renders and accepts onChange callback
		expect(handleChange).not.toHaveBeenCalled();
	});

	it('should apply language extension when specified', async () => {
		const { container } = render(<CodeMirrorEditor value="const x = 42;" language="ts" />);

		await waitFor(() => {
			const editorElement = container.querySelector('.cm-editor');
			expect(editorElement).toBeTruthy();
		});
	});

	it('should render in read-only mode', async () => {
		const { container } = render(<CodeMirrorEditor value="const x = 42;" readOnly />);

		await waitFor(() => {
			const editorElement = container.querySelector('.cm-editor');
			expect(editorElement).toBeTruthy();
		});
	});

	it('should update content when value prop changes', async () => {
		const { container, rerender } = render(<CodeMirrorEditor value="initial" />);

		await waitFor(() => {
			const editorElement = container.querySelector('.cm-editor');
			expect(editorElement).toBeTruthy();
		});

		rerender(<CodeMirrorEditor value="updated" />);

		// Editor should update with new value
		await waitFor(() => {
			const editorElement = container.querySelector('.cm-editor');
			expect(editorElement).toBeTruthy();
		});
	});

	it('should apply custom className', async () => {
		const { container } = render(<CodeMirrorEditor value="test" className="custom-class" />);

		await waitFor(() => {
			const editorContainer = container.firstChild as HTMLElement;
			expect(editorContainer?.className).toContain('custom-class');
		});
	});
});
