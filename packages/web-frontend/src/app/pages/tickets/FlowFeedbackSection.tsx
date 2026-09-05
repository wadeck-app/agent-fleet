import { useCallback, useEffect, useRef, useState } from 'react';

import { RemoveItemButton } from '@framework/components2/list/RemoveItemButton';
import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { CreateFlowFeedback, FlowFeedback, FlowRetrospective } from '@shared/api/flow-feedback.contract';
import { B2F_TICKET_FEEDBACK_SUBMITTED } from '@shared/transport';
import { ChevronDown, ChevronRight, Loader2, Pencil, Star, Trash2 } from 'lucide-react';

import { useTransport } from '@/transport';

import { feedbackApi } from './feedbackApi';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FlowFeedbackSectionProps {
	ticketId: string;
	/** If set, a retrospective exists */
	flowRetrospectiveId?: string;
	/** The current flow proposal ID -- used as flowId in the feedback body and to fetch submitted feedback */
	currentFlowProposalId?: string;
	/** Called after feedback is successfully submitted */
	onFeedbackSubmitted?: () => void;
	/** Sort order for feedback items -- matches the global sort toggle */
	sortOrder?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// ArrayFieldInput -- add/remove/edit list of strings inline
// ---------------------------------------------------------------------------

interface ArrayFieldInputProps {
	label: string;
	items: string[];
	onChange: (items: string[]) => void;
	placeholder?: string;
	required?: boolean;
}

function ArrayFieldInput({ label, items, onChange, placeholder, required }: ArrayFieldInputProps) {
	const [draft, setDraft] = useState('');

	// T4 fix: generate a stable id from the label so the Label htmlFor connects to the Input
	const inputId = `array-field-${label.toLowerCase().replace(/\s+/g, '-')}`;

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const trimmed = draft.trim();
			if (trimmed) {
				onChange([...items, trimmed]);
				setDraft('');
			}
		}
	};

	// aa/ab fix: commit draft on blur so typing and clicking Submit doesn't discard the item
	const handleBlur = () => {
		const trimmed = draft.trim();
		if (trimmed) {
			onChange([...items, trimmed]);
			setDraft('');
		}
	};

	const handleRemove = (index: number) => {
		onChange(items.filter((_, i) => i !== index));
	};

	// e2-inline: update an existing item at a specific index
	const handleItemChange = (index: number, value: string) => {
		const updated = [...items];
		updated[index] = value;
		onChange(updated);
	};

	return (
		<div className="space-y-1">
			{/* T4 fix: connect label to input via htmlFor/id */}
			<Label htmlFor={inputId} className="text-xs font-medium text-muted-foreground tracking-wide">
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</Label>
			<div className="space-y-1">
				{/* e2-inline: each item rendered as an editable Input instead of a read-only span */}
				{items.map((item, i) => (
					<div key={i} className="flex items-center gap-1 py-0.5">
						<Input
							value={item}
							onChange={e => handleItemChange(i, e.target.value)}
							className="flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
						/>
						<RemoveItemButton onRemove={() => handleRemove(i)} title="Remove item" />
					</div>
				))}
			</div>
			<Input
				id={inputId}
				value={draft}
				onChange={e => setDraft(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
				placeholder={placeholder ?? 'Type and press Enter to add...'}
				className="text-sm"
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// RatingInput -- star/number buttons 1-5
// ---------------------------------------------------------------------------

interface RatingInputProps {
	value: number;
	onChange: (rating: number) => void;
}

function RatingInput({ value, onChange }: RatingInputProps) {
	return (
		<div className="flex gap-1">
			{[1, 2, 3, 4, 5].map(n => (
				<Button
					key={n}
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => onChange(n)}
					className={`h-auto p-0.5 ${n <= value ? 'text-warning' : 'text-muted-foreground/30 hover:text-warning/60'}`}
					aria-label={`Rate ${n} out of 5`}
				>
					<Star className="size-6 fill-current" />
				</Button>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// FeedbackCard -- displays a single submitted feedback item with edit/delete
// ---------------------------------------------------------------------------

interface FeedbackItemWithOptimistic extends FlowFeedback {
	/** e2-delete-confirmed: true while the delete API call is in flight */
	isDeleting?: boolean;
	/** e2-save: true while the update API call is in flight */
	isSaving?: boolean;
}

interface FeedbackCardProps {
	item: FeedbackItemWithOptimistic;
	/** e2-save: called with optimistically-updated values + isSaving flag */
	onOptimisticUpdate: (updated: FeedbackItemWithOptimistic) => void;
	/** e2-save: called on success to finalize (remove isSaving), on error to rollback */
	onSaveSuccess: (updated: FlowFeedback) => void;
	onSaveError: (originalItem: FlowFeedback) => void;
	/** e2-delete-confirmed: called to mark item as deleting */
	onOptimisticDelete: (feedbackId: string) => void;
	/** e2-delete-confirmed: called on success to remove the item */
	onDeleteSuccess: (feedbackId: string) => void;
	/** e2-delete-confirmed: called on error to undo deleting mark */
	onDeleteError: (feedbackId: string) => void;
}

function FeedbackCard({
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

	// Edit form state -- initialised from item when entering edit mode
	const [editRating, setEditRating] = useState(item.rating);
	const [editWentWell, setEditWentWell] = useState<string[]>(item.wentWell);
	const [editWentWrong, setEditWentWrong] = useState<string[]>(item.wentWrong);
	const [editSuggestions, setEditSuggestions] = useState<string[]>(item.suggestions ?? []);

	// Re-sync edit state when item prop changes from outside (e.g. WS refresh) while not editing
	useEffect(() => {
		if (!isEditing) {
			setEditRating(item.rating);
			setEditWentWell(item.wentWell ?? []);
			setEditWentWrong(item.wentWrong ?? []);
			setEditSuggestions(item.suggestions ?? []);
		}
	}, [item, isEditing]);

	const handleEditOpen = () => {
		// Reset fields to current item values each time edit is opened
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

		// e2-save: immediately update local state with new values + mark as saving
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
			// e2-save: rollback on error
			onSaveError(item);
			showToast(`Failed to update feedback: ${getErrorMessage(err)}`, 'error');
		}
	};

	const handleDelete = async () => {
		// e2-delete-confirmed: immediately mark as deleting
		onOptimisticDelete(item.id);

		try {
			await feedbackApi.deleteFeedback(item.id);
			onDeleteSuccess(item.id);
			showToast('Feedback deleted', 'success');
		} catch (err) {
			// e2-delete-confirmed: rollback on error
			onDeleteError(item.id);
			showToast(`Failed to delete feedback: ${getErrorMessage(err)}`, 'error');
		}
	};

	// Edit mode -- inline form pre-filled with current values
	if (isEditing) {
		return (
			<div
				className={`rounded-md border bg-card p-4 space-y-4 ${item.isSaving ? 'pointer-events-none opacity-50' : ''}`}
			>
				<p className="text-sm font-medium">Edit Feedback</p>

				{/* Rating */}
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

	// View mode
	// e2-delete-confirmed: line-through + opacity when pending deletion
	// e2-save: opacity-50 pointer-events-none when pending save
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
					<span className="text-xs text-muted-foreground">{new Date(item.submittedAt).toLocaleString()}</span>
					{/* e2-icons: standard icon buttons using Button variant="ghost" size="icon-sm" */}
					<div className="ml-auto flex items-center gap-1">
						{/* Edit button -- pencil icon, neutral */}
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={handleEditOpen}
							aria-label="Edit feedback"
							disabled={item.isDeleting ?? false}
						>
							<Pencil className="size-4" />
						</Button>
						{/* Delete button -- RED (destructive), use RemoveItemButton */}
						<RemoveItemButton
							onRemove={() => setDeleteOpen(true)}
							title="Delete feedback"
							disabled={item.isDeleting ?? false}
						/>
					</div>
				</div>
				{/* What went well -- always shown, with "Nothing noted" placeholder when empty */}
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
				{/* What went wrong -- always shown, with "Nothing noted" placeholder when empty */}
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
				{/* Suggestions -- always shown, with "Nothing noted" placeholder when empty */}
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

			{/* e2-delete-dialog: use AlertDialogWrapper instead of inline AlertDialog composition */}
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

// ---------------------------------------------------------------------------
// FlowFeedbackForm -- collects feedback values and calls onSubmit
// ---------------------------------------------------------------------------

interface FormValues {
	rating: number;
	wentWell: string[];
	wentWrong: string[];
	suggestions: string[];
}

interface FlowFeedbackFormProps {
	initialValues?: FormValues;
	onSubmit: (values: FormValues) => Promise<void>;
	/** Optional cancel handler -- shown only when a previous feedback already exists */
	onCancel?: () => void;
}

function FlowFeedbackForm({ initialValues, onSubmit, onCancel }: FlowFeedbackFormProps) {
	const [rating, setRating] = useState(initialValues?.rating ?? 0);
	const [wentWell, setWentWell] = useState<string[]>(initialValues?.wentWell ?? []);
	const [wentWrong, setWentWrong] = useState<string[]>(initialValues?.wentWrong ?? []);
	const [suggestions, setSuggestions] = useState<string[]>(initialValues?.suggestions ?? []);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const canSubmit = rating >= 1 && !isSubmitting;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsSubmitting(true);
		try {
			await onSubmit({ rating, wentWell, wentWrong, suggestions });
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="relative">
			<div className={`space-y-4 ${isSubmitting ? 'pointer-events-none opacity-50' : ''}`}>
				<p className="text-sm font-medium">Submit Flow Execution Feedback</p>

				{/* Rating */}
				<div className="space-y-1">
					<Label className="text-xs font-medium text-muted-foreground tracking-wide">
						Rating <span className="text-destructive">*</span>
					</Label>
					<RatingInput value={rating} onChange={setRating} />
				</div>

				{/* Array fields */}
				<ArrayFieldInput
					label="What went well"
					items={wentWell}
					onChange={setWentWell}
					placeholder="Add an item and press Enter..."
				/>
				<ArrayFieldInput
					label="What went wrong"
					items={wentWrong}
					onChange={setWentWrong}
					placeholder="Add an item and press Enter..."
				/>
				<ArrayFieldInput
					label="Suggestions"
					items={suggestions}
					onChange={setSuggestions}
					placeholder="Add a suggestion and press Enter..."
				/>

				<div className="flex items-center gap-2">
					<Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
						{isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Submit Feedback
					</Button>
					{/* Cancel button -- only when re-adding (a previous feedback already exists) */}
					{onCancel && (
						<Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
							Cancel
						</Button>
					)}
				</div>
			</div>
			{isSubmitting && (
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex flex-col items-center gap-2 text-muted-foreground">
						<Loader2 className="size-5 animate-spin" />
						<span className="text-sm">Submitting feedback...</span>
					</div>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
const retroToggleCls =
	'flex w-full items-center justify-start gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50';

// RetrospectiveCard -- fetches and displays retrospective
// ---------------------------------------------------------------------------

interface RetrospectiveCardProps {
	ticketId: string;
}

function RetrospectiveCard({ ticketId }: RetrospectiveCardProps) {
	const [retro, setRetro] = useState<FlowRetrospective | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);

		feedbackApi
			.getRetrospective(ticketId)
			.then(data => {
				if (!cancelled) {
					setRetro(data);
					setIsLoading(false);
				}
			})
			.catch(err => {
				if (!cancelled) {
					setError(getErrorMessage(err));
					setIsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [ticketId]);

	if (isLoading) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Loading...</p>
			</div>
		);
	}

	if (error || !retro) {
		return (
			<div className="rounded-md border bg-card p-3">
				<p className="text-sm text-muted-foreground">
					{error ? `Could not load retrospective: ${error}` : 'Retrospective not yet available.'}
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-md border">
			<Button
				type="button"
				variant="ghost"
				onClick={() => setOpen(v => !v)}
				className={retroToggleCls}
			>
				{open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
				Agent Retrospective
				<span className="ml-auto text-xs font-normal text-muted-foreground">
					{new Date(retro.generatedAt).toLocaleString()}
				</span>
			</Button>

			{open && (
				<div className="border-t space-y-4 p-3">
					{/* Execution summary */}
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground tracking-wide">Execution summary</p>
						<p className="text-sm whitespace-pre-wrap">{retro.executionSummary}</p>
					</div>

					{/* Went well */}
					{retro.wentWell.length > 0 && (
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground tracking-wide">What went well</p>
							<ul className="list-disc list-inside space-y-0.5">
								{retro.wentWell.map((item, i) => (
									<li key={i} className="text-sm">
										{item}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Went wrong */}
					{retro.wentWrong.length > 0 && (
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground tracking-wide">What went wrong</p>
							<ul className="list-disc list-inside space-y-0.5">
								{retro.wentWrong.map((item, i) => (
									<li key={i} className="text-sm">
										{item}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Suggestions */}
					{retro.suggestions.length > 0 && (
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground tracking-wide">Suggestions</p>
							<ul className="list-disc list-inside space-y-0.5">
								{retro.suggestions.map((item, i) => (
									<li key={i} className="text-sm">
										{item}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// FlowFeedbackSection -- main export
// ---------------------------------------------------------------------------

/**
 * ===========================================================================================
 * FLOW FEEDBACK SECTION
 * ===========================================================================================
 *
 * Rendered inside the "Feedback" tab of TicketDetailLayoutG.
 * Shows the feedback form when no feedback has been submitted yet,
 * a "submitted" state when feedback exists, and the retrospective card
 * when a retrospective is available.
 *
 * ===========================================================================================
 */
export function FlowFeedbackSection({
	ticketId,
	flowRetrospectiveId,
	currentFlowProposalId,
	onFeedbackSubmitted,
	sortOrder = 'asc',
}: FlowFeedbackSectionProps) {
	const { showToast } = useToast();
	const { transport } = useTransport();
	const [feedbackItems, setFeedbackItems] = useState<FeedbackItemWithOptimistic[]>([]);
	const [loading, setLoading] = useState(true);
	const [showNewForm, setShowNewForm] = useState(false);
	// d fix: optimistic card shown while the API call is in flight
	const [optimisticItem, setOptimisticItem] = useState<FlowFeedback | null>(null);
	// d fix: form values to restore on error
	const [restoredValues, setRestoredValues] = useState<
		{ rating: number; wentWell: string[]; wentWrong: string[]; suggestions: string[] } | undefined
	>(undefined);

	// gf: absorb-counter for B2F_TICKET_FEEDBACK_SUBMITTED events we know are ours.
	// Incremented before each submitFeedback call. Decremented by the WS subscriber when it
	// absorbs the event (not in finally) -- this is correct because the HTTP response always
	// arrives before the WS event, so a finally-based decrement would reach 0 too early.
	// On API error the server never sends the WS event, so we decrement in catch instead.
	const expectedWsEvents = useRef(0);

	// W4 fix: stable reference so useEffect dependency array does not need eslint-disable
	const fetchFeedback = useCallback(async () => {
		if (!currentFlowProposalId) {
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const data = await feedbackApi.getFeedbackByFlow(currentFlowProposalId);
			setFeedbackItems(data.items);
		} catch {
			// non-fatal -- show empty state
		} finally {
			setLoading(false);
		}
	}, [currentFlowProposalId]);

	useEffect(() => {
		void fetchFeedback();
	}, [fetchFeedback]);

	// W3 fix: subscribe to B2F_TICKET_FEEDBACK_SUBMITTED so external submissions are reflected
	// gf: absorb events we know are ours -- decrement the counter here, not in the mutation.
	useEffect(() => {
		const unsub = transport.subscribe(B2F_TICKET_FEEDBACK_SUBMITTED, () => {
			if (expectedWsEvents.current > 0) {
				expectedWsEvents.current--;
				return;
			}
			void fetchFeedback();
		});
		return unsub;
	}, [transport, fetchFeedback]);

	const handleSubmit = async (values: {
		rating: number;
		wentWell: string[];
		wentWrong: string[];
		suggestions: string[];
	}) => {
		const body: CreateFlowFeedback = {
			ticketId,
			flowId: currentFlowProposalId ?? '',
			taskId: '',
			rating: values.rating,
			wentWell: values.wentWell,
			wentWrong: values.wentWrong,
			suggestions: values.suggestions.length > 0 ? values.suggestions : undefined,
			author: 'user',
		};

		// d fix: immediately show an optimistic card
		const optimistic: FlowFeedback = {
			id: `optimistic-${Date.now()}`,
			ticketId,
			flowId: currentFlowProposalId ?? '',
			taskId: '',
			rating: values.rating,
			wentWell: values.wentWell,
			wentWrong: values.wentWrong,
			suggestions: values.suggestions.length > 0 ? values.suggestions : undefined,
			author: 'user',
			submittedAt: new Date().toISOString(),
		};
		setOptimisticItem(optimistic);
		setShowNewForm(false);
		setRestoredValues(undefined);

		// gf: expect one WS event from this submission -- decremented by subscriber on absorb.
		// If the API errors, no WS event will arrive, so we decrement in catch instead.
		expectedWsEvents.current++;
		try {
			const created = await feedbackApi.submitFeedback(ticketId, body);
			showToast('Feedback submitted successfully', 'success');
			setOptimisticItem(null);
			setFeedbackItems(prev => [...prev, created]);
			onFeedbackSubmitted?.();
		} catch (err) {
			// d fix: on error -- remove optimistic card, restore form with entered values
			expectedWsEvents.current--; // no WS event coming from server
			setOptimisticItem(null);
			setRestoredValues(values);
			setShowNewForm(feedbackItems.length > 0);
			showToast(`Failed to submit feedback: ${getErrorMessage(err)}`, 'error');
		}
	};

	// e2-save: optimistically update an item in the list (show isSaving state)
	const handleOptimisticUpdate = (updated: FeedbackItemWithOptimistic) => {
		setFeedbackItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
	};

	// e2-save: on API success -- remove isSaving flag (use server-returned values)
	const handleSaveSuccess = (updated: FlowFeedback) => {
		setFeedbackItems(prev => prev.map(item => (item.id === updated.id ? { ...updated } : item)));
	};

	// e2-save: on API error -- rollback to original item values
	const handleSaveError = (originalItem: FlowFeedback) => {
		setFeedbackItems(prev => prev.map(item => (item.id === originalItem.id ? { ...originalItem } : item)));
	};

	// e2-delete-confirmed: mark item as deleting immediately
	const handleOptimisticDelete = (feedbackId: string) => {
		setFeedbackItems(prev => prev.map(item => (item.id === feedbackId ? { ...item, isDeleting: true } : item)));
	};

	// e2-delete-confirmed: on API success -- remove item from list
	const handleDeleteSuccess = (feedbackId: string) => {
		setFeedbackItems(prev => prev.filter(item => item.id !== feedbackId));
	};

	// e2-delete-confirmed: on API error -- rollback isDeleting mark
	const handleDeleteError = (feedbackId: string) => {
		setFeedbackItems(prev => prev.map(item => (item.id === feedbackId ? { ...item, isDeleting: false } : item)));
	};

	if (loading) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Loading...</p>
			</div>
		);
	}

	const hasFeedback = feedbackItems.length > 0;
	// Show form when: no items and no optimistic pending, or explicitly adding another
	const showForm = (!hasFeedback || showNewForm) && !optimisticItem;

	// B1 fix: sort feedback items by submittedAt to respect the global sort toggle
	const sortedItems = [...feedbackItems].sort((a, b) =>
		sortOrder === 'asc' ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt)
	);

	return (
		<div className="space-y-6 py-2">
			{/* Retrospective (shown when available, regardless of feedback state) */}
			{flowRetrospectiveId && (
				<div className="space-y-2">
					<RetrospectiveCard ticketId={ticketId} />
				</div>
			)}

			{/* d fix: optimistic pending card -- shown while API call is in flight */}
			{optimisticItem && (
				<div className="relative opacity-60">
					<FeedbackCard
						item={optimisticItem}
						onOptimisticUpdate={() => {}}
						onSaveSuccess={() => {}}
						onSaveError={() => {}}
						onOptimisticDelete={() => {}}
						onDeleteSuccess={() => {}}
						onDeleteError={() => {}}
					/>
					<div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/40">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				</div>
			)}

			{/* B2 fix: removed "Submitted" banner -- list already shows items; keep "Add another" button */}
			{hasFeedback && !showNewForm && !optimisticItem && (
				<div className="space-y-3">
					<div className="flex justify-end">
						<Button variant="outline" size="sm" onClick={() => setShowNewForm(true)}>
							Add another feedback
						</Button>
					</div>
					<div className="space-y-3">
						{sortedItems.map(item => (
							<FeedbackCard
								key={item.id}
								item={item}
								onOptimisticUpdate={handleOptimisticUpdate}
								onSaveSuccess={handleSaveSuccess}
								onSaveError={handleSaveError}
								onOptimisticDelete={handleOptimisticDelete}
								onDeleteSuccess={handleDeleteSuccess}
								onDeleteError={handleDeleteError}
							/>
						))}
					</div>
				</div>
			)}

			{/* Feedback form -- shown when no feedback yet, or when adding another */}
			{showForm && (
				<FlowFeedbackForm
					initialValues={restoredValues}
					onSubmit={handleSubmit}
					onCancel={hasFeedback ? () => setShowNewForm(false) : undefined}
				/>
			)}
		</div>
	);
}
