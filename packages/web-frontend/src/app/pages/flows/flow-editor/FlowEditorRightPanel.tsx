import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@framework/components/primitives/tabs';
import * as yaml from 'js-yaml';
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Code, Info, ShieldAlert } from 'lucide-react';

import type { FlowDefinition, ValidationResult } from './types/flow-engine.types';
import { cn } from './utils/cn';

interface FlowEditorRightPanelProps {
	flowDefinition: FlowDefinition | null;
	validationResult: ValidationResult | null;
	onIssueClick: (stepId: string) => void;
}

export function FlowEditorRightPanel({ flowDefinition, validationResult, onIssueClick }: FlowEditorRightPanelProps) {
	const [isOpen, setIsOpen] = useState(true);
	const [activeTab, setActiveTab] = useState<'yaml' | 'validation'>('yaml');

	if (!isOpen) {
		return (
			<div className="border-l bg-card">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setIsOpen(true)}
					className="flex h-full w-12 items-center justify-center"
					title="Show right panel"
				>
					<ChevronLeft className="size-4" />
				</Button>
			</div>
		);
	}

	const yamlContent = flowDefinition
		? yaml.dump(flowDefinition, {
				indent: 2,
				lineWidth: 120,
				noRefs: true,
				sortKeys: false,
			})
		: '';

	const hasValidationIssues = validationResult && validationResult.issues.length > 0;
	const errorCount = validationResult?.summary.errors || 0;
	const warningCount = validationResult?.summary.warnings || 0;

	return (
		<div className="flex w-[500px] flex-col border-l bg-card">
			{/* Header */}
			<div className="flex items-center justify-between border-b p-3">
				<Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'yaml' | 'validation')}>
					<TabsList>
						<TabsTrigger value="yaml" className={`flex cursor-pointer items-center gap-2`}>
							<Code className="size-4" />
							YAML
						</TabsTrigger>
						<TabsTrigger value="validation" className={`flex cursor-pointer items-center gap-2`}>
							<ShieldAlert className="size-4" />
							Validation
							{hasValidationIssues && (
								<span
									className={cn(
										'ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold',
										errorCount > 0
											? 'bg-destructive/20 text-destructive'
											: 'bg-warning/20 text-warning'
									)}
								>
									{errorCount + warningCount}
								</span>
							)}
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
					<ChevronRight className="size-4" />
				</Button>
			</div>

			{/* Content */}
			<div className="min-h-0 flex-1 overflow-auto">
				<Tabs value={activeTab}>
					{/* YAML Tab Content */}
					<TabsContent value="yaml" className="m-0 h-full">
						{!flowDefinition ? (
							<div
								className={`
          flex h-full items-center justify-center p-4 text-center text-sm
          text-muted-foreground
        `}
							>
								No flow loaded
							</div>
						) : (
							<div className="p-4">
								<pre className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs">
									<code>{yamlContent}</code>
								</pre>
							</div>
						)}
					</TabsContent>

					{/* Validation Tab Content */}
					<TabsContent value="validation" className="m-0 h-full">
						{!validationResult || validationResult.issues.length === 0 ? (
							<div
								className={`
          flex h-full flex-col items-center justify-center gap-2 p-4 text-center
        `}
							>
								<Info className="size-8 text-muted-foreground" />
								<span className="text-sm text-muted-foreground">No validation issues</span>
							</div>
						) : (
							<div className="divide-y">
								{validationResult.issues.map((issue, idx) => (
									<Button
										variant="ghost"
										size="sm"
										key={idx}
										className={cn(
											`
             flex w-full items-start gap-3 p-3 text-left transition-colors
             hover:bg-accent/50
           `
										)}
										onClick={() => issue.location?.stepId && onIssueClick(issue.location.stepId)}
									>
										{/* Icon */}
										<div className="pt-0.5">
											{issue.severity === 'error' && (
												<AlertCircle className="size-4 text-destructive" />
											)}
											{issue.severity === 'warning' && (
												<AlertTriangle className="size-4 text-warning" />
											)}
											{issue.severity === 'info' && (
												<Info className="size-4 text-muted-foreground" />
											)}
										</div>

										{/* Content */}
										<div className="min-w-0 flex-1">
											<div className="mb-1 flex items-center gap-2">
												<span
													className={cn(
														'rounded px-1.5 py-0.5 font-mono text-xs',
														issue.severity === 'error' &&
															'bg-destructive/10 text-destructive',
														issue.severity === 'warning' && 'bg-warning/10 text-warning',
														issue.severity === 'info' && 'bg-muted text-muted-foreground'
													)}
												>
													{issue.code}
												</span>
												{issue.location?.stepId && (
													<span className="text-xs text-muted-foreground">
														Step: {issue.location.stepId}
													</span>
												)}
											</div>
											<p className="text-sm">{issue.message}</p>
										</div>
									</Button>
								))}
							</div>
						)}
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
