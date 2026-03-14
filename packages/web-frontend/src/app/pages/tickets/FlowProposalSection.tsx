import { useEffect, useRef, useState } from 'react';

import { Input } from '@framework/components/forms/Input';
import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FlowProposal, FlowProposalStatus, FlowReviewThread } from '@shared/api/flow-proposals.contract';
import * as yaml from 'js-yaml';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

import { flowProposalsApi } from './flowProposalsApi';
import { useFlowProposals } from './useFlowProposals';

interface FlowProposalSectionProps {
	ticketId: string;
	onTicketRefresh?: () => void;
}

function getStatusBadgeVariant(status: FlowProposalStatus): 'warning' | 'success' | 'destructive' | 'secondary' {
	switch (status) {
		case 'pending_review':
			return 'warning';
		case 'approved':
			return 'success';
		case 'rejected':
			return 'destructive';
		case 'superseded':
			return 'secondary';
	}
}

function getStatusLabel(status: FlowProposalStatus): string {
	switch (status) {
		case 'pending_review':
			return 'Pending Review';
		case 'approved':
			return 'Approved';
		case 'rejected':
			return 'Rejected';
		case 'superseded':
			return 'Superseded';
	}
}

interface ReviewThreadItemProps {
	thread: FlowReviewThread;
	ticketId: string;
	proposalId: string;
	onResolved: () => void;
}

