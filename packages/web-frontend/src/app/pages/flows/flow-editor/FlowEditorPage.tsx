import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { useToast } from '@framework/features/toast/ToastContext';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, XCircle } from 'lucide-react';

import './FlowEditor.css';
import { FlowEditorCanvas } from './FlowEditorCanvas';
import { FlowEditorEdgePanel } from './FlowEditorEdgePanel';
import { FlowEditorPropertiesPanel } from './FlowEditorPropertiesPanel';
import { FlowEditorRightPanel } from './FlowEditorRightPanel';
import { FlowEditorToolbar } from './FlowEditorToolbar';
import { EdgeSelectionProvider } from './contexts/EdgeSelectionContext';
import { useFlowEditor } from './hooks/useFlowEditor';
import { useFlowsList } from './hooks/useFlowsList';

export function FlowEditorPage() {
	const { flowId } = useParams<{ flowId: string }>();
	const navigate = useNavigate();
	const flowEditor = useFlowEditor(flowId);
	const { flows } = useFlowsList();
	const { showToast } = useToast();

	// Track previous isSaving state to detect save completion
	const wasSavingRef = useRef(false);

	// Show success toast when save completes successfully
	useEffect(() => {
		if (wasSavingRef.current && !flowEditor.isSaving && !flowEditor.error) {
			showToast('Flow saved successfully', 'success');
		}
		wasSavingRef.current = flowEditor.isSaving;
	}, [flowEditor.isSaving, flowEditor.error, showToast]);

	const handleLoadFlow = (selectedFlowId: string) => {
		// Update URL - the useEffect in useFlowEditor will handle loading
		navigate(`/flows/${selectedFlowId}/edit`);
	};

	// Only show full loading screen on initial load
	if (flowEditor.initialLoading) {
		return (
			<Page fullWidth>
				<div className="mb-6">
					<PageHeader title="Flow Editor" />
					<p className="mt-2 text-sm text-muted-foreground">Loading...</p>
				</div>
				<div className="flex h-96 items-center justify-center">
					<div className="text-muted-foreground">Loading flow...</div>
				</div>
			</Page>
		);
	}

	if (flowEditor.error) {
		return (
			<Page fullWidth>
				<div className="mb-6">
					<PageHeader title="Flow Editor" />
					<p className="mt-2 text-sm text-destructive">Error</p>
				</div>
				<div className="flex h-96 items-center justify-center">
					<div className="text-destructive">{flowEditor.error}</div>
				</div>
			</Page>
		);
	}

	return (
		<ReactFlowProvider>
			<EdgeSelectionProvider value={{ selectEdge: flowEditor.handleEdgeSelection }}>
				<Page fullWidth>
					<div className="mb-6 flex items-center gap-3">
						<h1 className="text-3xl font-bold">
							Flow Editor: {flowEditor.flowDefinition?.name || 'Untitled'}
						</h1>
						{flowEditor.validationResult && !flowEditor.validationResult.valid && (
							<span
								className={`
          inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3
          py-1 text-sm font-medium text-destructive
        `}
							>
								<XCircle className="h-4 w-4" />
								Invalid ({flowEditor.validationResult.summary.errors} errors)
							</span>
						)}
						{flowEditor.validationResult &&
							flowEditor.validationResult.valid &&
							flowEditor.validationResult.summary.warnings > 0 && (
								<span
									className={`
           inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1
           text-sm font-medium text-warning
         `}
								>
									<AlertTriangle className="h-4 w-4" />
									{flowEditor.validationResult.summary.warnings} warnings
								</span>
							)}
					</div>
					{flowEditor.flowDefinition?.description && (
						<p className="mb-6 text-sm text-muted-foreground">{flowEditor.flowDefinition.description}</p>
					)}

					<div
						className={`
       flex h-[calc(100vh-12rem)] flex-col rounded-lg border bg-card
     `}
					>
						{/* Toolbar */}
						<FlowEditorToolbar
							onSave={flowEditor.saveFlow}
							onValidate={flowEditor.validateFlow}
							onAutoLayout={flowEditor.autoLayout}
							onAddNode={flowEditor.addNode}
							onLoadFlow={handleLoadFlow}
							availableFlows={flows}
							currentFlowId={flowEditor.flowDefinition?.id || null}
							isDirty={flowEditor.isDirty}
							isSaving={flowEditor.isSaving}
							showDependencyEdges={flowEditor.showDependencyEdges}
							showDataFlowEdges={flowEditor.showDataFlowEdges}
							showEdgeLabels={flowEditor.showEdgeLabels}
							onToggleDependencyEdges={flowEditor.toggleDependencyEdges}
							onToggleDataFlowEdges={flowEditor.toggleDataFlowEdges}
							onToggleEdgeLabels={flowEditor.toggleEdgeLabels}
						/>

						{/* Main Content Area */}
						<div className="flex min-h-0 flex-1 overflow-hidden">
							{/* Canvas */}
							<div className="relative flex min-h-0 flex-1 flex-col">
								<FlowEditorCanvas
									nodes={flowEditor.nodes as any}
									edges={flowEditor.edges as any}
									onNodesChange={flowEditor.onNodesChange as any}
									onEdgesChange={flowEditor.onEdgesChange as any}
									onConnect={flowEditor.onConnect}
									onNodeClick={flowEditor.onNodeClick as any}
									onEdgeClick={flowEditor.onEdgeClick as any}
									onPaneClick={flowEditor.onPaneClick}
									selectedNodeId={flowEditor.selectedNodeId}
									selectedEdgeId={flowEditor.selectedEdgeId}
								/>
								{flowEditor.loading && (
									<div
										className={`
            absolute inset-0 z-50 flex items-center justify-center
            bg-background/80 backdrop-blur-sm
          `}
									>
										<div className="text-muted-foreground">Loading flow...</div>
									</div>
								)}
							</div>

							{/* Properties Panel - Show Node or Edge Panel based on selection */}
							{flowEditor.selectedNode && (
								<FlowEditorPropertiesPanel
									selectedNode={flowEditor.selectedNode}
									onUpdateNode={flowEditor.updateNodeData}
									onDeleteNode={flowEditor.deleteNode}
								/>
							)}
							{flowEditor.selectedEdge && (
								<FlowEditorEdgePanel
									selectedEdge={flowEditor.selectedEdge}
									nodes={flowEditor.nodes}
									onDeleteEdge={edgeId => {
										flowEditor.setEdges(eds => eds.filter(e => e.id !== edgeId));
									}}
								/>
							)}

							{/* Right Panel (YAML + Validation) */}
							<div className="relative">
								<FlowEditorRightPanel
									flowDefinition={flowEditor.flowDefinition}
									validationResult={flowEditor.validationResult}
									onIssueClick={flowEditor.focusNodeFromIssue}
								/>
								{flowEditor.loading && (
									<div
										className={`
            absolute inset-0 z-50 flex items-center justify-center
            bg-background/80 backdrop-blur-sm
          `}
									>
										<div className="text-muted-foreground">Loading...</div>
									</div>
								)}
							</div>
						</div>
					</div>
				</Page>
			</EdgeSelectionProvider>
		</ReactFlowProvider>
	);
}
