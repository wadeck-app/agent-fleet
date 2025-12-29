import { Button } from '@framework/components/primitives/Button';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

import type { ValidationResult } from './types/flow-engine.types';
import { cn } from './utils/cn';

interface FlowEditorValidationPanelProps {
	validationResult: ValidationResult | null;
	onIssueClick: (stepId: string) => void;
}

export function FlowEditorValidationPanel({ validationResult, onIssueClick }: FlowEditorValidationPanelProps) {
	if (!validationResult || validationResult.issues.length === 0) {
		return (
			<div className="border-t bg-card/50 p-3">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Info className="size-4" />
					<span>No validation issues</span>
				</div>
			</div>
		);
	}

	const { summary, issues } = validationResult;

	return (
		<div className="max-h-[200px] overflow-auto border-t bg-card/50">
			{/* Summary */}
			<div
				className={`
      sticky top-0 flex flex-wrap items-center gap-2 border-b bg-card p-3
      text-sm font-medium
    `}
			>
				<span className="whitespace-nowrap">Validation Issues:</span>
				{summary.errors > 0 && (
					<span className={`flex items-center gap-1 whitespace-nowrap text-destructive`}>
						<AlertCircle className="size-4" />
						{summary.errors} error{summary.errors > 1 ? 's' : ''}
					</span>
				)}
				{summary.warnings > 0 && (
					<span className="flex items-center gap-1 whitespace-nowrap text-warning">
						<AlertTriangle className="size-4" />
						{summary.warnings} warning{summary.warnings > 1 ? 's' : ''}
					</span>
				)}
				{summary.info > 0 && (
					<span
						className={`
        flex items-center gap-1 whitespace-nowrap text-muted-foreground
      `}
					>
						<Info className="size-4" />
						{summary.info} info
					</span>
				)}
			</div>

			{/* Issues List */}
			<div className="divide-y">
				{issues.map((issue, idx) => (
					<Button
						variant="ghost"
						size="sm"
						key={idx}
						className={cn(
							`
         w-full p-3 text-left transition-colors
         hover:bg-accent/50
       `,
							'flex items-start gap-3'
						)}
						onClick={() => issue.location?.stepId && onIssueClick(issue.location.stepId)}
					>
						{/* Icon */}
						<div className="pt-0.5">
							{issue.severity === 'error' && <AlertCircle className={`size-4 text-destructive`} />}
							{issue.severity === 'warning' && <AlertTriangle className={`size-4 text-warning`} />}
							{issue.severity === 'info' && <Info className={`size-4 text-muted-foreground`} />}
						</div>

						{/* Content */}
						<div className="min-w-0 flex-1">
							<div className="mb-1 flex items-center gap-2">
								<span
									className={cn(
										'rounded px-1.5 py-0.5 font-mono text-xs',
										issue.severity === 'error' && 'bg-destructive/10 text-destructive',
										issue.severity === 'warning' && 'bg-warning/10 text-warning',
										issue.severity === 'info' && 'bg-muted text-muted-foreground'
									)}
								>
									{issue.code}
								</span>
								{issue.location?.stepId && (
									<span className="text-xs text-muted-foreground">Step: {issue.location.stepId}</span>
								)}
							</div>
							<p className="text-sm">{issue.message}</p>
						</div>
					</Button>
				))}
			</div>
		</div>
	);
}
