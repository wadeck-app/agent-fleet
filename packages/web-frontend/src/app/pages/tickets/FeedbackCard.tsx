import { useEffect, useState } from 'react';

import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FlowFeedback } from '@shared/api/flow-feedback.contract';
import { Loader2, Pencil, Star, Trash2 } from 'lucide-react';

import { ArrayFieldInput } from './ArrayFieldInput';
import { Label } from '@framework/components/forms/Label';
import { RatingInput } from './RatingInput';
import { feedbackApi } from './feedbackApi';

export interface FeedbackItemWithOptimistic extends FlowFeedback {
	/** e2-delete-confirmed: true while the delete API call is in flight */
	isDeleting?: boolean;
	/** e2-save: true while the update API call is in flight */
	isSaving?: boolean;
}

interface FeedbackCardProps {
	item: FeedbackItemWithOptimistic;
	onOptimisticUpdate: (updated: FeedbackItemWithOptimistic) => void;
	onSaveSuccess: (updated: FlowFeedback) => void;
	onSaveError: (originalItem: FlowFeedback) => void;
	onOptimisticDelete: (feedbackId: string) => void;
	onDeleteSuccess: (feedbackId: string) => void;
	onDeleteError: (feedbackId: string) => void;
}

export function FeedbackCard({
	item,
	onOptimisticUpdate,
	onSaveSuccess,
	onSaveError,
	onOptimisticDelete,
	onDeleteSuccess,
	onDeleteError,
}: FeedbackCardProps) {
	const { showToast } = useToast();
	const [isEditing, setIsEditing] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const [editRating, setEditRating] = useState(item.rating);
	const [editWentWell, setEditWentWell] = useState<string[]>(item.wentWell);
	const [editWentWrong, setEditWentWrong] = useState<string[]>(item.wentWrong);
	const [editSuggestions, setEditSuggestions] = useState<string[]>(item.suggestions ?? []);

	useEffect(() => {
		if (!isEditing) {
			setEditRating(item.rating);
			setEditWentWell(item.wentWell ?? []);
			setEditWentWrong(item.wentWrong ?? []);
			setEditSuggestions(item.suggestions ?? []);
		}
	}, [item, isEditing]);

	const handleEditOpen = () => {
		setEditRating(item.rating);
		setEditWentWell(item.wentWell);
		setEditWentWrong(item.wentWrong);
		setEditSuggestions(item.suggestions ?? []);
		setIsEditing(true);
	};

	const handleSave = async () => {
		const updatedValues = {
			rating: editRating,
			wentWell: editWentWell,
			wentWrong: editWentWrong,
			suggestions: editSuggestions.length > 0 ? editSuggestions : undefined,
		};

		const optimisticallyUpdated: FeedbackItemWithOptimistic = {
			...item,
			...updatedValues,
			isSaving: true,
		};
		onOptimisticUpdate(optimisticallyUpdated);
		setIsEditing(false);

		try {
			const updated = await feedbackApi.updateFeedback(item.id, updatedValues);
			onSaveSuccess(updated);
			showToast('Feedback updated', 'success');
		} catch (err) {
			onSaveError(item);
			showToast(`Failed to update feedback: ${getErrorMessage(err)}`, 'error');
		}
	};

	const handleDelete = async () => {
		onOptimisticDelete(item.id);

		try {
			await feedbackApi.deleteFeedback(item.id);
			onDeleteSuccess(item.id);
			showToast('Feedback deleted', 'success');
		} catch (err) {
			onDeleteError(item.id);
			showToast(`Failed to delete feedback: ${getErrorMessage(err)}`, 'error');
		}
	};

	if (isEditing) {
		return (
			<div
				className={`rounded-md border bg-card p-4 space-y-4 ${item.isSaving ? 'pointer-events-none opacity-50' : ''}`}
			>
				<p className="text-sm font-medium">Edit Feedback</p>

				<div className="space-y-1">
					<Label className="text-xs font-medium text-muted-foreground tracking-wide">
						Rating <span className="text-destructive">*</span>
					</Label>
					<RatingInput value={editRating} onChange={setEditRating} />
				</div>

				<ArrayFieldInput
					label="What went well"
					items={editWentWell}
					onChange={setEditWentWell}
					placeholder="Add an item and press Enter..."
				/>
				<ArrayFieldInput
					label="What went wrong"
					items={editWentWrong}
					onChange={setEditWentWrong}
					placeholder="Add an item and press Enter..."
				/>
				<ArrayFieldInput
					label="Suggestions"
					items={editSuggestions}
					onChange={setEditSuggestions}
					placeholder="Add a suggestion and press Enter..."
				/>

				<div className="flex items-center gap-2">
					<Button onClick={() => void handleSave()} disabled={editRating < 1 || item.isSaving}>
						{item.isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Save
					</Button>
					<Button type="button" variant="ghost" onClick={() => setIsEditing(false)} disabled={item.isSaving}>
						Cancel
					</Button>
				</div>
			</div>
		);
	}

	const pendingClass = item.isDeleting
		? 'line-through opacity-50'
		: item.isSaving
			? 'opacity-50 pointer-events-none'
			: '';

	return (
		<>
			<div className={`rounded-md border bg-card p-4 space-y-3 ${pendingClass}`}>
				<div className="flex items-center gap-2">
					<div className="flex gap-0.5">
						{[1, 2, 3, 4, 5].map(n => (
							<Star
								key={n}
								className={`size-4 fill-current ${n <= item.rating ? 'text-warning' : 'text-muted-foreground/20'}`}
							/>
						))}
					</div>
					<span className="text-xs text-muted-foreground">{new Date(item.submittedAt).toISOString().replace('T', ' ').slice(0, 19)}</span>
					<div className="ml-auto flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={handleEditOpen}
							aria-label="Edit feedback"
							disabled={item.isDeleting ?? false}
						>
							<Pencil className="size-4" />
						</Button>
						<RemoveItemButton
							onRemove={() => setDeleteOpen(true)}
							title="Delete feedback"
							disabled={item.isDeleting ?? false}
						/>
					</div>
				</div>
				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground tracking-wide">What went well</p>
					{item.wentWell.length > 0 ? (
						<ul className="list-disc list-inside space-y-0.5">
							{item.wentWell.map((w, i) => (
								<li key={i} className="text-sm">
									{w}
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground italic">Nothing noted</p>
					)}
				</div>
				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground tracking-wide">What went wrong</p>
					{item.wentWrong.length > 0 ? (
						<ul className="list-disc list-inside space-y-0.5">
							{item.wentWrong.map((w, i) => (
								<li key={i} className="text-sm">
									{w}
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground italic">Nothing noted</p>
					)}
				</div>
				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground tracking-wide">Suggestions</p>
					{item.suggestions && item.suggestions.length > 0 ? (
						<ul className="list-disc list-inside space-y-0.5">
							{item.suggestions.map((s, i) => (
								<li key={i} className="text-sm">
									{s}
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm text-muted-foreground italic">Nothing noted</p>
					)}
				</div>
			</div>

			<AlertDialogWrapper
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title="Delete feedback"
				description="This action cannot be undone."
				confirmLabel="Delete"
				variant="danger"
				icon={<Trash2 />}
				onConfirm={() => void handleDelete()}
			/>
		</>
	);
}
