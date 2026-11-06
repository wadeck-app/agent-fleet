import { NetworkResourceRule } from './NetworkResourceRule';
import { SandboxError } from './SandboxError';
import {
	type CreateSandboxRequest,
	type ExecRequest,
	SBX_SECRET_SERVICES,
	type SecretRequest,
	type ServiceSecretRequest,
} from './SandboxRuntime';

const SANDBOX_NAME = /^[A-Za-z0-9][A-Za-z0-9.-]+$/;
const AGENT_NAME = /^[a-z][a-z0-9-]*$/;
const MEMORY = /^([1-9]\d*)([mMgG])$/;
const ENV_VAR = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLACEHOLDER = /^[A-Za-z0-9._-]{8,}$/;
const HOST_WITHOUT_PORT = /^[A-Za-z0-9*][A-Za-z0-9.*-]*$/;

function invalid(message: string): SandboxError {
	return new SandboxError('invalid-argument', message);
}

/**
 * Rules every SandboxRuntime implementation applies to a request before doing anything. SbxCliRuntime and
 * FakeSandboxRuntime share them, so a request the fake accepts is one the real runtime accepts.
 */
export class SandboxRequestValidator {
	name(name: string): void {
		if (!SANDBOX_NAME.test(name) || name === 'default') {
			throw invalid(
				`Sandbox name "${name}" is not valid: use at least two characters (letters, digits, hyphens, periods), starting with a letter or digit; "default" is reserved.`
			);
		}
	}

	create(request: CreateSandboxRequest): void {
		this.name(request.name);
		if (!AGENT_NAME.test(request.agent)) {
			throw invalid(`Agent "${request.agent}" is not valid (lowercase letters, digits and hyphens).`);
		}
		if (!Number.isInteger(request.cpus) || request.cpus < 1) {
			throw invalid(
				`cpus must be a whole number of at least 1, got ${request.cpus}. sbx would otherwise take every host CPU.`
			);
		}
		const memory = MEMORY.exec(request.memory);
		if (memory?.[1] === undefined || memory[2] === undefined) {
			throw invalid(
				`memory "${request.memory}" must look like "512m" or "2g". sbx would otherwise take half of the host RAM.`
			);
		}
		const mebibytes = Number(memory[1]) * (memory[2].toLowerCase() === 'g' ? 1024 : 1);
		if (mebibytes < 512) {
			throw invalid(`memory "${request.memory}" is below the sbx minimum of 512m.`);
		}
		if (request.mounts.length === 0) {
			throw invalid('A sandbox needs at least one mount; without it the agent works on no host files.');
		}
		if (request.image !== undefined && !/^\S+$/.test(request.image)) {
			throw invalid(`Image "${request.image}" must be a non-empty reference without whitespace.`);
		}
	}

	exec(request: ExecRequest): void {
		this.name(request.sandbox);
		if (request.command.length === 0 || request.command.some(part => part === '')) {
			throw invalid('exec needs a non-empty command with no empty argument.');
		}
		if (request.cwd !== undefined && !request.cwd.startsWith('/')) {
			throw invalid(
				`exec cwd "${request.cwd}" must be an absolute path as seen inside the sandbox (for example /c/Users/me/workspace). ` +
					'Translate host paths with PathTranslator first.'
			);
		}
		if (request.env !== undefined) this.env(request.env);
	}

	env(env: Readonly<Record<string, string>>): void {
		for (const [name, value] of Object.entries(env)) {
			if (!ENV_VAR.test(name)) {
				throw invalid(
					`Environment variable name "${name}" is not valid (use letters, digits and underscores, not starting with a digit).`
				);
			}
			if (/[\0\r\n]/.test(value)) {
				throw invalid(
					`Environment variable "${name}" contains a newline or NUL character, which an env file cannot carry. ` +
						'Pass multi-line content through standard input or a file in the workspace instead.'
				);
			}
		}
	}

	sandboxPath(sandboxPath: string): string {
		if (!sandboxPath.startsWith('/') || /[\0\r\n]/.test(sandboxPath)) {
			throw invalid(
				`Sandbox path "${sandboxPath}" must be absolute (start with "/") as seen inside the sandbox.`
			);
		}
		return sandboxPath;
	}

	placeholder(placeholder: string): void {
		if (!PLACEHOLDER.test(placeholder)) {
			throw invalid(
				`Secret placeholder "${placeholder}" must be at least 8 characters of letters, digits, ".", "_" or "-". Generate a random one per sandbox.`
			);
		}
	}

	secret(request: SecretRequest): void {
		this.name(request.sandbox);
		if (request.hosts.length === 0) {
			throw invalid('setSecret needs at least one host.');
		}
		for (const host of request.hosts) {
			if (!HOST_WITHOUT_PORT.test(host) || NetworkResourceRule.isCatchAllHost(host)) {
				throw invalid(
					`Secret host "${host}" is not valid. sbx takes a host WITHOUT a port (for example "localhost", not ` +
						'"localhost:19001") and a catch-all pattern would send the secret to every site.'
				);
			}
		}
		if (!ENV_VAR.test(request.envVar)) {
			throw invalid(`Secret env var "${request.envVar}" is not a valid variable name.`);
		}
		this.placeholder(request.placeholder);
		if (request.valueCommand.trim() === '') {
			throw invalid('setSecret needs a valueCommand that prints the secret.');
		}
	}

	serviceSecret(request: ServiceSecretRequest): void {
		this.name(request.sandbox);
		if (!(SBX_SECRET_SERVICES as readonly string[]).includes(request.service)) {
			throw invalid(
				`Secret service "${request.service}" is not an sbx built-in service. Use one of: ${SBX_SECRET_SERVICES.join(', ')}.`
			);
		}
		if (request.value.trim() === '') {
			throw invalid(`The API key for service "${request.service}" is empty; refusing to store an empty secret.`);
		}
		if (/[\0\r\n]/.test(request.value)) {
			throw invalid(
				`The API key for service "${request.service}" contains a newline or NUL character; sbx reads it from one line of standard input.`
			);
		}
	}

	/** Returns the resources unchanged when each is an acceptable `host:port` rule. */
	resources(resources: readonly string[]): readonly string[] {
		if (resources.length === 0) {
			throw invalid('A network rule needs at least one "host:port" resource.');
		}
		for (const resource of resources) {
			const problem = NetworkResourceRule.problem(resource);
			if (problem !== undefined) {
				throw invalid(
					`Network resource "${resource}" is not valid: ${problem}. A per-sandbox rule never opens a catch-all pattern.`
				);
			}
		}
		return resources;
	}
}
