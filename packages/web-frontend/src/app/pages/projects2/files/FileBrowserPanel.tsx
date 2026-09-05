import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { LineSelection } from '@framework/components/editor/CodeEditorTypes';
import { useLocalStorageState } from '@framework/hooks2/utility/useLocalStorageState';
import { FileText } from 'lucide-react';

import { FileEditorPanel } from './FileEditorPanel';
import { FileTree } from './FileTree';

interface FileBrowserPanelProps {
	workspaceId: string;
}

const MIN_TREE_WIDTH = 150;
const MAX_TREE_WIDTH = 600;
const DEFAULT_TREE_WIDTH = 250;

const isValidWidth = (value: unknown): value is number =>
	typeof value === 'number' && value >= MIN_TREE_WIDTH && value <= MAX_TREE_WIDTH;

/**
 * Parse a `line` URL param into a LineSelection.
 * Accepts "5" (single line) or "5-10" (range).
 */
function parseLineParam(param: string | null): LineSelection | null {
	if (!param) return null;
	const match = param.match(/^(\d+)(?:-(\d+))?$/);
	if (!match) return null;
	const from = parseInt(match[1], 10);
	const to = match[2] ? parseInt(match[2], 10) : from;
	if (from < 1 || to < from) return null;
	return { from, to };
}

function serializeLineSelection(selection: LineSelection): string {
	return selection.from === selection.to ? String(selection.from) : `${selection.from}-${selection.to}`;
}

/**
 * Main file browser panel with tree on left and editor on right.
 * The tree panel is resizable via a drag handle. Width persists in localStorage.
 * The selected file path is stored in the URL (?file=...) for deep-linking.
 * The selected line(s) are stored in the URL (?line=5 or ?line=5-10).
 */
export function FileBrowserPanel({ workspaceId }: FileBrowserPanelProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const selectedFilePath = searchParams.get('file');
	const selectedLines = parseLineParam(searchParams.get('line'));

	const [treeWidth, setTreeWidth] = useLocalStorageState('file-browser-tree-width', DEFAULT_TREE_WIDTH, {
		validate: isValidWidth,
	});
	const [isDragging, setIsDragging] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const handleFileSelect = (path: string) => {
		setSearchParams(
			prev => {
				const next = new URLSearchParams(prev);
				next.set('file', path);
				// Clear line selection when changing files
				next.delete('line');
				return next;
			},
			{ replace: true }
		);
	};

	const handleLineSelect = (selection: LineSelection) => {
		setSearchParams(
			prev => {
				const next = new URLSearchParams(prev);
				next.set('line', serializeLineSelection(selection));
				return next;
			},
			{ replace: true }
		);
	};

	const handleMouseDown = useCallback(
		(event: React.MouseEvent) => {
			event.preventDefault();
			setIsDragging(true);

			const startX = event.clientX;
			const startWidth =
				containerRef.current?.querySelector<HTMLDivElement>('[data-tree-panel]')?.offsetWidth ??
				DEFAULT_TREE_WIDTH;

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const delta = moveEvent.clientX - startX;
				const newWidth = Math.min(MAX_TREE_WIDTH, Math.max(MIN_TREE_WIDTH, startWidth + delta));
				setTreeWidth(newWidth);
			};

			const handleMouseUp = () => {
				setIsDragging(false);
				document.removeEventListener('mousemove', handleMouseMove);
				document.removeEventListener('mouseup', handleMouseUp);
			};

			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		},
		[setTreeWidth]
	);

	return (
		<div ref={containerRef} className="flex h-full overflow-hidden">
			{/* File Tree */}
			<div
				data-tree-panel
				className="flex h-full flex-shrink-0 flex-col overflow-auto border-r border-border bg-card"
				style={{ width: `${treeWidth}px` }}
			>
				<div className="border-b border-border bg-muted/30 px-4 py-2 text-sm font-medium">Files</div>
				<div className="flex-1 overflow-auto">
					<FileTree
						workspaceId={workspaceId}
						onFileSelect={handleFileSelect}
						selectedPath={selectedFilePath}
					/>
				</div>
			</div>

			{/* Resize Handle */}
			{/* Resize handle: invisible hit area with visible line on hover */}
			<div
				className="group relative z-20 h-full w-1.5 flex-shrink-0 cursor-col-resize"
				onMouseDown={handleMouseDown}
			>
				<div
					className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-all group-hover:w-1 group-hover:bg-primary/30 ${
						isDragging ? 'w-1 bg-primary/40' : ''
					}`}
				/>
			</div>

			{/* Editor -- negative margin overlaps the resize handle to eliminate visual gap */}
			<div className="z-10 -ml-1.5 flex-1 overflow-hidden bg-background">
				{selectedFilePath ? (
					<FileEditorPanel
						workspaceId={workspaceId}
						filePath={selectedFilePath}
						selectedLines={selectedLines}
						onLineSelect={handleLineSelect}
					/>
				) : (
					<div className="flex h-full items-center justify-center">
						<div className="text-center">
							<FileText className="mx-auto mb-2 size-12 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">Select a file to view its contents</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
