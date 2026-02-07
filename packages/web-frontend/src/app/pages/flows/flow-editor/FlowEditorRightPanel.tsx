import { useState } from 'react';

import { Button } from '@framework/components/primitives/Button';
import { TabButton } from '@framework/components/primitives/TabButton';
import { TabGroup } from '@framework/components/primitives/TabGroup';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { ValidationResult } from 'flow-engine/validation/ValidationTypes';
import * as yaml from 'js-yaml';
import {
	AlertCircle,
	AlertTriangle,
	ChevronLeft,
	ChevronRight,
	Code,
	Download,
	Edit,
	Info,
	ShieldAlert,
} from 'lucide-react';

import { YamlEditor } from './components/YamlEditor';
import { useFlowPreview } from './hooks/useFlowPreview';
import type { FlowEdge, FlowNode } from './types';
import type { FlowDefinition } from './types/flow-engine.types';
import { cn } from './utils/cn';
import { type DiffSegment, computeFlowDiff } from './utils/computeFlowDiff';
import { flowDefinitionToReactFlow } from './utils/flowToReactFlow';
import { applyDagreLayout } from './utils/layoutAlgorithms';

/**
 * Render character-level diff segments with highlighting
 */
function renderSegments(segments: DiffSegment[]) {
	return segments.map((segment, idx) => {
		if (segment.type === 'added') {
			return (
				<span key={idx} className="bg-success/30 text-success">
					{segment.text}
				</span>
			);
		}
		if (segment.type === 'removed') {
			return (
				<span key={idx} className="bg-destructive/30 text-destructive">
					{segment.text}
				</span>
			);
		}
		return <span key={idx}>{segment.text}</span>;
	});
}

interface FlowEditorRightPanelProps {
	flowDefinition: FlowDefinition | null;
	validationResult: ValidationResult | null;
	onIssueClick: (stepId: string) => void;
	nodes: FlowNode[];
	allEdges: FlowEdge[];
	onApplyYamlChanges: (flow: FlowDefinition, nodes: FlowNode[], edges: FlowEdge[]) => void;
}

