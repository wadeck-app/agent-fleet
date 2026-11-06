import { SandboxError } from '../SandboxError';

/**
 * Variables of the VM that make a process use the sbx proxy (HTTP(S)_PROXY and friends) and trust its CA.
 * None of them is a secret. They are NOT in the environment a model step gets: the flow worker starts the model CLI
 * with an isolated environment (PATH, HOME and the step `env` only), so without them the CLI and every helper it runs
 * (the `credential_process` script, curl) connect DIRECTLY, bypassing the proxy: the placeholder of a custom secret is
 * not substituted (the credential endpoint answers 403 "unknown bearer secret") and the network policy is not applied.
 */
export const VM_PROXY_VARIABLES = [
	'HTTP_PROXY',
	'HTTPS_PROXY',
	'http_proxy',
	'https_proxy',
	'NO_PROXY',
	'no_proxy',
	'NODE_USE_ENV_PROXY',
	'NODE_EXTRA_CA_CERTS',
	'SSL_CERT_FILE',
	'CURL_CA_BUNDLE',
	'REQUESTS_CA_BUNDLE',
] as const;

/**
 * Reads the proxy variables out of the output of `env` run in the VM. Throws when the VM has no HTTPS_PROXY: the
 * model steps would then bypass the proxy silently, which is the failure this class exists to make loud.
 */
export class VmProxyEnvironment {
	static parse(sandbox: string, envOutput: string): Record<string, string> {
		const wanted = new Set<string>(VM_PROXY_VARIABLES);
		const found: Record<string, string> = {};
		for (const line of envOutput.split(/\r?\n/)) {
			const separator = line.indexOf('=');
			if (separator < 1) continue;
			const name = line.slice(0, separator);
			if (wanted.has(name)) found[name] = line.slice(separator + 1);
		}
		if (found['HTTPS_PROXY'] === undefined && found['https_proxy'] === undefined) {
			throw new SandboxError(
				'command-failed',
				`The sandbox "${sandbox}" has no HTTPS_PROXY in its environment, so its model steps would bypass the sbx proxy: the credential placeholders would not be substituted and the network policy would not apply to them. Check \`sbx exec ${sandbox} env\` and the sbx version (pinned: see PinnedSbxVersion).`,
				{ sandbox }
			);
		}
		return found;
	}
}
