// TEST ONLY stand-in for `aws`, selected with FLOW_SANDBOX_AWS_STUB (run through node, never directly).
// Answers `configure export-credentials --profile <p> --format process` the way the AWS CLI v2 does, for three cases:
//   mock-profile  a valid process-credentials document with obviously fake values
//   expired-sso   exit 255, the stderr of an expired SSO session
//   anything else exit 255, the stderr of a missing profile
// Anything but that command line is refused (exit 2) so a changed command line fails loudly instead of passing.
const args = process.argv.slice(2);
const expected = ['configure', 'export-credentials', '--profile'];
const profile = args[3];
if (
	args.length !== 6 ||
	expected.some((word, index) => args[index] !== word) ||
	args[4] !== '--format' ||
	args[5] !== 'process'
) {
	process.stderr.write(`aws-stub: unsupported command line: ${args.join(' ')}\n`);
	process.exit(2);
}
if (profile === 'mock-profile') {
	process.stdout.write(
		JSON.stringify({
			Version: 1,
			AccessKeyId: 'AKIAFAKEFAKEFAKEFAKE',
			SecretAccessKey: 'fake-secret-access-key-of-the-aws-stub',
			SessionToken: 'fake-session-token-of-the-aws-stub',
		})
	);
	process.exit(0);
}
if (profile === 'expired-sso') {
	process.stderr.write(
		'Error loading SSO Token: Token for expired-sso has expired and refresh failed. To refresh this SSO session run aws sso login with the corresponding profile.\n'
	);
	process.exit(255);
}
process.stderr.write(`The config profile (${profile}) could not be found\n`);
process.exit(255);
