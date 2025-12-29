import { useNavigate, useParams } from 'react-router-dom';

import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { FlowEditorCanvas } from './FlowEditorCanvas';
import './FlowEditor.css';
import { FlowEditorPropertiesPanel } from './FlowEditorPropertiesPanel';
import { FlowEditorRightPanel } from './FlowEditorRightPanel';
import { FlowEditorToolbar } from './FlowEditorToolbar';
import { useFlowEditor } from './hooks/useFlowEditor';
import { useFlowsList } from './hooks/useFlowsList';

export function FlowEditorPage() {
	const { flowId } = useParams<{ flowId: string }>();
	const navigate = useNavigate();
	const flowEditor = useFlowEditor(flowId);
	const { flows } = useFlowsList();

	const handleLoadFlow = (selectedFlowId: string) => {
		// Update URL - the useEffect in useFlowEditor will handle loading
		navigate(`/flows/${selectedFlowId}/edit`, { replace: true });
	};

	if (flowEditor.loading) {
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
			<Page fullWidth>
				<div className="mb-6">
					<PageHeader title={`Flow Editor: ${flowEditor.flowDefinition?.name || 'Untitled'}`} />
					{flowEditor.flowDefinition?.description && (
						<p className="mt-2 text-sm text-muted-foreground">{flowEditor.flowDefinition.description}</p>
					)}
				</div>

				<div className={`flex h-[calc(100vh-12rem)] flex-col rounded-lg border bg-card`}>
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
					/>

					{/* Main Content Area */}
					<div className="flex min-h-0 flex-1 overflow-hidden">
						{/* Canvas */}
						<div className="flex min-h-0 flex-1 flex-col">
							<FlowEditorCanvas
								nodes={flowEditor.nodes as any}
								edges={flowEditor.edges as any}
								onNodesChange={flowEditor.onNodesChange as any}
								onEdgesChange={flowEditor.onEdgesChange as any}
								onConnect={flowEditor.onConnect}
								onNodeClick={flowEditor.onNodeClick as any}
								onPaneClick={flowEditor.onPaneClick}
								selectedNodeId={flowEditor.selectedNodeId}
							/>
						</div>

						{/* Properties Panel */}
						{flowEditor.selectedNodeId && (
							<FlowEditorPropertiesPanel
								selectedNode={flowEditor.selectedNode}
								onUpdateNode={flowEditor.updateNodeData}
								onDeleteNode={flowEditor.deleteNode}
							/>
						)}

						{/* Right Panel (YAML + Validation) */}
						<FlowEditorRightPanel
							flowDefinition={flowEditor.flowDefinition}
							validationResult={flowEditor.validationResult}
							onIssueClick={flowEditor.focusNodeFromIssue}
						/>
					</div>
				</div>
			</Page>
		</ReactFlowProvider>
	);
}
