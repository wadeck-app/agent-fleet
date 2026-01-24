import { useEffect, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@framework/components/overlays/Dialog';
import { ColorPicker } from '@framework/components/pickers/ColorPicker';
import { Button } from '@framework/components/primitives/Button';
import { useAsyncData } from '@framework/hooks/useAsyncData';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Workspace } from '@shared/api/workspaces.contract';

import { ProjectSelect } from './ProjectSelect';
import { workspacesApi } from './workspaces.api';
import { suggestWorkspaceColor } from './workspaces.helpers';

interface EditWorkspaceDialogProps {
	workspace: Workspace;
	open: boolean;
	onClose: () => void;
	onSave: (
		workspaceId: string,
		data: { name?: string; description?: string; color?: string; projectId?: string | null }
	) => Promise<void>;
}

export function EditWorkspaceDialog({ workspace, open, onClose, onSave }: EditWorkspaceDialogProps) {
	const [name, setName] = useState(workspace.name || '');
	const [description, setDescription] = useState(workspace.description || '');
	const [color, setColor] = useState(workspace.color || '#6366F1');
	const [projectId, setProjectId] = useState<string | undefined>(workspace.projectId);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Fetch all workspaces for color suggestion
	const { data: workspacesData } = useAsyncData(() => workspacesApi.getWorkspacesList({}), []);

	// Suggest color when project changes and workspace doesn't have a color set
	useEffect(() => {
		if (projectId && !workspace.color && workspacesData?.items) {
			const suggestedColor = suggestWorkspaceColor(workspacesData.items, projectId);
			setColor(suggestedColor);
		}
	}, [projectId, workspace.color, workspacesData]);

	const handleSave = async () => {
		setIsSaving(true);
		setError(null);

		try {
			// Convert undefined to null for projectId to explicitly signal "remove"
			await onSave(workspace.id, {
				name,
				description,
				color,
				projectId: projectId === undefined ? null : projectId,
			});
			onClose();
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit Workspace</DialogTitle>
				</DialogHeader>

				<DialogBody>
					<div className="space-y-4">
						<div>
							<Label className="text-sm font-medium">Name</Label>
							<Input
								value={name}
								onChange={e => setName(e.target.value)}
								placeholder="Enter workspace name"
							/>
						</div>

						<div>
							<Label className="text-sm font-medium">Description</Label>
							<Input
								value={description}
								onChange={e => setDescription(e.target.value)}
								placeholder="Enter workspace description"
							/>
						</div>

						<div>
							<Label className="text-sm font-medium">Project</Label>
							<ProjectSelect
								value={projectId}
								onChange={setProjectId}
								placeholder="Select project (optional)"
							/>
						</div>

						<div>
							<Label className="text-sm font-medium">Color</Label>
							<ColorPicker value={color} onChange={setColor} />
						</div>

						{error && <div className="text-sm text-destructive">{error}</div>}
					</div>
				</DialogBody>

				<DialogFooter>
					<Button variant="outline" onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSaving}>
						{isSaving ? 'Saving...' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
