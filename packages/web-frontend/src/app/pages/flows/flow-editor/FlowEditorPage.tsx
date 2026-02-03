import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { LoadingState } from '@framework/components/feedback/LoadingState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { useToast } from '@framework/features/toast/ToastContext';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { FlowEditorHeader } from '@/app/components/domain/FlowEditorHeader';
import { FlowEditorLayout } from '@/app/components/domain/FlowEditorLayout';

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
	const [wasSaving, setWasSaving] = useState(false);

	// Show success toast when save completes successfully
	useEffect(() => {
		if (wasSaving && !flowEditor.isSaving && !flowEditor.error) {
			showToast('Flow saved successfully', 'success');
		}
		setWasSaving(flowEditor.isSaving);
	}, [flowEditor.isSaving, flowEditor.error, showToast, wasSaving]);

	const handleLoadFlow = (selectedFlowId: string) => {
		// Update URL - the useEffect in useFlowEditor will handle loading
		navigate(`/flows/${selectedFlowId}/edit`);
	};

	// Only show full loading screen on initial load
	if (flowEditor.initialLoading) {
		return (
			<Page fullWidth>
				<PageHeader title="Flow Editor" />
				<LoadingState message="Loading flow..." />
			</Page>
		);
	}

	if (flowEditor.error) {
		return (
			<Page fullWidth>
				<PageHeader title="Flow Editor" />
				<div className="flex h-96 items-center justify-center text-destructive">{flowEditor.error}</div>
			</Page>
		);
	}

	return (
		<ReactFlowProvider>
			<EdgeSelectionProvider value={{ selectEdge: flowEditor.handleEdgeSelection }}>
				<Page fullWidth>
					<FlowEditorHeader
						flowName={`Flow Editor: ${flowEditor.flowDefinition?.name || 'Untitled'}`}
						flowDescription={flowEditor.flowDefinition?.description}
						validationResult={flowEditor.validationResult}
					/>

					<FlowEditorLayout
						toolbar={
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
						}
						canvas={
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
						}
						propertiesPanel={
							<>
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
							</>
						}
						rightPanel={
							<FlowEditorRightPanel
								flowDefinition={flowEditor.flowDefinition}
								validationResult={flowEditor.validationResult}
								onIssueClick={flowEditor.focusNodeFromIssue}
								nodes={flowEditor.nodes}
								allEdges={flowEditor.allEdges}
								onApplyYamlChanges={flowEditor.applyYamlChanges}
							/>
						}
						loading={flowEditor.loading}
					/>
				</Page>
			</EdgeSelectionProvider>
		</ReactFlowProvider>
	);
}
