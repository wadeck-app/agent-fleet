export interface ApprovalProvider {
	requestInput(req: InputRequest): Promise<string>;
	requestChoice(req: ChoiceRequest): Promise<string>;
	requestApproval(req: ApprovalRequest): Promise<boolean>;
}

export interface InputRequest {
	taskId: string;
	stepId: string;
	prompt: string;
	hint?: string;
}

export interface ChoiceRequest {
	taskId: string;
	stepId: string;
	prompt: string;
	choices: Array<{ id: string; label: string; description?: string }>;
}

export interface ApprovalRequest {
	taskId: string;
	stepId: string;
	prompt: string;
	context?: string;
}
