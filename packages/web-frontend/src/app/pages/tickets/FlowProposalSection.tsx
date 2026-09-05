import { useEffect, useRef, useState } from 'react';

import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import { B2F_FLOW_PROPOSAL_UPDATED } from '@shared/transport';
import { Loader2 } from 'lucide-react';

import { useTransport } from '@/transport/useTransport';

import { ProposalView } from './ProposalView';
import { flowProposalsApi } from './flowProposalsApi';
import { useFlowProposals } from './useFlowProposals';

interface FlowProposalSectionProps {
	ticketId: string;
	onTicketRefresh?: () => void;
}

const redesigningBannerCls =
	'flex items-center gap-3 rounded-md border border-warning/50 bg-warning/10 px-4 py-3';

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
	const { proposals, currentProposal, isLoading, error, refresh, refreshSilent } = useFlowProposals(ticketId);
	const { showToast } = useToast();
	const { transport } = useTransport();

	const [context, setContext] = useState('');
	const [isRequesting, setIsRequesting] = useState(false);
	const [requestError, setRequestError] = useState<string | null>(null);
	const [isRedesigning, setIsRedesigning] = useState(false);
	const [currentQuestionAnswers, setCurrentQuestionAnswers] = useState<Record<number, string>>({});

	const proposalsSectionRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (isRedesigning) {
			proposalsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}, [isRedesigning]);

	useEffect(() => {
		const unsub = transport.subscribe(
			B2F_FLOW_PROPOSAL_UPDATED,
			() => {
				setIsRedesigning(false);
				refresh();
				onTicketRefresh?.();
			},
			{ ticketId }
		);
		return unsub;
	}, [ticketId, transport, refresh, onTicketRefresh]);

	const handleRequestDesign = async () => {
		setIsRequesting(true);
		try {
			const filledAnswers = currentProposal?.openQuestions
				?.map((question, i) => ({ question, answer: currentQuestionAnswers[i] ?? '' }))
				.filter(qa => qa.answer.trim());
			await flowProposalsApi.requestFlowDesign(
				ticketId,
				context || undefined,
				filledAnswers && filledAnswers.length > 0 ? filledAnswers : undefined
			);
			showToast('Flow design requested. AI is processing...', 'success');
			setContext('');
			setCurrentQuestionAnswers({});
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

	if (isLoading) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
				<Loader2 className="size-6 animate-spin" />
				<p className="text-sm">Loading...</p>
			</div>
		);
	}

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

	if (proposals.length === 0) {
		return (
			<div className="relative space-y-4 py-4">
				<div className={isRequesting ? 'pointer-events-none opacity-50' : undefined}>
					<p className="text-sm text-muted-foreground">
						No flow design has been requested yet for this ticket.
					</p>
					{requestError && (
						<div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
							<p className="text-sm font-medium text-destructive">Request failed</p>
							<p className="mt-1 whitespace-pre-wrap text-xs text-destructive/80">{requestError}</p>
						</div>
					)}
					<div className="mt-4 space-y-2">
						<Label htmlFor="context-input" className="text-sm font-medium">Additional context (optional)</Label>
						<Textarea
							value={context}
							onChange={e => { setContext(e.target.value); setRequestError(null); }}
							id="context-input"
							placeholder="Provide extra context or constraints for the AI flow designer..."
							className="text-sm"
						/>
					</div>
					<div className="mt-4">
						<Button onClick={handleRequestDesign} disabled={isRequesting}>Request Flow Design</Button>
					</div>
				</div>
				{isRequesting && (
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="flex flex-col items-center gap-2 text-muted-foreground">
							<Loader2 className="size-5 animate-spin" />
							<span className="text-sm">Requesting AI flow design...</span>
						</div>
					</div>
				)}
			</div>
		);
	}

	return (
		<div ref={proposalsSectionRef} className="space-y-6 py-2">
			{isRedesigning && (
				<div className={redesigningBannerCls}>
					<Loader2 className="size-4 shrink-0 animate-spin text-warning" />
					<p className="text-sm text-warning">Rejection submitted. AI is redesigning the flow...</p>
				</div>
			)}

			{currentProposal && (
				<ProposalView
					proposal={currentProposal}
					ticketId={ticketId}
					onRefresh={() => { refresh(); onTicketRefresh?.(); }}
					onReviewUpdated={() => { refreshSilent(); }}
					onRejected={() => { setIsRedesigning(true); }}
					onQuestionAnswersChange={setCurrentQuestionAnswers}
				/>
			)}

			{currentProposal && currentProposal.status !== 'pending_review' && !isRedesigning && (
				<div className="border-t pt-4 space-y-3">
					<Label htmlFor="new-design-context" className="text-sm font-medium">Request a new flow design</Label>
					<div className={isRequesting ? 'pointer-events-none opacity-50' : ''}>
						<Textarea
							value={context}
							onChange={e => setContext(e.target.value)}
							id="new-design-context"
							placeholder="Provide additional context or describe what to change..."
							className="text-sm"
						/>
					</div>
					<Button onClick={handleRequestDesign} disabled={isRequesting}>
						{isRequesting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
						Request new design
					</Button>
				</div>
			)}
		</div>
	);
}
