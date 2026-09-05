import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { ValidationIssue } from 'flow-engine/validation/ValidationTypes';

/**
 * Component to display field-specific validation messages inline
 */
export function FieldValidationMessage({ issues }: { issues: ValidationIssue[] }) {
	if (issues.length === 0) return null;

	return (
		<div className="mt-2 space-y-2">
			{issues.map((issue, idx) => {
				const Icon =
					issue.severity === 'error' ? AlertCircle : issue.severity === 'warning' ? AlertTriangle : Info;
				const bgColor =
					issue.severity === 'error'
						? 'bg-danger/10 border-danger/30'
						: issue.severity === 'warning'
							? 'bg-warning/10 border-warning/30'
							: 'bg-info/10 border-info/30';
				const textColor =
					issue.severity === 'error'
						? 'text-danger'
						: issue.severity === 'warning'
							? 'text-warning'
							: 'text-info';

				return (
					<div
						key={idx}
						className={`
        rounded-md border p-3
        ${bgColor}
      `}
					>
						<div
							className={`
         flex items-start gap-2 text-xs
         ${textColor}
       `}
						>
							<Icon className="mt-0.5 size-4 flex-shrink-0" />
							<div className="flex-1">
								<div className="font-medium">{issue.message}</div>
								{issue.suggestion && <div className="mt-1 text-xs opacity-80">{issue.suggestion}</div>}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
