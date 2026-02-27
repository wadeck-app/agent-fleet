import type { TicketAnalysisPlan } from '@app/shared/api/tickets.contract';

export interface TicketAnalysisInput {
	description: string;
	projectId: string;
	clarificationAnswers?: Record<string, string>;
	context?: {
		existingLabels?: string[];
		existingFlows?: string[];
	};
}

export interface AgentExecutor {
	analyzeTicketDescription(input: TicketAnalysisInput): Promise<TicketAnalysisPlan>;
	fixInvalidFlowYaml(yaml: string, validationErrors: string[]): Promise<string>;
	suggestLabels(description: string, existingLabels: string[]): Promise<string[]>;
}
