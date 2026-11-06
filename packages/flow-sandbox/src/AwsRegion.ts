import { SandboxError } from './SandboxError';

const AWS_REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;

/** Returns the region when it has the form of an AWS region (for example `us-east-1`), otherwise throws. */
export function requireAwsRegion(region: string): string {
	if (!AWS_REGION.test(region)) {
		throw new SandboxError(
			'invalid-argument',
			`AWS region "${region}" is not valid (expected for example "us-east-1"); it is part of the host names that get opened.`
		);
	}
	return region;
}
