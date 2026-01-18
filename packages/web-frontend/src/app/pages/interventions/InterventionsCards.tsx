import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@framework/components/feedback/EmptyState';
import { SkeletonBox } from '@framework/components/loading/SkeletonBox';
import { Badge } from '@framework/components/primitives/Badge';
import { Card, CardContent } from '@framework/components/primitives/Card';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import { formatRelativeTime } from '@framework/utils/formatting/DateFormat';
import type { Intervention } from '@shared/api/interventions.contract';
import { Bell } from 'lucide-react';

import { getInterventionStatusVariant, getInterventionTypeVariant } from './interventions.helpers';

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
										<SkeletonBox shape="square" className="h-6 w-6" />
										<SkeletonBox className="h-5 w-2/3" />
									</div>
									{/* Description skeleton */}
									<SkeletonBox className="h-4 w-full" />
									<SkeletonBox className="h-4 w-4/5" />
								</div>
								{/* Badges skeleton */}
								<div className="flex items-center gap-2 shrink-0">
									<SkeletonBox shape="pill" className="h-6 w-16" />
									<SkeletonBox shape="pill" className="h-6 w-16" />
									<SkeletonBox shape="pill" className="h-6 w-20" />
									<SkeletonBox shape="pill" className="h-6 w-16" />
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
	const statusVariant = getInterventionStatusVariant(intervention.status);
	const typeVariant = getInterventionTypeVariant(intervention.type);

	const handleClick = () => {
		navigate(`/interventions/${intervention.id}`);
	};

	return (
		<Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={handleClick}>
			<CardContent className="p-3">
				<div className="flex items-start justify-between gap-3">
					<div className="flex-1 min-w-0">
						{/* Header with type badge and title */}
						<div className="flex items-center gap-2 mb-2">
							<Badge variant={typeVariant} className="capitalize text-xs shrink-0">
								{intervention.type}
							</Badge>
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
