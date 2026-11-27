import fs from 'node:fs';
import path from 'node:path';

/** Name of the TEST-ONLY variable that replaces the AWS CLI by a node script. */
export const AWS_STUB_VARIABLE = 'FLOW_SANDBOX_AWS_STUB';

/** How the exporter must start the AWS CLI stand-in. */
export interface AwsStubCommand {
	awsCommand: string;
	awsPrefixArguments: string[];
}

/**
 * The TEST-ONLY replacement of the AWS CLI: when FLOW_SANDBOX_AWS_STUB names a script, it is run with node (the command runner uses no shell,
 * so a script cannot be started directly) in place of `aws`. Returns undefined when the variable is unset or empty (the real AWS CLI is used,
 * options unchanged). A set variable that does not name an existing absolute file path is an error, never a silent fall back to the real CLI.
 */
export class AwsCliStub {
	static fromEnvironment(
		env: NodeJS.ProcessEnv,
		nodeExecutable: string,
		warn: (message: string) => void
	): AwsStubCommand | undefined {
		const script = env[AWS_STUB_VARIABLE];
		if (script === undefined || script === '') return undefined;
		if (!path.isAbsolute(script) || !fs.existsSync(script)) {
			throw new Error(
				`${AWS_STUB_VARIABLE} is set to "${script}", which is not the absolute path of an existing script. This variable is for tests only: unset it in production, or give the absolute path of the stub script.`
			);
		}
		warn(
			`WARNING: ${AWS_STUB_VARIABLE} is set, so the AWS CLI is replaced by the script ${script}: no real AWS credential is resolved. This is for tests only: unset it in production.`
		);
		return { awsCommand: nodeExecutable, awsPrefixArguments: [script] };
	}
}
