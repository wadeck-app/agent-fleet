import { ConfigDir } from '@wadeck-app/shared-cli';
import type { ApprovalProvider, ApprovalRequest, ChoiceRequest, InputRequest } from 'extension-points';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Kind marker written into the request file so a reader knows which response shape is expected. */
export type ApprovalRequestKind = 'input' | 'choice' | 'approval';

export interface FileApprovalOptions {
	/** Absolute directory where request/response files live. */
	dir?: string;
	/** How long to wait for a response file before throwing. Default: 30 minutes. */
	timeoutMs?: number;
	/** How often to look for the response file. Default: 500 ms. */
	pollIntervalMs?: number;
	/**
	 * How long a response file that does not parse yet is treated as still being written before it
	 * is rejected as malformed. Answering with a shell redirect is not atomic, so a file can be
	 * seen half-written. Default: 2000 ms.
	 */
	settleMs?: number;
}

/** Env var consulted when no explicit `dir` option is given. */
export const APPROVAL_DIR_ENV_VAR = 'FLOW_APPROVAL_DIR';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_SETTLE_MS = 2000;

/** Sub-directory keeping the audit trail of everything already answered. */
const ANSWERED_DIR_NAME = 'answered';

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Resolves the approvals directory: explicit option, then FLOW_APPROVAL_DIR, then
 * `<ConfigDir.get('flow')>/approvals`. A configured-but-relative path is a configuration error,
 * not something to silently normalise: the daemon's cwd is not the user's cwd.
 */
export function resolveApprovalDir(dir?: string): string {
	if (dir !== undefined) {
		if (!path.isAbsolute(dir)) {
			throw new Error(
				`[file-approval] The "dir" option must be an absolute path, got "${dir}". ` +
					'A relative path would resolve against the daemon working directory, not yours.'
			);
		}
		return dir;
	}

	const fromEnv = process.env[APPROVAL_DIR_ENV_VAR];
	if (fromEnv !== undefined && fromEnv !== '') {
		if (!path.isAbsolute(fromEnv)) {
			throw new Error(
				`[file-approval] ${APPROVAL_DIR_ENV_VAR} must be an absolute path, got "${fromEnv}". ` +
					'A relative path would resolve against the daemon working directory, not yours.'
			);
		}
		return fromEnv;
	}

	return path.join(ConfigDir.get('flow'), 'approvals');
}

/** File-system safe rendering of an ISO timestamp, used to keep every answered pair distinct. */
function fileStamp(date: Date): string {
	return date.toISOString().replace(/[:.]/g, '-');
}

function describeFound(value: unknown): string {
	return value === undefined ? 'nothing' : JSON.stringify(value);
}

/**
 * Answers a `user_intervention` step through the filesystem instead of a TTY.
 *
 * Each request publishes `<dir>/<taskId>_<stepId>.request.json` -- self-describing, including the
 * exact response file to create and its accepted shape -- then polls for
 * `<dir>/<taskId>_<stepId>.response.json`. Both files are moved to `<dir>/answered/` once consumed.
 */
export class FileApprovalProvider implements ApprovalProvider {
	readonly dir: string;
	readonly timeoutMs: number;
	readonly pollIntervalMs: number;
	readonly settleMs: number;

	// Guarantees a unique audit-trail filename even for two answers within the same millisecond.
	private sequence = 0;

	constructor(options: FileApprovalOptions = {}) {
		this.dir = resolveApprovalDir(options.dir);
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		this.settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
		fs.mkdirSync(this.dir, { recursive: true });
	}

	async requestInput(req: InputRequest): Promise<string> {
		const payload = await this.exchange('input', req, this.shapeFor('input', req.taskId, req.stepId));
		const value = payload.body['value'];
		if (value === undefined) {
			throw this.invalid(payload.responsePath, 'input', 'the required field "value" is missing');
		}
		if (typeof value !== 'string') {
			throw this.invalid(
				payload.responsePath,
				'input',
				`"value" must be a string, found ${describeFound(value)}`
			);
		}
		this.archive(payload);
		return value;
	}

	async requestChoice(req: ChoiceRequest): Promise<string> {
		const offered = req.choices.map(choice => choice.id);
		const payload = await this.exchange('choice', req, this.shapeFor('choice', req.taskId, req.stepId, offered));
		const choiceId = payload.body['choiceId'];
		if (choiceId === undefined) {
			throw this.invalid(
				payload.responsePath,
				'choice',
				`the required field "choiceId" is missing (offered: ${offered.join(', ')})`
			);
		}
		if (typeof choiceId !== 'string') {
			throw this.invalid(
				payload.responsePath,
				'choice',
				`"choiceId" must be a string, found ${describeFound(choiceId)} (offered: ${offered.join(', ')})`
			);
		}
		if (!offered.includes(choiceId)) {
			throw this.invalid(
				payload.responsePath,
				'choice',
				`"choiceId" is ${JSON.stringify(choiceId)}, which is not one of the offered choices: ${offered.join(', ')}`
			);
		}
		this.archive(payload);
		return choiceId;
	}

	async requestApproval(req: ApprovalRequest): Promise<boolean> {
		const payload = await this.exchange('approval', req, this.shapeFor('approval', req.taskId, req.stepId));
		const approved = payload.body['approved'];
		if (approved === undefined) {
			throw this.invalid(payload.responsePath, 'approval', 'the required field "approved" is missing');
		}
		if (typeof approved !== 'boolean') {
			throw this.invalid(
				payload.responsePath,
				'approval',
				`"approved" must be a boolean (true or false), found ${describeFound(approved)}`
			);
		}
		const comment = payload.body['comment'];
		if (comment !== undefined && typeof comment !== 'string') {
			throw this.invalid(
				payload.responsePath,
				'approval',
				`"comment" must be a string when present, found ${describeFound(comment)}`
			);
		}
		this.archive(payload);
		return approved;
	}

