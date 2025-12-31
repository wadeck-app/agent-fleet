import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Label } from '@framework/components/forms/Label';
import { Textarea } from '@framework/components/forms/Textarea';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@framework/components/primitives/Card';
import type { Intervention } from '@shared/api/interventions.contract';
import { ArrowLeft } from 'lucide-react';

import { interventionsApi } from './interventions.api';

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

	const [intervention, setIntervention] = useState<Intervention | null>(null);
	const [loading, setLoading] = useState(true);
	const [comment, setComment] = useState('');
	const [submitting, setSubmitting] = useState(false);

	// Fetch intervention on mount
	useEffect(() => {
		if (!interventionId) return;

		const fetchIntervention = async () => {
			try {
				setLoading(true);
				const data = await interventionsApi.getIntervention(interventionId);
				setIntervention(data);
			} catch (error) {
				console.error('[InterventionDetailPage] Error fetching intervention:', error);
			} finally {
				setLoading(false);
			}
		};

		fetchIntervention();
	}, [interventionId]);

	const handleRespond = async (approved: boolean) => {
		if (!interventionId) return;

		setSubmitting(true);
		try {
			await interventionsApi.respondToIntervention(interventionId, {
				value: approved,
				comment: comment || undefined,
			});

			// Show success message
			alert(approved ? 'Approved!' : 'Rejected!');

			// Navigate back
			navigate('/interventions');
		} catch (error) {
			console.error('[InterventionDetailPage] Failed to submit response:', error);
			alert('Failed to submit response');
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<Page>
				<div className="text-center py-8">Loading...</div>
			</Page>
		);
	}

	if (!intervention) {
		return (
			<Page>
				<PageHeader title="Intervention Not Found" />
				<div className="text-center py-8">
					<p className="text-muted-foreground mb-4">The intervention you are looking for does not exist.</p>
					<Button onClick={() => navigate('/interventions')}>
						<ArrowLeft className="w-4 h-4 mr-2" />
						Back to Interventions
					</Button>
				</div>
			</Page>
		);
	}

	return (
		<Page>
			<PageHeader
				title="Intervention Required"
				action={
					<Button onClick={() => navigate('/interventions')} variant="outline" size="sm">
						<ArrowLeft className="w-4 h-4 mr-2" />
						Back to Interventions
					</Button>
				}
			/>

			<div className="max-w-4xl mx-auto space-y-6">
				<p className="text-sm text-muted-foreground">Intervention #{interventionId?.slice(0, 8)}</p>

				{/* Description */}
				<Card>
					<CardHeader>
						<CardTitle>Request Details</CardTitle>
					</CardHeader>
					<CardContent>
						<p>An agent is requesting your approval to proceed.</p>
						<p className="text-sm text-muted-foreground mt-2">
							TODO: Show intervention details (title, description, context)
						</p>
					</CardContent>
				</Card>

				{/* Context */}
				<Card>
					<CardHeader>
						<CardTitle>Context</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Intervention ID:</span>
								<span className="font-mono">{interventionId}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Task ID:</span>
								<span className="font-mono">task-123</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Created:</span>
								<span>Just now</span>
							</div>
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
