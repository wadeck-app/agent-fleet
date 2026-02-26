import { createLogger } from 'shared-common/logger';

import type { TicketAnalysisPlan } from '@app/shared/api/tickets.contract';

import type { AgentExecutor, TicketAnalysisInput } from './AgentExecutor';

const log = createLogger('LocalClaudeAgentExecutor');

export class LocalClaudeAgentExecutor implements AgentExecutor {
	async analyzeTicketDescription(input: TicketAnalysisInput): Promise<TicketAnalysisPlan> {
		log.info('Analyzing ticket description (stub)', { projectId: input.projectId });
		const words = input.description.split(' ').length;
		const complexity = words < 10 ? 'simple' : words < 50 ? 'medium' : 'complex';
		return {
			title: input.description.substring(0, 100),
			labels: [],
			fields: {},
			complexity,
			analysis: `Analysis for: ${input.description}`,
			subTickets: [],
		};
	}

	async fixInvalidFlowYaml(yaml: string, validationErrors: string[]): Promise<string> {
		log.warn('fixInvalidFlowYaml called (stub)', { errors: validationErrors });
		return yaml;
	}

	async suggestLabels(description: string, existingLabels: string[]): Promise<string[]> {
		log.info('suggestLabels called (stub)');
		return [];
	}
}
