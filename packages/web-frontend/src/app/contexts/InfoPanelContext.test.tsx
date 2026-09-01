import { act } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InfoPanelProvider, useInfoPanel } from './InfoPanelContext';

// Test component that uses the InfoPanel hook
function TestComponent() {
	const { infoPanelContent, setInfoPanelContent } = useInfoPanel();

	return (
		<div>
			// violations-suppress: react/no-raw-button test fixture
			<button onClick={() => setInfoPanelContent(<div>Panel Content</div>)}>Show Panel</button>
			// violations-suppress: react/no-raw-button test fixture
			<button onClick={() => setInfoPanelContent(null)}>Clear Panel</button>
			// violations-suppress: react/no-raw-button test fixture
			<button onClick={() => setInfoPanelContent(<div>Updated Content</div>)}>Update Panel</button>
			{infoPanelContent && <div data-testid="panel-content">{infoPanelContent}</div>}
		</div>
	);
}

describe('InfoPanelContext', () => {
	it('should throw error when useInfoPanel is used outside provider', () => {
		// Suppress console.error for this test
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(() => {
			render(<TestComponent />);
		}).toThrow('useInfoPanel must be used within InfoPanelProvider');

		spy.mockRestore();
	});

	it('should provide access to infoPanelContent and setInfoPanelContent', () => {
		render(
			<InfoPanelProvider>
				<TestComponent />
			</InfoPanelProvider>
		);

		expect(screen.getByText('Show Panel')).toBeInTheDocument();
		expect(screen.getByText('Clear Panel')).toBeInTheDocument();
		expect(screen.queryByTestId('panel-content')).not.toBeInTheDocument();
	});

	it('should set panel content when setInfoPanelContent is called', () => {
		render(
			<InfoPanelProvider>
				<TestComponent />
			</InfoPanelProvider>
		);

		const button = screen.getByText('Show Panel');
		act(() => {
			button.click();
		});

		expect(screen.getByTestId('panel-content')).toBeInTheDocument();
		expect(screen.getByText('Panel Content')).toBeInTheDocument();
	});

	it('should clear panel content when setInfoPanelContent is called with null', () => {
		render(
			<InfoPanelProvider>
				<TestComponent />
			</InfoPanelProvider>
		);

		// First show the panel
		const showButton = screen.getByText('Show Panel');
		act(() => {
			showButton.click();
		});

		expect(screen.getByTestId('panel-content')).toBeInTheDocument();

		// Then clear it
		const clearButton = screen.getByText('Clear Panel');
		act(() => {
			clearButton.click();
		});

		expect(screen.queryByTestId('panel-content')).not.toBeInTheDocument();
	});

	it('should update panel content when setInfoPanelContent is called again', () => {
		render(
			<InfoPanelProvider>
				<TestComponent />
			</InfoPanelProvider>
		);

		// First show initial content
		const showButton = screen.getByText('Show Panel');
		act(() => {
			showButton.click();
		});

		expect(screen.getByText('Panel Content')).toBeInTheDocument();

		// Then update it
		const updateButton = screen.getByText('Update Panel');
		act(() => {
			updateButton.click();
		});

		expect(screen.queryByText('Panel Content')).not.toBeInTheDocument();
		expect(screen.getByText('Updated Content')).toBeInTheDocument();
	});

	it('should initialize with null content', () => {
		function InitialStateComponent() {
			const { infoPanelContent } = useInfoPanel();
			return <div>{infoPanelContent === null ? 'No content' : 'Has content'}</div>;
		}

		render(
			<InfoPanelProvider>
				<InitialStateComponent />
			</InfoPanelProvider>
		);

		expect(screen.getByText('No content')).toBeInTheDocument();
	});
});