function ReviewThreadItem({ thread, ticketId, proposalId, onResolved }: ReviewThreadItemProps) {
	const { showToast } = useToast();
	const [replyText, setReplyText] = useState('');
	const [showReplyForm, setShowReplyForm] = useState(false);
	const [isReplying, setIsReplying] = useState(false);
	const [isResolving, setIsResolving] = useState(false);

	const handleReply = async () => {
		if (!replyText.trim()) return;
		setIsReplying(true);
		try {
			await flowProposalsApi.addReviewComment(ticketId, proposalId, thread.id, {
				content: replyText.trim(),
			});
			setReplyText('');
			setShowReplyForm(false);
			onResolved();
			showToast('Reply added', 'success');
		} catch (err) {
			showToast(`Failed to add reply: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsReplying(false);
		}
	};

	const handleResolve = async () => {
		setIsResolving(true);
		try {
			await flowProposalsApi.resolveReviewThread(ticketId, proposalId, thread.id);
			onResolved();
			showToast('Thread resolved', 'success');
		} catch (err) {
			showToast(`Failed to resolve thread: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsResolving(false);
		}
	};

	return (
		<div className="rounded-md border bg-card p-3 space-y-2">
			<div className="flex items-center gap-2">
				<span className="font-mono text-xs text-muted-foreground">
					Lines {thread.selector.startLine}–{thread.selector.endLine}
				</span>
				<Badge variant={thread.status === 'open' ? 'warning' : 'success'} className="text-xs">
					{thread.status}
				</Badge>
				{thread.selector.selectedText && (
					<code className="ml-auto max-w-[200px] truncate rounded bg-muted px-1 py-0.5 font-mono text-xs">
						{thread.selector.selectedText}
					</code>
				)}
			</div>

			<div className="space-y-2">
				{thread.comments.map(comment => (
					<div key={comment.id} className="rounded border-l-2 border-muted-foreground/30 pl-3">
						<div className="flex items-center gap-2 mb-1">
							<Badge variant="outline" className="text-xs">
								{comment.author}
							</Badge>
							<span className="text-xs text-muted-foreground">
								{new Date(comment.createdAt).toLocaleString()}
							</span>
						</div>
						<p className="text-sm">{comment.content}</p>
					</div>
				))}
			</div>

			<div className="flex items-center gap-2">
				{thread.status === 'open' && (
					<>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setShowReplyForm(v => !v)}
							disabled={isReplying || isResolving}
						>
							Add reply
						</Button>
						<Button variant="ghost" size="sm" onClick={handleResolve} disabled={isResolving || isReplying}>
							{isResolving ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
							Resolve
						</Button>
					</>
				)}
			</div>

			{showReplyForm && (
				<div className="space-y-2">
					<Textarea
						value={replyText}
						onChange={e => setReplyText(e.target.value)}
						placeholder="Write a reply..."
						className="text-sm"
					/>
					<div className="flex gap-2">
						<Button size="sm" onClick={handleReply} disabled={isReplying || !replyText.trim()}>
							{isReplying ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
							Submit reply
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setShowReplyForm(false);
								setReplyText('');
							}}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

interface AddReviewThreadFormProps {
	ticketId: string;
	proposalId: string;
	onAdded: () => void;
	onCancel: () => void;
}

function AddReviewThreadForm({ ticketId, proposalId, onAdded, onCancel }: AddReviewThreadFormProps) {
	const { showToast } = useToast();
	const [startLine, setStartLine] = useState('');
	const [endLine, setEndLine] = useState('');
	const [comment, setComment] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async () => {
		const start = parseInt(startLine, 10);
		const end = parseInt(endLine, 10);
		if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
			showToast('Please enter valid line numbers (start ≤ end, both ≥ 1)', 'error');
			return;
		}
		if (!comment.trim()) {
			showToast('Comment cannot be empty', 'error');
			return;
		}

		setIsSubmitting(true);
		try {
			await flowProposalsApi.createReviewThread(ticketId, proposalId, {
				selector: { startLine: start, endLine: end },
				comment: comment.trim(),
			});
			onAdded();
			showToast('Review thread added', 'success');
		} catch (err) {
			showToast(`Failed to add review thread: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="rounded-md border bg-card p-4 space-y-3">
			<p className="text-sm font-medium">Add review thread</p>
			<div className="flex gap-2">
				<div className="flex-1 space-y-1">
					<Label className="text-xs text-muted-foreground">Start line</Label>
					<Input
						type="number"
						min={1}
						value={startLine}
						onChange={e => setStartLine(e.target.value)}
						placeholder="1"
					/>
				</div>
				<div className="flex-1 space-y-1">
					<Label className="text-xs text-muted-foreground">End line</Label>
					<Input
						type="number"
						min={1}
						value={endLine}
						onChange={e => setEndLine(e.target.value)}
						placeholder="1"
					/>
				</div>
			</div>
			<Textarea
				value={comment}
				onChange={e => setComment(e.target.value)}
				placeholder="Write your review comment..."
				className="text-sm"
			/>
			<div className="flex gap-2">
				<Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
					{isSubmitting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
					Add thread
				</Button>
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	);
}

interface ProposalViewProps {
	proposal: FlowProposal;
	ticketId: string;
	onRefresh: () => void;
	onReviewUpdated: () => void;
	onRequestNew: () => void;
}

function ProposalView({ proposal, ticketId, onRefresh, onReviewUpdated, onRequestNew }: ProposalViewProps) {
	const { showToast } = useToast();
	const [reasoningOpen, setReasoningOpen] = useState(false);
	const [showAddThread, setShowAddThread] = useState(false);
	const [rejectReason, setRejectReason] = useState('');
	const [showRejectForm, setShowRejectForm] = useState(false);
	const [isApproving, setIsApproving] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);
	const rejectFormRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (showRejectForm) {
			rejectFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}, [showRejectForm]);

	const proposalYaml = yaml.dump(proposal.proposedFlow, { indent: 2, lineWidth: 120 });

	const handleApprove = async () => {
		setIsApproving(true);
		try {
			await flowProposalsApi.approveProposal(ticketId, proposal.id);
			showToast('Proposal approved', 'success');
			onRefresh();
		} catch (err) {
			showToast(`Failed to approve: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsApproving(false);
		}
	};

	const handleReject = async () => {
		setIsRejecting(true);
		try {
			await flowProposalsApi.rejectProposal(ticketId, proposal.id, rejectReason || undefined);
			showToast('Proposal rejected', 'success');
			setShowRejectForm(false);
			setRejectReason('');
			onRefresh();
		} catch (err) {
			showToast(`Failed to reject: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsRejecting(false);
		}
	};

	const isPendingReview = proposal.status === 'pending_review';
	const isTerminal = proposal.status === 'approved' || proposal.status === 'rejected';

	const reasoningSentences = proposal.reasoning.split(/\.\s+|\n/).filter(s => s.trim());

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline" className="font-mono text-xs">
					v{proposal.version}
				</Badge>
				<Badge variant={getStatusBadgeVariant(proposal.status)}>{getStatusLabel(proposal.status)}</Badge>
				{proposal.confidenceScore !== undefined && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="cursor-help text-sm text-muted-foreground underline decoration-dotted">
									Confidence: {Math.round(proposal.confidenceScore)}%
								</span>
							</TooltipTrigger>
							<TooltipContent className="max-w-[300px] text-xs">
								<p>
									Confidence reflects how well the flow agent understood the ticket requirements.
									Below 90% typically means: missing details in the ticket description, ambiguous
									requirements, or open questions the agent could not resolve.
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
				<span className="ml-auto text-xs text-muted-foreground">
					Proposed {new Date(proposal.proposedAt).toLocaleString()}
				</span>
			</div>

			{/* Adaptations */}
			{proposal.adaptations && proposal.adaptations.length > 0 && (
				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground tracking-wide">Adaptations</p>
					<ul className="list-disc list-inside space-y-0.5">
						{proposal.adaptations.map((a, i) => (
							<li key={i} className="text-sm">
								{a}
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Reasoning collapsible */}
			<div className="rounded-md border">
				<Button
					type="button"
					variant="ghost"
					onClick={() => setReasoningOpen(v => !v)}
					className="flex w-full items-center justify-start gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50"
				>
					{reasoningOpen ? (
						<ChevronDown className="size-4 shrink-0" />
					) : (
						<ChevronRight className="size-4 shrink-0" />
					)}
					Reasoning
				</Button>
				{reasoningOpen && (
					<div className="border-t px-3 py-3">
						{reasoningSentences.length > 1 ? (
							<ul className="list-disc list-inside space-y-1">
								{reasoningSentences.map((sentence, i) => (
									<li key={i} className="text-sm">
										{sentence.trim().replace(/\.$/, '')}
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm whitespace-pre-wrap">{proposal.reasoning}</p>
						)}
					</div>
				)}
			</div>

			{/* Flow YAML */}
			<div className="space-y-1">
				<p className="text-xs font-medium text-muted-foreground tracking-wide">Proposed flow</p>
				<pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs font-mono leading-relaxed">
					{proposalYaml}
				</pre>
			</div>

			{/* Review threads */}
			{proposal.reviewThreads.length > 0 && (
				<div className="space-y-2">
					<p className="text-xs font-medium text-muted-foreground tracking-wide">
						Review threads ({proposal.reviewThreads.length})
					</p>
					{proposal.reviewThreads.map(thread => (
						<ReviewThreadItem
							key={thread.id}
							thread={thread}
							ticketId={ticketId}
							proposalId={proposal.id}
							onResolved={onReviewUpdated}
						/>
					))}
				</div>
			)}

			{/* Add review thread */}
			{isPendingReview && (
				<div className="space-y-2">
					{showAddThread ? (
						<AddReviewThreadForm
							ticketId={ticketId}
							proposalId={proposal.id}
							onAdded={() => {
								setShowAddThread(false);
								onReviewUpdated();
							}}
							onCancel={() => setShowAddThread(false)}
						/>
					) : (
						<Button variant="outline" size="sm" onClick={() => setShowAddThread(true)}>
							Add review thread
						</Button>
					)}
				</div>
			)}

			{/* Actions for pending_review */}
			{isPendingReview && (
				<div className="flex flex-wrap items-start gap-3 border-t pt-4">
					<Button onClick={handleApprove} disabled={isApproving || isRejecting} variant="default">
						{isApproving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Approve
					</Button>

					{showRejectForm ? (
						<div ref={rejectFormRef} className="flex-1 space-y-2">
							<Label className="text-sm font-medium">Rejection reason</Label>
							<Textarea
								value={rejectReason}
								onChange={e => setRejectReason(e.target.value)}
								placeholder="Reason for rejection (optional)..."
								className="text-sm"
							/>
							<div className="flex gap-2">
								<Button variant="destructive" size="sm" onClick={handleReject} disabled={isRejecting}>
									{isRejecting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
									Confirm rejection
								</Button>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setShowRejectForm(false);
										setRejectReason('');
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					) : (
						<Button
							variant="outline"
							onClick={() => setShowRejectForm(true)}
							disabled={isApproving || isRejecting}
							className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
						>
							Reject ▾
						</Button>
					)}
				</div>
			)}

			{/* Terminal state: show option to request new design */}
			{isTerminal && (
				<div className="flex items-center gap-3 border-t pt-4">
					<p className="text-sm text-muted-foreground">
						{proposal.status === 'approved'
							? `Approved at ${proposal.approvedAt ? new Date(proposal.approvedAt).toLocaleString() : '—'}`
							: `Rejected at ${proposal.rejectedAt ? new Date(proposal.rejectedAt).toLocaleString() : '—'}`}
					</p>
					<Button variant="outline" size="sm" onClick={onRequestNew}>
						Request new design
					</Button>
				</div>
			)}
		</div>
	);
}

/**
 * ===========================================================================================
 * FLOW PROPOSAL SECTION
 * ===========================================================================================
 *
 * Main section component rendered inside the "Flow Design" tab of TicketDetailLayoutG.
 * Manages the full lifecycle of flow proposals: request, view, review, approve/reject.
 *
 * ===========================================================================================
 */
export function FlowProposalSection({ ticketId, onTicketRefresh }: FlowProposalSectionProps) {
	const { proposals, currentProposal, isLoading, error, refresh } = useFlowProposals(ticketId);
	const { showToast } = useToast();

	const [context, setContext] = useState('');
	const [isRequesting, setIsRequesting] = useState(false);
	const [requestError, setRequestError] = useState<string | null>(null);

	const handleRequestDesign = async () => {
		setIsRequesting(true);
		try {
			await flowProposalsApi.requestFlowDesign(ticketId, context || undefined);
			showToast('Flow design requested — AI is processing...', 'success');
			setContext('');
			setRequestError(null);
			refresh();
		} catch (err) {
			const msg = getErrorMessage(err);
			showToast(`Failed to request flow design: ${msg}`, 'error');
			setRequestError(msg);
		} finally {
			setIsRequesting(false);
		}
	};

	// Loading state
	if (isLoading) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Loading...</p>
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="py-4">
				<p className="text-sm text-destructive">Failed to load proposals: {error.message}</p>
				<Button variant="outline" size="sm" onClick={refresh} className="mt-2">
					Retry
				</Button>
			</div>
		);
	}

	// Requesting state (shown while the AI call is in progress after click)
	if (isRequesting) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Requesting AI flow design...</p>
			</div>
		);
	}

	// No proposals yet — show request form
	if (proposals.length === 0) {
		return (
			<div className="space-y-4 py-4">
				<p className="text-sm text-muted-foreground">No flow design has been requested yet for this ticket.</p>
				{requestError && (
					<div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
						<p className="text-sm font-medium text-destructive">Request failed</p>
						<p className="mt-1 whitespace-pre-wrap text-xs text-destructive/80">{requestError}</p>
					</div>
				)}
				<div className="space-y-2">
					<Label className="text-sm font-medium">Additional context (optional)</Label>
					<Textarea
						value={context}
						onChange={e => {
							setContext(e.target.value);
							setRequestError(null);
						}}
						placeholder="Provide extra context or constraints for the AI flow designer..."
						className="text-sm"
					/>
				</div>
				<Button onClick={handleRequestDesign}>Request Flow Design</Button>
			</div>
		);
	}

	// Has proposal — render the current one with option to request a new one
	return (
		<div className="space-y-6 py-2">
			{currentProposal && (
				<ProposalView
					proposal={currentProposal}
					ticketId={ticketId}
					onRefresh={() => {
						refresh();
						onTicketRefresh?.();
					}}
					onReviewUpdated={() => {
						// Re-fetch proposals without triggering parent ticket refresh
						refresh();
					}}
					onRequestNew={() => {
						setContext('');
					}}
				/>
			)}

			{/* Request a new design (only when not pending_review) */}
			{currentProposal && currentProposal.status !== 'pending_review' && (
				<div className="border-t pt-4 space-y-3">
					<p className="text-sm font-medium">Request a new flow design</p>
					<Textarea
						value={context}
						onChange={e => setContext(e.target.value)}
						placeholder="Provide additional context or describe what to change..."
						className="text-sm"
					/>
					<Button onClick={handleRequestDesign} disabled={isRequesting}>
						{isRequesting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Request new design
					</Button>
				</div>
			)}
		</div>
	);
}
