import * as fs from 'node:fs';
import * as path from 'node:path';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateContext, TemplateRenderer } from '../processing/TemplateRenderer';
import type { ScriptFlowStep, ScriptStepMeta, StepOutput, StepTrace } from '../types';
import type { ScriptExecutor } from './ScriptExecutor';

/** Shared output-file-writing helper used by script and model executors. */
export function writeOutputFiles(
	outputs: Record<string, unknown>,
	outputConfig: StepOutput | undefined,
	context: TemplateContext
): void {
	if (!outputConfig) return;
	const outputsDir = context.context?.outputsDir;
	if (!outputsDir) return;
	for (const [varName, config] of Object.entries(outputConfig)) {
		if (!config.writeOutput) continue;
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

export async function executeScriptStep(
	step: ScriptFlowStep,
	workspacePath: string,
	context: TemplateContext,
	stepTrace: StepTrace,
	services: {
		templateRenderer: TemplateRenderer;
		scriptExecutor: ScriptExecutor;
		outputExtractor: OutputExtractor;
	}
): Promise<StepTrace> {
	const { templateRenderer, scriptExecutor, outputExtractor } = services;

	const renderedScript = templateRenderer.render(step.script, context, true);
	stepTrace.script = renderedScript;

	const renderedEnv = step.env
		? Object.fromEntries(Object.entries(step.env).map(([k, v]) => [k, templateRenderer.render(v, context, true)]))
		: undefined;

	const workingDir = step.workingDir || workspacePath;
	const result = await scriptExecutor.execute({
		script: renderedScript,
		workingDir,
		env: renderedEnv,
		streaming: true,
		stepId: step.id,
		isolateEnv: false,
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
		stepTrace.error = `Script exited with code ${result.exitCode}`;
	}

	return stepTrace;
}
