import type { FileEntry } from '@shared/api/workspaceFiles.contract';
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';

interface FileTreeNodeProps {
	entry: FileEntry;
	depth: number;
	isExpanded: boolean;
	isSelected: boolean;
	onToggle: () => void;
	onSelect: () => void;
	children?: React.ReactNode;
}

/**
 * Single tree node component for files and directories
 *
 * Layout: [indent] [chevron 16px] [icon 16px] [gap] [name]
 * Files get an invisible spacer instead of the chevron to keep icons aligned.
 */
export function FileTreeNode({
	entry,
	depth,
	isExpanded,
	isSelected,
	onToggle,
	onSelect,
	children,
}: FileTreeNodeProps) {
	const isDirectory = entry.type === 'directory';

	const handleClick = () => {
		if (isDirectory) {
			onToggle();
		} else {
			onSelect();
		}
	};

	return (
		<div>
			<div
				className={`flex cursor-pointer items-center py-1 pr-2 text-sm hover:bg-accent ${
					isSelected ? 'bg-accent' : ''
				}`}
				style={{ paddingLeft: `${depth * 16 + 8}px` }}
				onClick={handleClick}
			>
				{/* Chevron column - always 16px wide for alignment */}
				<span className="flex h-4 w-4 shrink-0 items-center justify-center">
					{isDirectory && (
						<ChevronRight
							className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
								isExpanded ? 'rotate-90' : ''
							}`}
						/>
					)}
				</span>
				{/* Icon column */}
				<span className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
					{isDirectory ? (
						isExpanded ? (
							<FolderOpen className="h-4 w-4 text-primary" />
						) : (
							<Folder className="h-4 w-4 text-primary" />
						)
					) : (
						<File className="h-4 w-4 text-muted-foreground" />
					)}
				</span>
				<span className="ml-1.5 truncate">{entry.name}</span>
			</div>
			{isDirectory && isExpanded && children && <div>{children}</div>}
		</div>
	);
}
