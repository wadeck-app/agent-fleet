import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@framework/components/feedback/EmptyState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Badge } from '@framework/components/primitives/Badge';
import { Card, CardContent } from '@framework/components/primitives/Card';
import type { Intervention } from '@shared/api/interventions.contract';
import { Bell } from 'lucide-react';

import { interventionsApi } from './interventions.api';

/**
 * ===========================================================================================
 * INTERVENTIONS PAGE - User Interventions Inbox
 * ===========================================================================================
 *
 * Displays list of pending user interventions from agents/workers:
 * - Approval requests
 * - Questions requiring answers
 * - Choices between options
 *
 * Features:
 * - List view with conversational style
 * - Real-time updates (TODO: wire up transport)
 * - Navigate to detail page for responding
 *
 * ===========================================================================================
 */

export function InterventionsPage() {
	const [interventions, setInterventions] = useState<Intervention[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Fetch interventions on mount
	useEffect(() => {
		const fetchInterventions = async () => {
			try {
				setLoading(true);
				setError(null);
				const response = await interventionsApi.getInterventions({ status: 'pending' });
				setInterventions(response.items);
			} catch (err) {
				console.error('[InterventionsPage] Error fetching interventions:', err);
				setError('Failed to load interventions');
			} finally {
				setLoading(false);
			}
		};

		fetchInterventions();
	}, []);

	return (
		<Page>
			<PageHeader title="User Interventions" />

			<div className="space-y-4">
				<p className="text-muted-foreground">Review and respond to agent requests</p>

				{/* Summary */}
				<div className="flex items-center gap-4 text-sm text-muted-foreground">
					<span>📊 {interventions.length} Pending</span>
				</div>

				{/* Search bar - TODO */}
				{/* <SearchInput placeholder="Search interventions..." /> */}

				{/* Interventions list */}
				{loading ? (
					<div className="text-center py-8">Loading...</div>
				) : interventions.length === 0 ? (
					<EmptyState
						icon={<Bell />}
						title="No pending interventions"
						description="When agents need your input, interventions will appear here"
					/>
				) : (
					<div className="space-y-2">
						{interventions.map(intervention => (
							<InterventionCard key={intervention.id} intervention={intervention} />
						))}
					</div>
				)}
			</div>
		</Page>
	);
}

/**
 * Intervention card component (conversational style)
 */
function InterventionCard({ intervention }: { intervention: Intervention }) {
	const navigate = useNavigate();
	const icon = intervention.type === 'approval' ? '⏸️' : intervention.type === 'question' ? '💬' : '❓';

	const timeAgo = 'Just now'; // TODO: format time

	const handleClick = () => {
		navigate(`/interventions/${intervention.id}`);
	};

	return (
		<Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleClick}>
			<CardContent className="p-4">
				<div className="flex items-start justify-between">
					<div className="flex-1">
						<div className="flex items-center gap-2 mb-1">
							<span className="text-xl">{icon}</span>
							<h3 className="font-semibold">{intervention.config?.title || 'Intervention Required'}</h3>
							<span className="text-sm text-muted-foreground">{timeAgo}</span>
						</div>

						<p className="text-sm text-muted-foreground mb-2">
							Task #{intervention.taskId?.slice(0, 8) || 'unknown'}
						</p>

						{intervention.config?.description && (
							<p className="text-sm line-clamp-2">{intervention.config.description}</p>
						)}
					</div>

					<Badge variant="secondary">{intervention.status}</Badge>
				</div>
			</CardContent>
		</Card>
	);
}
