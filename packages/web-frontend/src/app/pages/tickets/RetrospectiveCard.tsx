import { useEffect, useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { FlowRetrospective } from '@shared/api/flow-feedback.contract';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

import { feedbackApi } from './feedbackApi';

const retroToggleCls =
	'flex w-full items-center justify-start gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50';

interface RetrospectiveCardProps {
	ticketId: string;
}

export function RetrospectiveCard({ ticketId }: RetrospectiveCardProps) {
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
				className={retroToggleCls}
			>
				{open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
				Agent Retrospective
				<span className="ml-auto text-xs font-normal text-muted-foreground">
					{new Date(retro.generatedAt).toLocaleString()}
				</span>
			</Button>

			{open && (
				<div className="border-t space-y-4 p-3">
					<div className="space-y-1">
						<p className="text-xs font-medium text-muted-foreground tracking-wide">Execution summary</p>
						<p className="text-sm whitespace-pre-wrap">{retro.executionSummary}</p>
					</div>

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
