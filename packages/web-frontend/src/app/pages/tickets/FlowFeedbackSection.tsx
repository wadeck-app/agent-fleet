import { useEffect, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { CreateFlowFeedback, FlowFeedback, FlowRetrospective } from '@shared/api/flow-feedback.contract';
import { ChevronDown, ChevronRight, Loader2, Star } from 'lucide-react';

import { feedbackApi } from './feedbackApi';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FlowFeedbackSectionProps {
	ticketId: string;
	/** If set, a retrospective exists */
	flowRetrospectiveId?: string;
	/** The current flow proposal ID — used as flowId in the feedback body and to fetch submitted feedback */
	currentFlowProposalId?: string;
	/** Called after feedback is successfully submitted */
	onFeedbackSubmitted?: () => void;
}

// ---------------------------------------------------------------------------
// ArrayFieldInput — add/remove list of strings
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

	return (
		<div className="space-y-1">
			<Label className="text-xs font-medium text-muted-foreground tracking-wide">
				{label}
				{required && <span className="ml-1 text-destructive">*</span>}
			</Label>
			<div className="space-y-1">
				{items.map((item, i) => (
					<div key={i} className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5">
						<span className="flex-1 text-sm">{item}</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => handleRemove(i)}
							className="h-auto p-0 text-muted-foreground hover:text-destructive"
						>
							×
						</Button>
					</div>
				))}
			</div>
			<Input
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
// RatingInput — star/number buttons 1-5
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
// FeedbackCard — displays a single submitted feedback item
// ---------------------------------------------------------------------------

interface FeedbackCardProps {
	item: FlowFeedback;
}

function FeedbackCard({ item }: FeedbackCardProps) {
	return (
		<div className="rounded-md border bg-card p-4 space-y-3">
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
			</div>
			{/* What went well — always shown, with "Nothing noted" placeholder when empty */}
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
			{/* What went wrong — always shown, with "Nothing noted" placeholder when empty */}
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
			{/* Suggestions — always shown, with "Nothing noted" placeholder when empty */}
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
	);
}

// ---------------------------------------------------------------------------
// FlowFeedbackForm — collects feedback values and calls onSubmit
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
	/** Optional cancel handler — shown only when a previous feedback already exists */
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
					{/* Cancel button — only when re-adding (a previous feedback already exists) */}
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
// RetrospectiveCard — fetches and displays retrospective
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
				className="flex w-full items-center justify-start gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50"
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
// FlowFeedbackSection — main export
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
}: FlowFeedbackSectionProps) {
	const { showToast } = useToast();
	const [feedbackItems, setFeedbackItems] = useState<FlowFeedback[]>([]);
	const [loading, setLoading] = useState(true);
	const [showNewForm, setShowNewForm] = useState(false);
	// d fix: optimistic card shown while the API call is in flight
	const [optimisticItem, setOptimisticItem] = useState<FlowFeedback | null>(null);
	// d fix: form values to restore on error
	const [restoredValues, setRestoredValues] = useState<
		{ rating: number; wentWell: string[]; wentWrong: string[]; suggestions: string[] } | undefined
	>(undefined);

	const fetchFeedback = async () => {
		if (!currentFlowProposalId) {
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const data = await feedbackApi.getFeedbackByFlow(currentFlowProposalId);
			setFeedbackItems(data.items);
		} catch {
			// non-fatal — show empty state
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void fetchFeedback();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentFlowProposalId]);

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

		try {
			await feedbackApi.submitFeedback(ticketId, body);
			showToast('Feedback submitted successfully', 'success');
			setOptimisticItem(null);
			void fetchFeedback();
			onFeedbackSubmitted?.();
		} catch (err) {
			// d fix: on error — remove optimistic card, restore form with entered values
			setOptimisticItem(null);
			setRestoredValues(values);
			setShowNewForm(feedbackItems.length > 0);
			showToast(`Failed to submit feedback: ${getErrorMessage(err)}`, 'error');
		}
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

	return (
		<div className="space-y-6 py-2">
			{/* Retrospective (shown when available, regardless of feedback state) */}
			{flowRetrospectiveId && (
				<div className="space-y-2">
					<RetrospectiveCard ticketId={ticketId} />
				</div>
			)}

			{/* d fix: optimistic pending card — shown while API call is in flight */}
			{optimisticItem && (
				<div className="relative opacity-60">
					<FeedbackCard item={optimisticItem} />
					<div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/40">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				</div>
			)}

			{/* Submitted feedback state */}
			{hasFeedback && !showNewForm && !optimisticItem && (
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Badge variant="success">Submitted</Badge>
							<span className="text-sm text-muted-foreground">
								Feedback has been submitted for this ticket.
							</span>
						</div>
						<Button variant="outline" size="sm" onClick={() => setShowNewForm(true)}>
							Add another feedback
						</Button>
					</div>
					<div className="space-y-3">
						{feedbackItems.map(item => (
							<FeedbackCard key={item.id} item={item} />
						))}
					</div>
				</div>
			)}

			{/* Feedback form — shown when no feedback yet, or when adding another */}
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
