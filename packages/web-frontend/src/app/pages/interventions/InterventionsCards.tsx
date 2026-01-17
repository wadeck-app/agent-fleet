import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@framework/components/feedback/EmptyState';
import { Badge } from '@framework/components/primitives/Badge';
import { Card, CardContent } from '@framework/components/primitives/Card';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Intervention } from '@shared/api/interventions.contract';
import { Bell } from 'lucide-react';

import { getInterventionStatusVariant, getInterventionTypeIcon } from './interventions.helpers';

/**
 * ===========================================================================================
 * INTERVENTIONS CARDS COMPONENT
 * ===========================================================================================
 *
 * Card-based presentation for interventions list.
 * Implements QueryResultDisplayerProps contract for Data2 integration.
 *
 * Features:
 * - Conversational card layout
 * - Clickable navigation to detail page
 * - Status badges with color mapping
 * - Type icons
 * - Relative time display
 * - Empty state when no interventions
 * - Loading and error states
 *
 * ===========================================================================================
 */

export interface InterventionsCardsProps extends QueryResultDisplayerProps<Intervention> {
	onInterventionClick?: (id: string) => void;
}

export function InterventionsCards({ data, isLoading, error, features }: InterventionsCardsProps) {
	// Loading state - show skeleton cards
	if (isLoading && data.length === 0) {
		return (
			<div className="space-y-2">
				{Array.from({ length: 5 }).map((_, idx) => (
					<Card key={`skeleton-${idx}`}>
						<CardContent className="p-3">
							<div className="flex items-start justify-between gap-3">
								<div className="flex-1 min-w-0 space-y-2">
									{/* Icon + Title skeleton */}
									<div className="flex items-center gap-2">
										<div className="h-6 w-6 animate-pulse rounded bg-muted shrink-0" />
										<div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
									</div>
									{/* Description skeleton */}
									<div className="h-4 w-full animate-pulse rounded bg-muted" />
									<div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
								</div>
								{/* Badges skeleton */}
								<div className="flex items-center gap-2 shrink-0">
									<div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
									<div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
									<div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
									<div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
								</div>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	// Error state
	if (error) {
		return (
			<div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-destructive">
				Error loading interventions: {error}
			</div>
		);
	}

	// Empty state
	if (data.length === 0) {
		return (
			<EmptyState
				icon={<Bell />}
				title="No interventions"
				description="When agents need your input, interventions will appear here"
			/>
		);
	}

	// Cards grid
	return (
		<div className="space-y-2">
			{data.map(intervention => (
				<InterventionCard key={intervention.id} intervention={intervention} />
			))}
		</div>
	);
}

/**
 * Individual intervention card component
 */
function InterventionCard({ intervention }: { intervention: Intervention }) {
	const navigate = useNavigate();
	const icon = getInterventionTypeIcon(intervention.type);
	const statusVariant = getInterventionStatusVariant(intervention.status);

	const handleClick = () => {
		navigate(`/interventions/${intervention.id}`);
	};

	return (
		<Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleClick}>
			<CardContent className="p-3">
				<div className="flex items-start justify-between gap-3">
					<div className="flex-1 min-w-0">
						{/* Header with icon and title */}
						<div className="flex items-center gap-2 mb-2">
							<span className="text-xl shrink-0">{icon}</span>
							<div className="font-semibold text-foreground truncate">
								{intervention.config?.title || 'Intervention Required'}
							</div>
						</div>

						{/* Description */}
						{intervention.config?.description && (
							<div className="text-sm text-muted-foreground line-clamp-2">
								{intervention.config.description}
							</div>
						)}
					</div>

					{/* Right side badges */}
					<div className="flex items-center gap-2 shrink-0">
						<Badge variant="secondary" className="font-mono text-xs">
							#{intervention.taskId?.slice(0, 8) || 'unknown'}
						</Badge>
						<Badge variant="default" className="text-xs">
							{intervention.type}
						</Badge>
						<Badge
							variant="outline"
							className="text-xs"
							title={new Date(intervention.createdAt).toISOString()}
						>
							{formatRelativeTime(intervention.createdAt)}
						</Badge>
						<Badge variant={statusVariant} className="text-xs">
							{intervention.status}
						</Badge>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
