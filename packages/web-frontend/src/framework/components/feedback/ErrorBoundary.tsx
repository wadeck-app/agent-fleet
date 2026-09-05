import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@framework/components/primitives/Button';
import type { AppError } from '@framework/utils/errors/AppError';
import { ErrorSeverity, toAppError } from '@framework/utils/errors/AppError';
import { errorLogger } from '@framework/utils/errors/ErrorLogger';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

/**
 * ===========================================================================================
 * ERROR BOUNDARY - Generic UI Component
 * ===========================================================================================
 *
 * React Error Boundary for catching and displaying errors gracefully.
 * - Catches JavaScript errors anywhere in child component tree
 * - Integrates with centralized AppError system
 * - Automatic error logging via ErrorLogger
 * - Displays fallback UI with severity-based styling
 * - Provides recovery mechanism with automatic retry
 *
 * ===========================================================================================
 */

interface BaseErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: AppError, errorInfo: ErrorInfo) => void;
}

// With custom error logging
type ErrorBoundaryWithCustomLogging = BaseErrorBoundaryProps & {
	logError: (error: AppError, errorInfo: ErrorInfo) => void;
	disableDefaultLogging?: boolean;
};

// With default logging
type ErrorBoundaryWithDefaultLogging = BaseErrorBoundaryProps & {
	logError?: never;
	disableDefaultLogging?: never;
};

export type ErrorBoundaryProps = ErrorBoundaryWithCustomLogging | ErrorBoundaryWithDefaultLogging;

interface ErrorBoundaryState {
	hasError: boolean;
	error: AppError | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
		};
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		// Convert to AppError for consistent handling
		const appError = toAppError(error);

		// Update state so the next render will show the fallback UI
		return {
			hasError: true,
			error: appError,
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		// Convert to AppError
		const appError = toAppError(error);

		// Log using centralized error logger (unless custom logging is provided and default is disabled)
		const shouldUseDefaultLogging = !('disableDefaultLogging' in this.props) || !this.props.disableDefaultLogging;

		if (shouldUseDefaultLogging) {
			errorLogger.logError(
				appError,
				{
					boundaryLocation: 'ErrorBoundary',
				},
				errorInfo
			);
		}

		// Call custom error handler if provided
		this.props.onError?.(appError, errorInfo);

		// Log to custom service if provided
		if ('logError' in this.props && this.props.logError) {
			this.props.logError(appError, errorInfo);
		}
	}

	handleReset = (): void => {
		this.setState({
			hasError: false,
			error: null,
		});
	};

	/**
	 * Get severity-based styling
	 */
	private getSeverityStyles(severity: ErrorSeverity): string {
		switch (severity) {
			case ErrorSeverity.LOW:
				return 'border-info bg-info/10';
			case ErrorSeverity.MEDIUM:
				return 'border-warning bg-warning/10';
			case ErrorSeverity.HIGH:
				return 'border-warning bg-warning/10';
			case ErrorSeverity.CRITICAL:
				return 'border-destructive bg-destructive/10';
			default:
				throw new Error(`Unexpected switch value`);
		}
	}

	/**
	 * Get severity icon component
	 */
	private getSeverityIcon(severity: ErrorSeverity) {
		switch (severity) {
			case ErrorSeverity.LOW:
				return Info;
			case ErrorSeverity.MEDIUM:
				return AlertTriangle;
			case ErrorSeverity.HIGH:
				return AlertCircle;
			case ErrorSeverity.CRITICAL:
				return AlertCircle;
			default:
				throw new Error(`Unexpected switch value`);
		}
	}

	render(): ReactNode {
		if (this.state.hasError && this.state.error) {
			// Render custom fallback if provided
			if (this.props.fallback) {
				return this.props.fallback;
			}

			const error = this.state.error;
			const severityStyles = this.getSeverityStyles(error.severity);
			const SeverityIcon = this.getSeverityIcon(error.severity);

			// Render default fallback UI with AppError integration
			return (
				<div
					className={`
       flex min-h-[400px] flex-col items-center justify-center rounded-lg border
       p-8 text-center
       ${severityStyles}
     `}
				>
					<div className="max-w-md space-y-4">
						<SeverityIcon className="mx-auto size-16 text-destructive" />
						<h2 className="text-2xl font-bold text-destructive">
							{error.severity === ErrorSeverity.CRITICAL ? 'Critical Error' : 'Something went wrong'}
						</h2>
						<p className="text-muted-foreground">{error.getUserMessage()}</p>

						{/* Error code badge */}
						<div className={`inline-block rounded-md bg-muted px-3 py-1 font-mono text-xs`}>
							Error Code: {error.code}
						</div>

						{/* Expandable error details (dev mode) */}
						{import.meta.env.DEV && (
							<details className="mt-4 rounded-md bg-muted p-4 text-left">
								<summary className="cursor-pointer font-medium">Developer Information</summary>
								<div className="mt-2 space-y-2">
									<div>
										<strong className="text-xs">Message:</strong>
										<pre className="mt-1 overflow-auto text-xs">{String(error)}</pre>
									</div>
									<div>
										<strong className="text-xs">Severity:</strong>
										<span className="ml-2 text-xs">{error.severity.toLowerCase()}</span>
									</div>
									{error.statusCode && (
										<div>
											<strong className="text-xs">Status Code:</strong>
											<span className="ml-2 text-xs">{error.statusCode}</span>
										</div>
									)}
									{error.context && (
										<div>
											<strong className="text-xs">Context:</strong>
											<pre className="mt-1 overflow-auto text-xs">
												{JSON.stringify(error.context, null, 2)}
											</pre>
										</div>
									)}
									{error.stack && (
										<div>
											<strong className="text-xs">Stack Trace:</strong>
											<pre className="mt-1 overflow-auto text-xs">{error.stack}</pre>
										</div>
									)}
								</div>
							</details>
						)}

						<div className="mt-6 flex justify-center gap-3">
							<Button onClick={this.handleReset}>Try Again</Button>
							<Button variant="outline" onClick={() => window.location.reload()}>
								Reload Page
							</Button>
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
