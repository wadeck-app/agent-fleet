import { MemoryRouter } from 'react-router-dom';

import type { FileEntry } from '@shared/api/workspaceFiles.contract';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileBrowserPanel } from './FileBrowserPanel';
import * as useDirectoryListingModule from './useDirectoryListing';
import * as useFileContentModule from './useFileContent';

vi.mock('./useDirectoryListing');
vi.mock('./useFileContent');

function renderWithRouter(ui: React.ReactElement, initialEntries: string[] = ['/']) {
	return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

describe('FileBrowserPanel', () => {
	const mockEntries: FileEntry[] = [
		{ name: 'src', path: 'src', type: 'directory' },
		{ name: 'README.md', path: 'README.md', type: 'file', size: 1024 },
	];

	beforeEach(() => {
		vi.clearAllMocks();

		// Default mock for directory listing
		vi.spyOn(useDirectoryListingModule, 'useDirectoryListing').mockReturnValue({
			entries: mockEntries,
			loading: false,
			error: null,
			refresh: vi.fn(),
		});

		// Default mock for file content
		vi.spyOn(useFileContentModule, 'useFileContent').mockReturnValue({
			content: '',
			loading: false,
			error: null,
			save: vi.fn(),
			refresh: vi.fn(),
		});
	});

	it('should render file tree and empty state', async () => {
		renderWithRouter(<FileBrowserPanel workspaceId="workspace-1" />);

		// Tree should be visible
		await waitFor(() => {
			expect(screen.getByText('src')).toBeInTheDocument();
			expect(screen.getByText('README.md')).toBeInTheDocument();
		});

		// Empty state should be visible (no file selected)
		expect(screen.getByText('Select a file to view its contents')).toBeInTheDocument();
	});

	it('should show file editor when file is selected', async () => {
		const user = userEvent.setup();

		vi.spyOn(useFileContentModule, 'useFileContent').mockReturnValue({
			content: '# Welcome\n\nThis is a README file.',
			loading: false,
			error: null,
			save: vi.fn(),
			refresh: vi.fn(),
		});

		renderWithRouter(<FileBrowserPanel workspaceId="workspace-1" />);

		// Click on a file in the tree
		const fileNode = await screen.findByText('README.md');
		await user.click(fileNode);

		// After clicking, README.md appears both in tree and breadcrumb
		await waitFor(() => {
			const matches = screen.getAllByText('README.md');
			// At least 2: one in tree, one in breadcrumb
			expect(matches.length).toBeGreaterThanOrEqual(2);
		});
	});

	it('should restore selected file from URL on mount (deep-link)', async () => {
		vi.spyOn(useFileContentModule, 'useFileContent').mockReturnValue({
			content: 'file content here',
			loading: false,
			error: null,
			save: vi.fn(),
			refresh: vi.fn(),
		});

		// Simulate arriving with ?file=README.md in the URL
		renderWithRouter(<FileBrowserPanel workspaceId="workspace-1" />, ['/?file=README.md']);

		// The breadcrumb should show the file name (loaded from URL)
		await waitFor(() => {
			const matches = screen.getAllByText('README.md');
			expect(matches.length).toBeGreaterThanOrEqual(2);
		});
	});

	it('should have resizable tree panel and flexible editor', () => {
		const { container } = renderWithRouter(<FileBrowserPanel workspaceId="workspace-1" />);

		const treeContainer = container.querySelector('[data-tree-panel]');
		const editorContainer = container.querySelector('.flex-1');

		expect(treeContainer).toBeTruthy();
		expect(editorContainer).toBeTruthy();
		// Default width should be 250px
		expect((treeContainer as HTMLElement)?.style.width).toBe('250px');
	});

	it('should show tree with border-right', () => {
		const { container } = renderWithRouter(<FileBrowserPanel workspaceId="workspace-1" />);

		const treePanel = container.querySelector('[data-tree-panel]');
		expect(treePanel?.classList.contains('border-r')).toBe(true);
	});

	it('should maintain tree scroll independently of editor', () => {
		const { container } = renderWithRouter(<FileBrowserPanel workspaceId="workspace-1" />);

		const treePanel = container.querySelector('[data-tree-panel]');
		expect(treePanel?.classList.contains('overflow-auto')).toBe(true);
	});
});
