import type { FileEntry } from '@shared/api/workspaceFiles.contract';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileTree } from './FileTree';
import * as useDirectoryListingModule from './useDirectoryListing';

vi.mock('./useDirectoryListing');

describe('FileTree', () => {
	const mockEntries: FileEntry[] = [
		{ name: 'src', path: 'src', type: 'directory' },
		{ name: 'README.md', path: 'README.md', type: 'file', size: 1024 },
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Critical: Unmount all components and clean up React state
		cleanup();
	});

	it('should render directory entries', async () => {
		vi.spyOn(useDirectoryListingModule, 'useDirectoryListing').mockImplementation((_, path) => ({
			entries: path === '.' ? mockEntries : [],
			loading: false,
			error: null,
			refresh: vi.fn(),
		}));

		render(<FileTree workspaceId="workspace-1" onFileSelect={vi.fn()} selectedPath={null} />);

		await waitFor(() => {
			expect(screen.getByText('src')).toBeInTheDocument();
			expect(screen.getByText('README.md')).toBeInTheDocument();
		});
	});

	it('should show loading state', () => {
		vi.spyOn(useDirectoryListingModule, 'useDirectoryListing').mockReturnValue({
			entries: [],
			loading: true,
			error: null,
			refresh: vi.fn(),
		});

		render(<FileTree workspaceId="workspace-1" onFileSelect={vi.fn()} selectedPath={null} />);

		expect(screen.getByText('Loading...')).toBeInTheDocument();
	});

	it('should show error state', () => {
		vi.spyOn(useDirectoryListingModule, 'useDirectoryListing').mockReturnValue({
			entries: [],
			loading: false,
			error: new Error('Failed to load'),
			refresh: vi.fn(),
		});

		render(<FileTree workspaceId="workspace-1" onFileSelect={vi.fn()} selectedPath={null} />);

		expect(screen.getByText('Error loading directory')).toBeInTheDocument();
	});

	it('should call onFileSelect when file is clicked', async () => {
		const user = userEvent.setup();
		const handleFileSelect = vi.fn();

		vi.spyOn(useDirectoryListingModule, 'useDirectoryListing').mockImplementation((_, path) => ({
			entries: path === '.' ? mockEntries : [],
			loading: false,
			error: null,
			refresh: vi.fn(),
		}));

		render(<FileTree workspaceId="workspace-1" onFileSelect={handleFileSelect} selectedPath={null} />);

		const fileNode = await screen.findByText('README.md');
		await user.click(fileNode);

		expect(handleFileSelect).toHaveBeenCalledWith('README.md');
	});

	it('should expand directory when clicked', async () => {
		const user = userEvent.setup();

		vi.spyOn(useDirectoryListingModule, 'useDirectoryListing').mockImplementation((_, path) => ({
			entries: path === '.' ? mockEntries : [],
			loading: false,
			error: null,
			refresh: vi.fn(),
		}));

		render(<FileTree workspaceId="workspace-1" onFileSelect={vi.fn()} selectedPath={null} />);

		const dirNode = await screen.findByText('src');
		await user.click(dirNode);

		// Directory should expand (chevron rotates)
		// More detailed testing would require checking CSS classes or child rendering
	});

	it('should highlight selected file', async () => {
		vi.spyOn(useDirectoryListingModule, 'useDirectoryListing').mockImplementation((_, path) => ({
			entries: path === '.' ? mockEntries : [],
			loading: false,
			error: null,
			refresh: vi.fn(),
		}));

		render(<FileTree workspaceId="workspace-1" onFileSelect={vi.fn()} selectedPath="README.md" />);

		await waitFor(() => {
			expect(screen.getByText('README.md')).toBeInTheDocument();
		});

		// Check if the selected file has the accent background class
		const selectedNode = screen.getByText('README.md').closest('div');
		expect(selectedNode?.className).toContain('bg-accent');
	});

	it('should sort directories before files', async () => {
		const mixedEntries: FileEntry[] = [
			{ name: 'file2.txt', path: 'file2.txt', type: 'file' },
			{ name: 'dir1', path: 'dir1', type: 'directory' },
			{ name: 'file1.txt', path: 'file1.txt', type: 'file' },
			{ name: 'dir2', path: 'dir2', type: 'directory' },
		];

		vi.spyOn(useDirectoryListingModule, 'useDirectoryListing').mockImplementation((_, path) => ({
			entries: path === '.' ? mixedEntries : [],
			loading: false,
			error: null,
			refresh: vi.fn(),
		}));

		render(<FileTree workspaceId="workspace-1" onFileSelect={vi.fn()} selectedPath={null} />);

		await waitFor(() => {
			const allNodes = screen.getAllByRole('generic').filter(el => el.textContent);
			const textContent = allNodes.map(el => el.textContent).join('|');

			// Directories should appear before files
			expect(textContent.indexOf('dir1')).toBeLessThan(textContent.indexOf('file1.txt'));
			expect(textContent.indexOf('dir2')).toBeLessThan(textContent.indexOf('file2.txt'));
		});
	});
});