	/** Human-readable contract for a given request kind, embedded in the request file and in errors. */
	private shapeFor(kind: ApprovalRequestKind, taskId: string, stepId: string, offered?: string[]): string {
		const responsePath = this.responsePath(taskId, stepId);
		switch (kind) {
			case 'approval':
				return `Create ${responsePath} containing {"approved": true|false, "comment": "<optional string>"}`;
			case 'input':
				return `Create ${responsePath} containing {"value": "<your answer as a string>"}`;
			case 'choice':
				return `Create ${responsePath} containing {"choiceId": "<one of: ${(offered ?? []).join(' | ')}>"}`;
			default:
				throw new Error(`[file-approval] Unsupported request kind: ${String(kind)}`);
		}
	}

	private requestPath(taskId: string, stepId: string): string {
		return path.join(this.dir, `${taskId}_${stepId}.request.json`);
	}

	private responsePath(taskId: string, stepId: string): string {
		return path.join(this.dir, `${taskId}_${stepId}.response.json`);
	}

	/** Publishes the request file, then waits for a parsable response object. */
	private async exchange(
		kind: ApprovalRequestKind,
		req: { taskId: string; stepId: string },
		respondBy: string
	): Promise<ExchangeResult> {
		const requestPath = this.requestPath(req.taskId, req.stepId);
		const responsePath = this.responsePath(req.taskId, req.stepId);

		if (fs.existsSync(responsePath)) {
			throw new Error(
				`[file-approval] Refusing to ask ${req.taskId}/${req.stepId}: a stale response file already exists at ` +
					`${responsePath}. It would be consumed as if it answered this request. ` +
					'Inspect it, then move or delete it.'
			);
		}

		const requestBody = { kind, ...req, createdAt: new Date().toISOString(), respondBy };
		fs.writeFileSync(requestPath, `${JSON.stringify(requestBody, null, '\t')}\n`, 'utf8');

		process.stdout.write(
			`[file-approval] Waiting for ${kind} of ${req.taskId}/${req.stepId} -- answer by creating ${responsePath} (${respondBy})\n`
		);

		const parsed = await this.waitForResponse(requestPath, responsePath, respondBy, kind);

		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw this.invalid(
				responsePath,
				kind,
				`the file must contain a JSON object, found ${describeFound(parsed)}`
			);
		}

		return { requestPath, responsePath, body: parsed as Record<string, unknown> };
	}

	/**
	 * Waits for a response file that parses. Reading and parsing happen in the same loop on
	 * purpose: writing the file is not atomic, so the first read can land mid-write. Such a file is
	 * given `settleMs` to become valid, then reported as malformed -- never accepted, never ignored.
	 */
	private async waitForResponse(
		requestPath: string,
		responsePath: string,
		respondBy: string,
		kind: ApprovalRequestKind
	): Promise<unknown> {
		const deadline = Date.now() + this.timeoutMs;
		let firstUnparsableAt: number | undefined;
		let lastParseError = '';
		for (;;) {
			if (fs.existsSync(responsePath)) {
				const raw = fs.readFileSync(responsePath, 'utf8');
				try {
					return JSON.parse(raw) as unknown;
				} catch (error) {
					lastParseError = (error as Error).message;
					firstUnparsableAt ??= Date.now();
					if (Date.now() - firstUnparsableAt >= this.settleMs) {
						throw this.invalid(
							responsePath,
							kind,
							`the file content is not valid JSON (${lastParseError})`
						);
					}
				}
			}
			if (Date.now() >= deadline) {
				throw new Error(
					`[file-approval] Timed out after ${this.timeoutMs} ms waiting for an answer.\n` +
						`  Request file : ${requestPath}\n` +
						`  Response file: ${responsePath} (does not exist)\n` +
						`  How to answer: ${respondBy}\n` +
						'No decision was made -- this step is unanswered, not denied.'
				);
			}
			await sleep(this.pollIntervalMs);
		}
	}

	/** Moves the consumed pair into `answered/` so the decision stays auditable. */
	private archive(result: ExchangeResult): void {
		const answeredDir = path.join(this.dir, ANSWERED_DIR_NAME);
		fs.mkdirSync(answeredDir, { recursive: true });
		const suffix = `${fileStamp(new Date())}-${this.sequence++}`;
		for (const [source, extension] of [
			[result.requestPath, 'request'],
			[result.responsePath, 'response'],
		] as const) {
			const base = path.basename(source, `.${extension}.json`);
			fs.renameSync(source, path.join(answeredDir, `${base}.${suffix}.${extension}.json`));
		}
	}

	private invalid(responsePath: string, kind: ApprovalRequestKind, problem: string): Error {
		return new Error(
			`[file-approval] Invalid ${kind} response in ${responsePath}: ${problem}.\n` +
				`  Expected: ${this.expectedShapeText(kind)}\n` +
				'The file was left in place for inspection. Fix it and re-run the step -- ' +
				'no default answer was assumed.'
		);
	}

	private expectedShapeText(kind: ApprovalRequestKind): string {
		switch (kind) {
			case 'approval':
				return '{"approved": true|false, "comment": "<optional string>"}';
			case 'input':
				return '{"value": "<string>"}';
			case 'choice':
				return '{"choiceId": "<one of the offered choice ids>"}';
			default:
				throw new Error(`[file-approval] Unsupported request kind: ${String(kind)}`);
		}
	}
}

interface ExchangeResult {
	requestPath: string;
	responsePath: string;
	body: Record<string, unknown>;
}

export function createFileApprovalProvider(options: FileApprovalOptions = {}): FileApprovalProvider {
	return new FileApprovalProvider(options);
}
