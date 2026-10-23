import * as fs from 'node:fs';
import * as path from 'node:path';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { ScriptFlowStep, ScriptStepMeta, StepOutput, StepTrace } from '../types';
import type { ScriptExecutor } from './ScriptExecutor';
import { ScriptFailureMessageBuilder } from './ScriptFailureMessageBuilder';

/** Shared output-file-writing helper used by script and model executors. */
export function writeOutputFiles(
	outputs: Record<string, unknown>,
	outputConfig: StepOutput | undefined,
	context: TemplateContext
): void {
	if (!outputConfig) {
		return;
	}
	const outputsDir = context.context?.outputsDir;
	if (!outputsDir) {
		return;
	}
	for (const [varName, config] of Object.entries(outputConfig)) {
		if (!config.writeOutput) {
			continue;
		}
		const relPath = config.writeOutput;
		const normalized = path.normalize(relPath);
		if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
			throw new Error(`writeOutput path '${relPath}' is invalid: must be a relative path`);
		}
		const filePath = path.join(outputsDir, normalized);
		const value = outputs[varName];
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, value != null ? String(value) : '', 'utf8');
	}
}

/**
 * Adds the step's declared secrets to its environment AFTER the rendered step env (explicit secrets win).
 * Fails fast when the executing worker did not supply one. Values are never logged or put in messages.
 */
function withSecrets(
	step: ScriptFlowStep,
	renderedEnv: Record<string, string> | undefined,
	context: TemplateContext
): Record<string, string> | undefined {
	if (!step.secrets || step.secrets.length === 0) {
		return renderedEnv;
	}
	const env = { ...renderedEnv };
	for (const name of step.secrets) {
		const value = context.secrets?.[name];
		if (value === undefined) {
			throw new Error(
				`Step '${step.id}' declares secret '${name}' but the executing worker did not receive it. ` +
					`Update flow-cli on that worker (it may predate secret inputs) and check that '${name}' was supplied for this run.`
			);
		}
		env[name] = value;
	}
	return env;
}

export async function executeScriptStep(
	step: ScriptFlowStep,
	workspacePath: string,
	context: TemplateContext,
	stepTrace: StepTrace,
	services: {
		templateRenderer: TemplateRenderer;
		scriptExecutor: ScriptExecutor;
		outputExtractor: OutputExtractor;
	},
	failureMessageBuilder: ScriptFailureMessageBuilder = new ScriptFailureMessageBuilder()
): Promise<StepTrace> {
	const { templateRenderer, scriptExecutor, outputExtractor } = services;

	const renderedScript = templateRenderer.render(step.script, context, true);
	stepTrace.script = renderedScript;

	const renderedEnv = withSecrets(
		step,
		step.env
			? Object.fromEntries(
					Object.entries(step.env).map(([k, v]) => [k, templateRenderer.render(v, context, true)])
				)
			: undefined,
		context
	);

	const workingDir = step.workingDir ?? context.context?.['workingDir'] ?? workspacePath;
	const result = await scriptExecutor.execute({
		script: renderedScript,
		workingDir,
		env: renderedEnv,
		streaming: true,
		stepId: step.id,
		isolateEnv: false,
		strict: step.strict,
		shellKind: step.shell,
	});

	stepTrace.exitCode = result.exitCode;
	stepTrace.stdout = result.stdout;
	stepTrace.stderr = result.stderr;
	stepTrace.endTime = Date.now();
	stepTrace.durationMs = result.durationMs;

	const outputs = outputExtractor.extract(result.stdout, step.output, step.id, {
		exitCode: result.exitCode,
		stdout: result.stdout,
		stderr: result.stderr,
		success: result.success,
	});

	stepTrace.outputs = outputs;
	writeOutputFiles(outputs, step.output, context);

	const scriptMeta: ScriptStepMeta = {
		exit_code: result.exitCode,
		duration_ms: result.durationMs,
	};
	stepTrace.meta = scriptMeta;

	if (!result.success) {
		stepTrace.error = await failureMessageBuilder.build({ ...result, script: renderedScript });
	}

	return stepTrace;
}
