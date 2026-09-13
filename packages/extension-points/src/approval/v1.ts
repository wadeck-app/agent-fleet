export interface ApprovalProvider {
	requestInput(req: InputRequest): Promise<string>;
	requestChoice(req: ChoiceRequest): Promise<string>;
	requestApproval(req: ApprovalRequest): Promise<boolean>;
	/**
	 * Whether answering requires a terminal attached to the worker process.
	 *
	 * A worker used to advertise itself as interactive only when `process.stdout.isTTY`, which
	 * describes the CLI prompt implementation rather than the capability: a provider that takes its
	 * answer from a file, an HTTP call or a chat message needs no terminal, and gating it on one
	 * makes an approval step unanswerable by anything but a human at a keyboard.
	 *
	 * Optional, and absent means "assume a terminal is required" -- a provider written before this
	 * field existed keeps its old behaviour rather than being assumed headless-capable.
	 */
	readonly requiresTerminal?: boolean;
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
