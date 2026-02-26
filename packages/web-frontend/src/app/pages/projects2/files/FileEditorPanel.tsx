import { useEffect, useRef, useState } from 'react';

import { CodeEditor } from '@framework/components/editor/CodeEditor';
import type { LineSelection } from '@framework/components/editor/CodeEditorTypes';
import { getFileExtension } from '@framework/components/editor/languageDetection';
import { Button } from '@framework/components/primitives/Button';
import { ChevronRight } from 'lucide-react';

import { useFileContent } from './useFileContent';

interface FileEditorPanelProps {
	workspaceId: string;
	filePath: string;
	selectedLines?: LineSelection | null;
	onLineSelect?: (selection: LineSelection) => void;
}

/**
 * File editor panel with breadcrumb, editor, and save/discard controls.
 *
 * When switching files, keeps displaying the previous file until the new one
 * has finished loading to avoid a flickering title/empty editor.
 */
export function FileEditorPanel({ workspaceId, filePath, selectedLines, onLineSelect }: FileEditorPanelProps) {
	const { content, loading, error, save } = useFileContent(workspaceId, filePath);
	const [currentContent, setCurrentContent] = useState(content);
	const [saving, setSaving] = useState(false);

	// Track the file path that is currently displayed (confirmed loaded)
	const [displayedPath, setDisplayedPath] = useState(filePath);
	const isInitialLoad = useRef(true);

	// When content finishes loading for the new file, commit it
	useEffect(() => {
		if (!loading && !error) {
			setDisplayedPath(filePath);
			setCurrentContent(content);
			isInitialLoad.current = false;
		}
	}, [content, loading, error, filePath]);

	// Determine if a different file is being loaded
	const isLoadingNewFile = filePath !== displayedPath && loading;

	const isDirty = currentContent !== content && !isLoadingNewFile;

	const handleSave = async () => {
		try {
			setSaving(true);
			await save(currentContent);
		} catch (err) {
			console.error('Failed to save file:', err);
		} finally {
			setSaving(false);
		}
	};

	const handleDiscard = () => {
		setCurrentContent(content);
	};

	// Use the displayed path (not the requested one) for breadcrumb and language
	const fileExtension = getFileExtension(displayedPath);
	const pathParts = displayedPath.split('/').filter(Boolean);

	// Only show full loading state on initial load (no previous file to show)
	if (isInitialLoad.current && loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-muted-foreground">Loading file...</p>
			</div>
		);
	}

	if (error && filePath === displayedPath) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-destructive">Error loading file: {error.message}</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Breadcrumb */}
			<div className="flex items-center gap-1 border-b border-border bg-muted/30 px-4 py-2 text-sm">
				{pathParts.map((part, index) => (
					<div key={index} className="flex items-center gap-1">
						{index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
						<span className={index === pathParts.length - 1 ? 'font-medium' : 'text-muted-foreground'}>
							{part}
						</span>
					</div>
				))}
				{isLoadingNewFile && <span className="ml-2 text-xs text-muted-foreground">Loading...</span>}
			</div>

			{/* Editor */}
			<div className="flex-1 overflow-hidden">
				<CodeEditor
					value={currentContent}
					onChange={setCurrentContent}
					language={fileExtension || undefined}
					selectedLines={selectedLines}
					onLineSelect={onLineSelect}
					className="h-full"
				/>
			</div>

			{/* Save/Discard buttons */}
			{isDirty && (
				<div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-2">
					<Button variant="outline" size="sm" onClick={handleDiscard} disabled={saving}>
						Discard
					</Button>
					<Button variant="default" size="sm" onClick={handleSave} disabled={saving}>
						{saving ? 'Saving...' : 'Save'}
					</Button>
				</div>
			)}
		</div>
	);
}
