import { FlowCoreError, FlowVersionError } from 'flow-core';
import type { FlowDefinitionResolver, ResolvedDefinition, VersionChoice } from 'flow-core';
import { FlowValidator, type HostToolsConfinementPolicy } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine/types';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { ClientCommand, DaemonResponse } from '../ipc/Protocol.js';
import type { LogWriter } from '../storage/LogWriter.js';
import { surfacedWarningsOf } from '../validation/SurfacedWarnings.js';

/** `warnings`: what `flow validate` would print for the accepted flow (surfaced engine warnings), one line each, for the run to tell. */
export type LoadedDefinition =
	{ ok: true; resolved: ResolvedDefinition; warnings: string[] } | { ok: false; response: DaemonResponse };

type Refused = Extract<LoadedDefinition, { ok: false }>;
type Checked = Refused | { ok: true; warnings: string[] };

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
		private readonly logWriter: LogWriter,
		private readonly guarantees?: { entries(): string[]; unread(): string[] },
		/** What `validation.hostToolsUnderConfinedProfile` says (warning or refusal for hostTools under a confined profile); absent: the finding says the setting was not consulted. */
		private readonly hostToolsPolicy?: HostToolsConfinementPolicy
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

	/**
	 * The definition a run was accepted with, read back from its snapshot (a waiting run that starts again after a daemon
	 * restart): the file or registry may have changed since, and the run must be the one that was accepted.
	 */
	loadSnapshot(snapshotRef: string, choice: VersionChoice): LoadedDefinition {
		try {
			// Requirements are not checked against the sources here: the run was accepted with them, the sources may not be
			// read yet at startup, and the dispatcher fails a step that nothing can serve.
			return this.validated(this.resolver.forSnapshotRef(snapshotRef, choice), false);
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

		const checked = this.check(flow);
		if (!checked.ok) {
			return checked;
		}
		const resolved = this.resolver.forFile({ flowId: cmd.flowId ?? flow.id, flow, text, label: flowFile });
		return { ok: true, resolved, warnings: checked.warnings };
	}

	private validated(resolved: ResolvedDefinition, checkRequirements = true): LoadedDefinition {
		const checked = this.check(resolved.flow, checkRequirements);
		return checked.ok ? { ok: true, resolved, warnings: checked.warnings } : checked;
	}

	private check(flow: FlowDefinition, checkRequirements = true): Checked {
		// The validator annotates the flow it is given (`_autoDiscoveredInputs`). It gets a copy: the hash, the snapshot text and the
		// definition that runs must all describe the object as written, or a stored snapshot never matches its hash again.
		const usesRequirements = hasRequirements(flow);
		const knownGuarantees = checkRequirements && usesRequirements ? this.guarantees?.entries() : undefined;
		const result = new FlowValidator(undefined, [], knownGuarantees, this.hostToolsPolicy).validate(
			structuredClone(flow)
		);
		if (result.valid) {
			return { ok: true, warnings: surfacedWarningsOf(result.issues) };
		}
		const errors = JSON.stringify(result.issues.filter((i: { severity: string }) => i.severity === 'error'));
		const unread = knownGuarantees === undefined ? [] : (this.guarantees?.unread() ?? []);
		if (unread.length > 0) {
			// A requirement may look unknown only because the source that provides it could not be read: say so.
			return refuse(
				'REQUIREMENT_SOURCES_UNREADABLE',
				`The flow's requires could not be checked against every declared worker source: the guarantees declared by ${unread.join(', ')} could not be read (see the daemon log). ` +
					`Fix the plugin manifest of these sources (flow worker source list), then run the flow again. Issues found: ${errors}`
			);
		}
		return refuse('VALIDATION_FAILED', errors);
	}
}

/**
 * Whether the flow or one of its steps declares `requires` or a `profile` (which expands to requirements). Asked before
 * validation, so it trusts nothing about the shape.
 */
function hasRequirements(flow: FlowDefinition): boolean {
	const steps: unknown = flow.steps;
	return (
		flow.requires !== undefined ||
		flow.profile !== undefined ||
		(Array.isArray(steps) &&
			steps.some(step => {
				const declared = step as { requires?: unknown; profile?: unknown } | null;
				return declared?.requires !== undefined || declared?.profile !== undefined;
			}))
	);
}

function refuse(code: string, message: string): { ok: false; response: DaemonResponse } {
	return { ok: false, response: { type: 'error', code, message } };
}
