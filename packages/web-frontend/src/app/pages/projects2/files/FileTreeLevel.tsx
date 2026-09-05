import { useEffect } from 'react';

import type { FileEntry } from '@shared/api/workspaceFiles.contract';

import { FileTreeNode } from './FileTreeNode';
import { useDirectoryListing } from './useDirectoryListing';

export interface FileTreeLevelProps {
	workspaceId: string;
	path: string;
	depth: number;
	expandedPaths: Set<string>;
	selectedPath: string | null;
	directoryContents: Map<string, FileEntry[]>;
	onToggle: (path: string) => void;
	onFileSelect: (path: string) => void;
	onDirectoryLoaded: (path: string, entries: FileEntry[]) => void;
}

/**
 * Single level of the file tree (recursive)
 */
export function FileTreeLevel({
	workspaceId,
	path,
	depth,
	expandedPaths,
	selectedPath,
	directoryContents,
	onToggle,
	onFileSelect,
	onDirectoryLoaded,
}: FileTreeLevelProps) {
	// Load directory contents
	const { entries, loading, error } = useDirectoryListing(workspaceId, path);

	// Cache the loaded entries in an effect to avoid setState during render
	useEffect(() => {
		if (entries.length > 0 && !directoryContents.has(path)) {
			onDirectoryLoaded(path, entries);
		}
	}, [entries, path, directoryContents, onDirectoryLoaded]);

	// Use cached entries or freshly loaded ones
	const displayEntries = directoryContents.get(path) || entries;

	if (error) {
		return (
			<div className="py-1 text-sm text-destructive" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
				Error loading directory
			</div>
		);
	}

	if (loading && displayEntries.length === 0) {
		return (
			<div className="py-1 text-sm text-muted-foreground" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
				Loading...
			</div>
		);
	}

	// Sort entries: directories first, then files
	const sortedEntries = [...displayEntries].sort((a, b) => {
		if (a.type === b.type) {
			return a.name.localeCompare(b.name);
		}
		return a.type === 'directory' ? -1 : 1;
	});

	return (
		<>
			{sortedEntries.map(entry => {
				const isDirectory = entry.type === 'directory';
				const isSelected = selectedPath === entry.path;
				const isEntryExpanded = isDirectory && expandedPaths.has(entry.path);

				return (
					<FileTreeNode
						key={entry.path}
						entry={entry}
						depth={depth}
						isExpanded={isEntryExpanded}
						isSelected={isSelected}
						onToggle={() => onToggle(entry.path)}
						onSelect={() => onFileSelect(entry.path)}
					>
						{isDirectory && isEntryExpanded && (
							<FileTreeLevel
								workspaceId={workspaceId}
								path={entry.path}
								depth={depth + 1}
								expandedPaths={expandedPaths}
								selectedPath={selectedPath}
								directoryContents={directoryContents}
								onToggle={onToggle}
								onFileSelect={onFileSelect}
								onDirectoryLoaded={onDirectoryLoaded}
							/>
						)}
					</FileTreeNode>
				);
			})}
		</>
	);
}
