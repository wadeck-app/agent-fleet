/**
 * ModelProvider — shared interface and types for AI model CLI providers.
 *
 * Both ClaudeModelProvider and OpenCodeModelProvider implement this interface.
 * Validation utilities are also exported here so each provider can reuse them.
 */
import type { ChildProcess } from 'node:child_process';

import type { StreamJsonEventCallback } from './StreamJsonParser';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface McpServer {
	name: string;
	command: string[];
	env?: Record<string, string>;
	cwd?: string;
	enabled?: boolean;
}

export interface LaunchOptions {
	workingDir: string;
	/** used by launchBackground() only; ignored by launchInteractive() */
	prompt: string;
	stepId: string;
	model?: string;
	env?: Record<string, string>;
	mcpServers?: McpServer[];
	skipPermissions?: boolean;
	streamJson?: boolean;
	verbose?: boolean;
	resumeSessionId?: string;
	autoCompact?: boolean;
	onProcessStarted?: (process: ChildProcess) => void;
	onStreamEvent?: StreamJsonEventCallback;
}

export interface ModelInteractiveResult {
	response: string;
	exitCode: number | null;
}

export interface ModelBackgroundResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface ModelProvider {
	launchInteractive(options: LaunchOptions): Promise<ModelInteractiveResult>;
	launchBackground(options: LaunchOptions): Promise<ModelBackgroundResult>;
	kill(): void;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PromptTooLargeError extends Error {
	constructor(
		public readonly promptLength: number,
		public readonly maxLength: number
	) {
		super(`Prompt too large: ${promptLength} bytes exceeds maximum of ${maxLength} bytes`);
		this.name = 'PromptTooLargeError';
	}
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MAX_STRING_LENGTH = 2048;
const SERVER_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const ENV_KEY_REGEX = /^[A-Z_][A-Z0-9_]*$/;
const MODEL_REGEX = /^[a-zA-Z0-9_./:@-]{1,256}$/;
const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

function hasInvalidChars(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		const code = s.charCodeAt(i);
		// Null byte
		if (code === 0) return true;
		// Control chars except tab (9), LF (10), CR (13)
		if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) return true;
	}
	return false;
}

export function validateString(value: string, fieldName: string): void {
	if (value.length > MAX_STRING_LENGTH) {
		throw new Error(`Field '${fieldName}' exceeds max length of ${MAX_STRING_LENGTH} characters`);
	}
	if (hasInvalidChars(value)) {
		throw new Error(`Field '${fieldName}' contains null bytes or invalid control characters`);
	}
}

export function validateMcpServer(server: McpServer): void {
	if (!SERVER_NAME_REGEX.test(server.name)) {
		throw new Error(`McpServer name '${server.name}' must match ^[a-zA-Z0-9_-]+$`);
	}
	if (server.command.length < 1) {
		throw new Error(`McpServer '${server.name}': command must have at least 1 element`);
	}
	for (const cmd of server.command) {
		validateString(cmd, `command[] in server '${server.name}'`);
	}
	if (server.env) {
		for (const [key, value] of Object.entries(server.env)) {
			if (!ENV_KEY_REGEX.test(key)) {
				throw new Error(`McpServer '${server.name}' env key '${key}' must match ^[A-Z_][A-Z0-9_]*$`);
			}
			validateString(value, `env['${key}'] in server '${server.name}'`);
		}
	}
	if (server.cwd !== undefined) {
		validateString(server.cwd, `cwd in server '${server.name}'`);
	}
}

export function validateLaunchOptions(options: LaunchOptions): void {
	if (options.prompt.includes('\x00')) {
		throw new Error('prompt must not contain null bytes');
	}
	if (options.model !== undefined) {
		if (!MODEL_REGEX.test(options.model)) {
			throw new Error(`model '${options.model}' must match ^[a-zA-Z0-9_./:@-]{1,256}$`);
		}
	}
	if (options.resumeSessionId !== undefined) {
		if (!SESSION_ID_REGEX.test(options.resumeSessionId)) {
			throw new Error(`resumeSessionId '${options.resumeSessionId}' must match ^[a-zA-Z0-9_-]{1,128}$`);
		}
	}
	if (options.mcpServers !== undefined) {
		for (const server of options.mcpServers) {
			validateMcpServer(server);
		}
	}
}
