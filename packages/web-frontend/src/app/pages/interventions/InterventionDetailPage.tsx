import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ContextRow } from '@framework/components/data/ContextRow';
import { EmptyState } from '@framework/components/feedback/EmptyState';
import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import { useToast } from '@framework/features/toast/ToastContext';
import { useErrorToast } from '@framework/hooks/useErrorToast';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import { ArrowLeft } from 'lucide-react';

import { useInterventionDetail } from '@app/hooks/useInterventionDetail';

import { getInterventionStatusVariant, getInterventionTypeVariant } from './interventions.helpers';

/**
 * ===========================================================================================
 * INTERVENTION DETAIL PAGE
 * ===========================================================================================
 *
 * Full-page view for responding to a single intervention.
 * Supports:
 * - Approval/Reject (MVP)
 * - Optional comment
 *
 * Future: Questions and Choices
 *
 * ===========================================================================================
 */

export function InterventionDetailPage() {
	const { interventionId } = useParams<{ interventionId: string }>();
	const navigate = useNavigate();
	const { showToast } = useToast();
	const [comment, setComment] = useState('');

	// Use custom hook for data management
	const { intervention, loading, error, submitting, submitResponse, clearError } = useInterventionDetail({
		interventionId,
		onSuccess: () => navigate('/interventions-v2'),
		onError: errorMessage => showToast(errorMessage, 'error'),
	});

	// Display errors as toasts
	useErrorToast({ error, clearError });

	const handleRespond = async (approved: boolean) => {
		await submitResponse(approved, comment);

		// Show success toast only if no error occurred
		if (!error) {
			showToast(
				approved ? 'Intervention approved successfully' : 'Intervention rejected successfully',
				'success'
			);
		}
	};

	if (loading) {
		return (
			<Page>
				<PageHeader title="Loading Intervention..." />
				<LoadingState message="Loading intervention details..." />
			</Page>
		);
	}

	if (!intervention) {
		return (
			<Page>
				<PageHeader title="Intervention Not Found" />
				<EmptyState
					title="Intervention Not Found"
					description="The intervention you are looking for does not exist or has been removed."
				/>
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title="Intervention Required"
				action={
					<Button onClick={() => navigate('/interventions-v2')} variant="outline" size="sm">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Interventions
					</Button>
				}
			/>

			<div className="mx-auto max-w-4xl space-y-6">
				<div className="flex items-center gap-3">
					<Badge variant="outline" className="font-mono text-xs">
						#{interventionId?.slice(0, 8)}
					</Badge>
					<Badge variant={getInterventionStatusVariant(intervention.status)}>{intervention.status}</Badge>
					<Badge variant={getInterventionTypeVariant(intervention.type)} className={`capitalize`}>
						{intervention.type}
					</Badge>
				</div>

				{/* Description */}
				<Card>
					<CardHeader>
						<CardTitle>{intervention.config?.title || 'Intervention Required'}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						{intervention.config?.description && (
							<div className="text-sm text-foreground">{intervention.config.description}</div>
						)}
						{intervention.config?.question && (
							<Card className="bg-muted">
								<CardContent className="py-3">
									<div className="text-sm font-medium">{intervention.config.question}</div>
								</CardContent>
							</Card>
						)}
						{intervention.config?.options && intervention.config.options.length > 0 && (
							<Card>
								<CardHeader>
									<Label className="text-xs">Available options</Label>
								</CardHeader>
								<CardContent>
									<div className="space-y-2">
										{intervention.config.options.map((option, idx) => (
											<div key={idx} className="flex items-start gap-2">
												<Badge variant="secondary" className="mt-0.5">
													{idx + 1}
												</Badge>
												<div className="text-sm">
													{typeof option === 'string' ? option : JSON.stringify(option)}
												</div>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}
					</CardContent>
				</Card>

				{/* Context */}
				<Card>
					<CardHeader>
						<CardTitle>Context</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							<ContextRow
								label="Intervention ID"
								value={
									<Badge variant="outline" className="font-mono text-xs">
										{interventionId}
									</Badge>
								}
							/>
							<ContextRow
								label="Task ID"
								value={
									intervention.taskId ? (
										<Link to={`/tasks/${intervention.taskId}/logs-stacked`}>
											<Badge
												variant="outline"
												className={`
              cursor-pointer font-mono text-xs
              hover:bg-accent
            `}
											>
												{intervention.taskId}
											</Badge>
										</Link>
									) : (
										<Badge variant="outline" className={`font-mono text-xs text-muted-foreground`}>
											-
										</Badge>
									)
								}
							/>
							<ContextRow label="Type" value={<Badge variant="secondary">{intervention.type}</Badge>} />
							<ContextRow
								label="Blocking"
								value={
									<Badge variant={intervention.blocking ? 'destructive' : 'secondary'}>
										{intervention.blocking ? 'Yes' : 'No'}
									</Badge>
								}
							/>
							<ContextRow
								label="Created"
								value={
									<Badge
										variant="outline"
										className="text-xs"
										title={new Date(intervention.createdAt).toISOString()}
									>
										{formatRelativeTime(intervention.createdAt)}
									</Badge>
								}
								showBorder={false}
							/>
						</div>
					</CardContent>
				</Card>

				{/* Response Form - MVP: Simple Approve/Reject */}
				<Card>
					<CardHeader>
						<CardTitle>Your Response</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Comment (optional) */}
						<div>
							<Label htmlFor="comment">Comment (optional)</Label>
							<Textarea
								id="comment"
								value={comment}
								onChange={e => setComment(e.target.value)}
								placeholder="Add a comment..."
								rows={4}
								className="mt-1"
							/>
						</div>

						{/* Actions */}
						<div className="flex gap-3">
							<Button
								onClick={() => handleRespond(true)}
								disabled={submitting}
								className="flex-1"
								size="lg"
							>
								✅ Approve
							</Button>
							<Button
								onClick={() => handleRespond(false)}
								disabled={submitting}
								variant="destructive"
								className="flex-1"
								size="lg"
							>
								❌ Reject
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</Page>
	);
}
