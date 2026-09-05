import { useEffect, useRef, useState } from 'react';

import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@framework/components/primitives/Tooltip';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FlowProposal, FlowProposalStatus } from '@shared/api/flow-proposals.contract';
import * as yaml from 'js-yaml';
import { Loader2 } from 'lucide-react';

import { CollapsibleSection } from './CollapsibleSection';
import { AddReviewThreadForm } from './AddReviewThreadForm';
import { ReviewThreadItem } from './ReviewThreadItem';
import { VisualizeFlowDialog } from './VisualizeFlowDialog';
import { flowProposalsApi } from './flowProposalsApi';

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

interface ProposalViewProps {
	proposal: FlowProposal;
	ticketId: string;
	onRefresh: () => void;
	onReviewUpdated: () => void;
	/** Called after successful rejection so the parent can show the redesigning banner */
	onRejected: () => void;
	/** Answers filled in the "Questions from the AI" section -- forwarded to the parent for re-design context */
	onQuestionAnswersChange: (answers: Record<number, string>) => void;
}

export function ProposalView({
	proposal,
	ticketId,
	onRefresh,
	onReviewUpdated,
	onRejected,
	onQuestionAnswersChange,
}: ProposalViewProps) {
	const { showToast } = useToast();
	const [showAddThread, setShowAddThread] = useState(false);
	const [rejectReason, setRejectReason] = useState('');
	const [showRejectForm, setShowRejectForm] = useState(false);
	const [isApproving, setIsApproving] = useState(false);
	const [isRejecting, setIsRejecting] = useState(false);
	const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});
	const rejectFormRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (showRejectForm) {
			rejectFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	}, [showRejectForm]);

	const handleAnswerChange = (index: number, value: string) => {
		const updated = { ...questionAnswers, [index]: value };
		setQuestionAnswers(updated);
		onQuestionAnswersChange(updated);
	};

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
			showToast('Proposal rejected. AI is redesigning...', 'success');
			setShowRejectForm(false);
			setRejectReason('');
			onRejected();
		} catch (err) {
			showToast(`Failed to reject: ${getErrorMessage(err)}`, 'error');
		} finally {
			setIsRejecting(false);
		}
	};

	const handleToggleRejectForm = () => {
		setShowRejectForm(true);
		const filledAnswers = Object.entries(questionAnswers)
			.filter(([, answer]) => answer.trim())
			.map(([idxStr, answer]) => {
				const idx = parseInt(idxStr, 10);
				const question = proposal.openQuestions?.[idx] ?? `Question ${idx + 1}`;
				return `Q: ${question}\nA: ${answer}`;
			});
		if (filledAnswers.length > 0) {
			setRejectReason(`Answers to AI questions:\n${filledAnswers.join('\n\n')}\n\n`);
		}
	};

	const isPendingReview = proposal.status === 'pending_review';
	const isTerminal = proposal.status === 'approved' || proposal.status === 'rejected';
	const reasoningSentences = proposal.reasoning.split(/\.\s+|\n/).filter(s => s.trim());
	const proposedFlowId =
		typeof proposal.proposedFlow['id'] === 'string' ? (proposal.proposedFlow['id'] as string) : null;
	const openQuestions = proposal.openQuestions ?? [];

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant="outline" className="font-mono text-xs">v{proposal.version}</Badge>
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

			{proposal.adaptations && proposal.adaptations.length > 0 && proposal.version > 1 && (
				<div className="space-y-1">
					<p className="text-xs font-medium text-muted-foreground tracking-wide">Adaptations</p>
					<ul className="list-disc list-inside space-y-0.5">
						{proposal.adaptations.map((a, i) => <li key={i} className="text-sm">{a}</li>)}
					</ul>
				</div>
			)}

			{openQuestions.length > 0 && (
				<CollapsibleSection
					title="Questions from the AI"
					defaultOpen={false}
					headerRight={
						<span className="text-xs font-normal text-muted-foreground">
							{openQuestions.length} question{openQuestions.length !== 1 ? 's' : ''}
						</span>
					}
				>
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							The AI raised these questions about the requirements. Answering them will improve the next
							design. Answers are automatically included when you reject the proposal.
						</p>
						{openQuestions.map((question, i) => (
							<div key={i} className="space-y-1">
								<Label htmlFor={`question-answer-${i}`} className="text-sm font-medium">{question}</Label>
								<Textarea
									id={`question-answer-${i}`}
									value={questionAnswers[i] ?? ''}
									onChange={e => handleAnswerChange(i, e.target.value)}
									placeholder="Your answer (optional)..."
									className="text-sm"
									rows={2}
								/>
							</div>
						))}
					</div>
				</CollapsibleSection>
			)}

			<CollapsibleSection title="Reasoning" defaultOpen={false}>
				{reasoningSentences.length > 1 ? (
					<ul className="list-disc list-inside space-y-1">
						{reasoningSentences.map((sentence, i) => <li key={i} className="text-sm">{sentence.trim().replace(/\.$/, '')}</li>)}
					</ul>
				) : (
					<p className="text-sm whitespace-pre-wrap">{proposal.reasoning}</p>
				)}
			</CollapsibleSection>

			<CollapsibleSection
				title="Proposed flow"
				defaultOpen={false}
				headerRight={
					proposal.status === 'approved' && proposedFlowId ? (
						<a href={`/flows/${proposedFlowId}/edit`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
							Open in Flow Editor
						</a>
					) : (
						<VisualizeFlowDialog proposal={proposal} />
					)
				}
			>
				<pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs font-mono leading-relaxed">{proposalYaml}</pre>
			</CollapsibleSection>

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
							onDeleted={onReviewUpdated}
							onUpdated={onReviewUpdated}
						/>
					))}
				</div>
			)}

			{isPendingReview && (
				<div className="space-y-2">
					{showAddThread ? (
						<AddReviewThreadForm
							ticketId={ticketId}
							proposalId={proposal.id}
							onAdded={() => { setShowAddThread(false); onReviewUpdated(); }}
							onCancel={() => setShowAddThread(false)}
						/>
					) : (
						<Button variant="outline" size="sm" onClick={() => setShowAddThread(true)}>Add review thread</Button>
					)}
				</div>
			)}

			{isPendingReview && (
				<div className="flex flex-wrap items-start gap-3 border-t pt-4">
					<Button onClick={handleApprove} disabled={isApproving || isRejecting} variant="default">
						{isApproving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Approve
					</Button>
					<Button variant="destructive" onClick={handleToggleRejectForm} disabled={isApproving || isRejecting || showRejectForm}>
						Reject...
					</Button>
					{showRejectForm && (
						<div ref={rejectFormRef} className="w-full space-y-2">
							<Label htmlFor="reject-reason" className="text-sm font-medium">Rejection reason</Label>
							<Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} id="reject-reason" placeholder="Reason for rejection (optional)..." className="text-sm" />
							<div className="flex gap-2">
								<Button variant="destructive" onClick={handleReject} disabled={isRejecting}>
									{isRejecting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
									Confirm rejection
								</Button>
								<Button variant="outline" onClick={() => { setShowRejectForm(false); setRejectReason(''); }} disabled={isRejecting}>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</div>
			)}

			{isTerminal && (
				<div className="border-t pt-4">
					<p className="text-sm text-muted-foreground">
						{proposal.status === 'approved'
							? `Approved at ${proposal.approvedAt ? new Date(proposal.approvedAt).toLocaleString() : 'unknown date'}`
							: `Rejected at ${proposal.rejectedAt ? new Date(proposal.rejectedAt).toLocaleString() : 'unknown date'}`}
					</p>
				</div>
			)}
		</div>
	);
}
