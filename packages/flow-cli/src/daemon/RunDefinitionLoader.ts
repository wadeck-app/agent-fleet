import { FlowCoreError, FlowVersionError } from 'flow-core';
import type { FlowDefinitionResolver, ResolvedDefinition } from 'flow-core';
import { FlowValidator } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { ClientCommand, DaemonResponse } from '../ipc/Protocol.js';
import type { LogWriter } from '../storage/LogWriter.js';

export type LoadedDefinition = { ok: true; resolved: ResolvedDefinition } | { ok: false; response: DaemonResponse };

type RunCommandMessage = Extract<ClientCommand, { type: 'run' }>;

/** Error code of a refused version, by kind. A new kind must be given a code here (compile-time and runtime check). */
function versionRefusalCode(kind: FlowVersionError['kind']): string {
	switch (kind) {
		case 'version-invalid':
			return 'FLOW_VERSION_INVALID';
		case 'version-conflict':
			return 'FLOW_VERSION_CONFLICT';
		case 'version-not-found':
			return 'FLOW_VERSION_NOT_FOUND';
		case 'version-ambiguous':
			return 'FLOW_VERSION_AMBIGUOUS';
		case 'version-with-file':
			return 'FLOW_VERSION_WITH_FILE';
		case 'flow-not-found':
			return 'FLOW_NOT_FOUND';
		case 'registry-unreadable':
			return 'FLOW_REGISTRY_UNREADABLE';
		case 'registry-unsupported':
			return 'FLOW_REGISTRY_UNSUPPORTED';
		case 'snapshot-corrupt':
			return 'FLOW_SNAPSHOT_CORRUPT';
		default: {
			const unreachable: never = kind;
			throw new Error(`Unhandled flow version error kind: ${String(unreachable)}`);
		}
	}
}

/**
 * Turns the `flowFile` of a run request into the definition that will run: parsed, validated and version-resolved
 * (see FlowDefinitionResolver), without writing anything. Every refusal is a response, so a refused run leaves nothing behind.
 */
export class RunDefinitionLoader {
	constructor(
		private readonly resolver: FlowDefinitionResolver,
		private readonly logWriter: LogWriter
	) {}

	load(cmd: RunCommandMessage, flowFile: string): LoadedDefinition {
		try {
			return cmd.registered === true ? this.loadRegistered(cmd, flowFile) : this.loadFile(cmd, flowFile);
		} catch (err) {
			if (err instanceof FlowVersionError) {
				return refuse(versionRefusalCode(err.kind), getErrorMessage(err));
			}
			if (err instanceof FlowCoreError) {
				return refuse('FLOW_SNAPSHOT_ERROR', getErrorMessage(err));
			}
			throw err;
		}
	}

	private loadRegistered(cmd: RunCommandMessage, registryFile: string): LoadedDefinition {
		if (!cmd.flowId) {
			return refuse('FLOW_NOT_FOUND', 'A run by flow id needs the flow id (flow run <id>).');
		}
		const resolved = this.resolver.forRegistered({
			flowId: cmd.flowId,
			registryFile,
			requestedVersion: cmd.flowVersion,
		});
		return this.validated(resolved);
	}

	private loadFile(cmd: RunCommandMessage, flowFile: string): LoadedDefinition {
		if (cmd.flowVersion !== undefined) {
			throw new FlowVersionError(
				`A version can only be requested for a flow id, not for the file ${flowFile}: a file runs as it is. ` +
					`Use flow run <flow-id>@${cmd.flowVersion}.`,
				'version-with-file'
			);
		}
		if (!fs.existsSync(flowFile)) {
			this.logWriter.writeExecution('__parse', `FLOW_NOT_FOUND: ${flowFile}`, 'info');
			return refuse('FLOW_NOT_FOUND', 'Flow file not found.');
		}

		let text: string;
		let flow: FlowDefinition;
		try {
			text = fs.readFileSync(flowFile, 'utf8');
			flow = yaml.load(text, { schema: yaml.JSON_SCHEMA }) as FlowDefinition;
		} catch (err) {
			this.logWriter.writeExecution('__parse', `PARSE_ERROR detail: ${String(err)}`, 'error');
			return refuse('PARSE_ERROR', "Flow file has a YAML syntax error. Run 'flow validate' for details.");
		}
		if (!flow || typeof flow !== 'object') {
			return refuse('PARSE_ERROR', 'Flow file is empty or not a YAML object');
		}

		const invalid = validationRefusal(flow);
		if (invalid) {
			return invalid;
		}
		const resolved = this.resolver.forFile({ flowId: cmd.flowId ?? flow.id, flow, text, label: flowFile });
		return { ok: true, resolved };
	}

	private validated(resolved: ResolvedDefinition): LoadedDefinition {
		return validationRefusal(resolved.flow) ?? { ok: true, resolved };
	}
}

function validationRefusal(flow: FlowDefinition): LoadedDefinition | undefined {
	const result = new FlowValidator(undefined).validate(flow);
	if (result.valid) {
		return undefined;
	}
	return refuse(
		'VALIDATION_FAILED',
		JSON.stringify(result.issues.filter((i: { severity: string }) => i.severity === 'error'))
	);
}

function refuse(code: string, message: string): { ok: false; response: DaemonResponse } {
	return { ok: false, response: { type: 'error', code, message } };
}
