import { useState } from 'react';

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
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Workspace } from '@shared/api/workspaces.contract';

interface EditWorkspaceDialogProps {
	workspace: Workspace;
	open: boolean;
	onClose: () => void;
	onSave: (workspaceId: string, data: { name?: string; description?: string; color?: string }) => Promise<void>;
}

export function EditWorkspaceDialog({ workspace, open, onClose, onSave }: EditWorkspaceDialogProps) {
	const [name, setName] = useState(workspace.name || '');
	const [description, setDescription] = useState(workspace.description || '');
	const [color, setColor] = useState(workspace.color || '#6366F1');
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSave = async () => {
		setIsSaving(true);
		setError(null);

		try {
			await onSave(workspace.id, {
				name,
				description,
				color,
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
