import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { useToast } from '@framework/features/toast/ToastContext';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { CreateFlowFeedback, FlowFeedback } from '@shared/api/flow-feedback.contract';
import { B2F_TICKET_FEEDBACK_SUBMITTED } from '@shared/transport';
import { Loader2 } from 'lucide-react';

import { useTransport } from '@/transport/useTransport';

import type { FeedbackItemWithOptimistic } from './FeedbackCard';
import { FeedbackCard } from './FeedbackCard';
import { FlowFeedbackForm } from './FlowFeedbackForm';
import { RetrospectiveCard } from './RetrospectiveCard';
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
	const [optimisticItem, setOptimisticItem] = useState<FlowFeedback | null>(null);
	const [restoredValues, setRestoredValues] = useState<
		{ rating: number; wentWell: string[]; wentWrong: string[]; suggestions: string[] } | undefined
	>(undefined);

	const expectedWsEvents = useRef(0);

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

		expectedWsEvents.current++;
		try {
			const created = await feedbackApi.submitFeedback(ticketId, body);
			showToast('Feedback submitted successfully', 'success');
			setOptimisticItem(null);
			setFeedbackItems(prev => [...prev, created]);
			onFeedbackSubmitted?.();
		} catch (err) {
			expectedWsEvents.current--;
			setOptimisticItem(null);
			setRestoredValues(values);
			setShowNewForm(feedbackItems.length > 0);
			showToast(`Failed to submit feedback: ${getErrorMessage(err)}`, 'error');
		}
	};

	const handleOptimisticUpdate = (updated: FeedbackItemWithOptimistic) => {
		setFeedbackItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
	};

	const handleSaveSuccess = (updated: FlowFeedback) => {
		setFeedbackItems(prev => prev.map(item => (item.id === updated.id ? { ...updated } : item)));
	};

	const handleSaveError = (originalItem: FlowFeedback) => {
		setFeedbackItems(prev => prev.map(item => (item.id === originalItem.id ? { ...originalItem } : item)));
	};

	const handleOptimisticDelete = (feedbackId: string) => {
		setFeedbackItems(prev => prev.map(item => (item.id === feedbackId ? { ...item, isDeleting: true } : item)));
	};

	const handleDeleteSuccess = (feedbackId: string) => {
		setFeedbackItems(prev => prev.filter(item => item.id !== feedbackId));
	};

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
	const showForm = (!hasFeedback || showNewForm) && !optimisticItem;

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

			{/* Optimistic pending card -- shown while API call is in flight */}
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

			{/* List of submitted feedback items */}
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

			{/* Feedback form */}
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
