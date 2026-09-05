import { useState } from 'react';

import type { FileEntry } from '@shared/api/workspaceFiles.contract';

import { FileTreeLevel } from './FileTreeLevel';

interface FileTreeProps {
	workspaceId: string;
	onFileSelect: (path: string) => void;
	selectedPath: string | null;
}

/**
 * Recursive lazy-loaded tree component for browsing workspace files
 */
export function FileTree({ workspaceId, onFileSelect, selectedPath }: FileTreeProps) {
	// Track expanded directories
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['.']));

	// Track loaded directory contents
	const [directoryContents, setDirectoryContents] = useState<Map<string, FileEntry[]>>(new Map());

	const handleToggle = (path: string) => {
		const newExpanded = new Set(expandedPaths);
		if (expandedPaths.has(path)) {
			newExpanded.delete(path);
		} else {
			newExpanded.add(path);
		}
		setExpandedPaths(newExpanded);
	};

	return (
		<div className="h-full overflow-auto">
			<FileTreeLevel
				workspaceId={workspaceId}
				path="."
				depth={0}
				expandedPaths={expandedPaths}
				selectedPath={selectedPath}
				directoryContents={directoryContents}
				onToggle={handleToggle}
				onFileSelect={onFileSelect}
				onDirectoryLoaded={(path, entries) => {
					setDirectoryContents(prev => new Map(prev).set(path, entries));
				}}
			/>
		</div>
	);
}
