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
	/** If set, feedback was already submitted */
	flowFeedbackId?: string;
	/** If set, a retrospective exists */
	flowRetrospectiveId?: string;
	/** The current flow proposal ID — used as flowId in the feedback body */
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
// FlowFeedbackForm — submits new feedback
// ---------------------------------------------------------------------------

interface FlowFeedbackFormProps {
	ticketId: string;
	currentFlowProposalId?: string;
	onSubmitted: () => void;
	/** Optional cancel handler — shown only when a previous feedback already exists */
	onCancel?: () => void;
}

function FlowFeedbackForm({ ticketId, currentFlowProposalId, onSubmitted, onCancel }: FlowFeedbackFormProps) {
	const { showToast } = useToast();
	const [rating, setRating] = useState(0);
	const [wentWell, setWentWell] = useState<string[]>([]);
	const [wentWrong, setWentWrong] = useState<string[]>([]);
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const canSubmit = rating >= 1 && !isSubmitting;

	const handleSubmit = async () => {
		if (!canSubmit) return;

		const body: CreateFlowFeedback = {
			ticketId,
			flowId: currentFlowProposalId ?? '',
			taskId: '',
			rating,
			wentWell,
			wentWrong,
			suggestions: suggestions.length > 0 ? suggestions : undefined,
			author: 'user',
		};

		setIsSubmitting(true);
		try {
			await feedbackApi.submitFeedback(ticketId, body);
			showToast('Feedback submitted successfully', 'success');
			onSubmitted();
		} catch (err) {
			showToast(`Failed to submit feedback: ${getErrorMessage(err)}`, 'error');
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
// SubmittedFeedbackCard — fetches and displays submitted feedback (z fix)
// ---------------------------------------------------------------------------

interface SubmittedFeedbackCardProps {
	/** The flow proposal ID used to fetch feedback items */
	flowId: string;
}

function SubmittedFeedbackCard({ flowId }: SubmittedFeedbackCardProps) {
	const [feedbackItems, setFeedbackItems] = useState<FlowFeedback[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);

		feedbackApi
			.getFeedbackByFlow(flowId)
			.then(data => {
				if (!cancelled) {
					setFeedbackItems(data.items);
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
	}, [flowId]);

	if (isLoading) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Loading...</p>
			</div>
		);
	}

	if (error) {
		return <p className="text-sm text-muted-foreground">Could not load submitted feedback: {error}</p>;
	}

	if (feedbackItems.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3">
			{feedbackItems.map(item => (
				<div key={item.id} className="rounded-md border bg-card p-4 space-y-3">
					{/* Rating */}
					<div className="flex items-center gap-2">
						<div className="flex gap-0.5">
							{[1, 2, 3, 4, 5].map(n => (
								<Star
									key={n}
									className={`size-4 fill-current ${n <= item.rating ? 'text-warning' : 'text-muted-foreground/20'}`}
								/>
							))}
						</div>
						<span className="text-xs text-muted-foreground">
							{new Date(item.submittedAt).toLocaleString()}
						</span>
					</div>

					{/* What went well */}
					{item.wentWell.length > 0 && (
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground tracking-wide">What went well</p>
							<ul className="list-disc list-inside space-y-0.5">
								{item.wentWell.map((w, i) => (
									<li key={i} className="text-sm">
										{w}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* What went wrong */}
					{item.wentWrong.length > 0 && (
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground tracking-wide">What went wrong</p>
							<ul className="list-disc list-inside space-y-0.5">
								{item.wentWrong.map((w, i) => (
									<li key={i} className="text-sm">
										{w}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Suggestions */}
					{item.suggestions && item.suggestions.length > 0 && (
						<div className="space-y-1">
							<p className="text-xs font-medium text-muted-foreground tracking-wide">Suggestions</p>
							<ul className="list-disc list-inside space-y-0.5">
								{item.suggestions.map((s, i) => (
									<li key={i} className="text-sm">
										{s}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			))}
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
	flowFeedbackId,
	flowRetrospectiveId,
	currentFlowProposalId,
	onFeedbackSubmitted,
}: FlowFeedbackSectionProps) {
	const [showNewForm, setShowNewForm] = useState(false);

	return (
		<div className="space-y-6 py-2">
			{/* Retrospective (shown when available, regardless of feedback state) */}
			{flowRetrospectiveId && (
				<div className="space-y-2">
					<RetrospectiveCard ticketId={ticketId} />
				</div>
			)}

			{/* Submitted feedback state — displayed when feedback exists and not adding new (z fix) */}
			{flowFeedbackId && !showNewForm && (
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
					{/* Show submitted feedback content when flowId is available (z fix) */}
					{currentFlowProposalId && <SubmittedFeedbackCard flowId={currentFlowProposalId} />}
				</div>
			)}

			{/* Feedback form — shown when no feedback yet, or when adding another */}
			{(!flowFeedbackId || showNewForm) && (
				<FlowFeedbackForm
					ticketId={ticketId}
					currentFlowProposalId={currentFlowProposalId}
					onSubmitted={() => {
						setShowNewForm(false);
						onFeedbackSubmitted?.();
					}}
					// Pass cancel only when re-adding (a previous feedback already exists) — y1 fix
					onCancel={flowFeedbackId ? () => setShowNewForm(false) : undefined}
				/>
			)}
		</div>
	);
}