export function FlowEditorRightPanel({
	flowDefinition,
	validationResult,
	onIssueClick,
	nodes,
	allEdges,
	onApplyYamlChanges,
}: FlowEditorRightPanelProps) {
	const [isOpen, setIsOpen] = useState(true);
	const [activeTab, setActiveTab] = useState<'yaml' | 'validation'>('yaml');
	const [yamlTab, setYamlTab] = useState<'original' | 'preview'>('preview');
	const [isEditingYaml, setIsEditingYaml] = useState(false);
	const [editedYaml, setEditedYaml] = useState('');
	const [yamlError, setYamlError] = useState<string | null>(null);

	// Compute preview and diff
	const previewFlow = useFlowPreview(flowDefinition, nodes, allEdges);
	const { lines: diffLines, summary: diffSummary } = computeFlowDiff(flowDefinition, previewFlow);

	// Handle export
	const handleExport = (version: 'original' | 'preview') => {
		if (!flowDefinition) return;

		let content: string;
		let filename: string;

		switch (version) {
			case 'original':
				content = originalYaml;
				filename = `${flowDefinition.name || flowDefinition.id}_original.yaml`;
				break;
			case 'preview':
				content = previewYaml;
				filename = `${flowDefinition.name || flowDefinition.id}_preview.yaml`;
				break;
		}

		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	};

	// Handle YAML editing
	const handleApplyYamlEdit = (yamlContent: string) => {
		try {
			const editedFlow = yaml.load(yamlContent) as FlowDefinition;

			if (!editedFlow.steps || !Array.isArray(editedFlow.steps)) {
				throw new Error('Invalid flow structure: missing steps array');
			}

			const { nodes: newNodes, edges: newEdges } = flowDefinitionToReactFlow(editedFlow);
			const layoutedNodes = applyDagreLayout(newNodes, newEdges);

			// Call the callback from useFlowEditor
			onApplyYamlChanges(editedFlow, layoutedNodes, newEdges);

			setIsEditingYaml(false);
			setYamlError(null);
		} catch (err) {
			setYamlError(getErrorMessage(err));
		}
	};

	if (!isOpen) {
		return (
			<div className="flex flex-col border-l bg-card">
				<div className="flex h-[57px] items-center justify-center border-b">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsOpen(true)}
						className="size-9"
						title="Show right panel"
					>
						<ChevronLeft className="size-4" />
					</Button>
				</div>
			</div>
		);
	}

	// Generate YAML for each tab
	const originalYaml = flowDefinition
		? yaml.dump(flowDefinition, {
				indent: 2,
				lineWidth: 120,
				noRefs: true,
				sortKeys: false,
			})
		: '';

	const previewYaml = previewFlow
		? yaml.dump(previewFlow, {
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
		<div className="flex h-full w-[500px] flex-col border-l bg-card">
			<div className="flex min-h-0 flex-1 flex-col">
				{/* Header */}
				<div className="flex items-center justify-between border-b p-3">
					<TabGroup variant="default" emptyMessage="">
						<TabButton active={activeTab === 'yaml'} onClick={() => setActiveTab('yaml')}>
							<Code className="size-4" />
							YAML
						</TabButton>
						<TabButton active={activeTab === 'validation'} onClick={() => setActiveTab('validation')}>
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
						</TabButton>
					</TabGroup>
					<Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
						<ChevronRight className="size-4" />
					</Button>
				</div>

				{/* Content */}
				{activeTab === 'yaml' && (
					<div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
						{!flowDefinition ? (
							<div
								className={`
          flex h-full items-center justify-center text-center text-sm
          text-muted-foreground
        `}
							>
								No flow loaded
							</div>
						) : (
							<div className="flex h-full flex-col">
								<div className="mb-2 flex items-center justify-between">
									<TabGroup variant="default" emptyMessage="">
										<TabButton
											active={yamlTab === 'original'}
											onClick={() => {
												setYamlTab('original');
												if (isEditingYaml) {
													setIsEditingYaml(false);
												}
											}}
										>
											Original
										</TabButton>
										<TabButton
											active={yamlTab === 'preview'}
											onClick={() => {
												setYamlTab('preview');
												if (isEditingYaml) {
													setIsEditingYaml(false);
												}
											}}
										>
											Preview
											{diffSummary.additions + diffSummary.deletions > 0 && (
												<span className="ml-1 rounded-full bg-primary/20 px-1.5 text-xs">
													{diffSummary.additions + diffSummary.deletions}
												</span>
											)}
										</TabButton>
									</TabGroup>
									<div className="flex gap-1">
										{!isEditingYaml && yamlTab === 'original' && (
											<Button
												variant="ghost"
												size="sm"
												onClick={() => {
													setIsEditingYaml(true);
													setEditedYaml(originalYaml);
												}}
												title="Edit YAML"
											>
												<Edit className="size-4" />
											</Button>
										)}
										<Button
											variant="ghost"
											size="sm"
											onClick={() => handleExport(yamlTab)}
											title={`Export ${yamlTab} YAML`}
										>
											<Download className="size-4" />
										</Button>
									</div>
								</div>

								{isEditingYaml ? (
									<YamlEditor
										initialValue={editedYaml}
										onSave={handleApplyYamlEdit}
										onCancel={() => setIsEditingYaml(false)}
									/>
								) : (
									<div className="flex-1 overflow-auto">
										{yamlTab === 'original' ? (
											<pre className="text-xs">
												<code>{originalYaml}</code>
											</pre>
										) : (
											<div className="flex flex-col font-mono text-xs">
												{diffLines.map((line, idx) => {
													// Use relative positioning for colored bar
													const hasBar =
														line.type === 'added' ||
														line.type === 'removed' ||
														line.type === 'modified';
													const barColor =
														line.type === 'added'
															? 'bg-success'
															: line.type === 'removed'
																? 'bg-destructive'
																: 'bg-warning';

													return (
														<pre
															key={idx}
															className={cn(
																'm-0 py-0.5 whitespace-pre',
																hasBar ? 'relative pl-3' : 'px-3',
																line.type === 'removed' && 'line-through opacity-70'
															)}
														>
															{hasBar && (
																<span
																	className={cn(
																		'absolute left-0 top-0 bottom-0 w-0.5',
																		barColor
																	)}
																/>
															)}
															{line.segments
																? renderSegments(line.segments)
																: line.content}
														</pre>
													);
												})}
											</div>
										)}
									</div>
								)}
							</div>
						)}
					</div>
				)}

				{/* Validation Tab Content */}
				{activeTab === 'validation' && (
					<div className="flex-1 overflow-auto">
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
					</div>
				)}
			</div>
		</div>
	);
}
