const NETWORK_RESOURCE = /^[A-Za-z0-9*][A-Za-z0-9.*-]*:\d{1,5}$/;
const CATCH_ALL_HOSTS = new Set(['*', '**']);
const MAX_PORT = 65535;

/**
 * Validation of the `host:port` resources accepted for a per-sandbox network rule.
 *
 * A wildcard is accepted only as the whole first label of a domain with at least two more labels (`*.npmjs.org`): it
 * stands for the subdomains of a domain the operator names. `*`, `**`, `*.*`, `**.com`, `*.com` and a wildcard inside a
 * label are refused. Known limit: `*.co.uk` passes (two labels), because the list of public suffixes is not known here;
 * do not name a public suffix.
 */
export class NetworkResourceRule {
	/** Why the resource is refused, or undefined when it is acceptable. Catch-all hosts are always refused. */
	static problem(resource: string): string | undefined {
		if (!NETWORK_RESOURCE.test(resource)) {
			return 'expected "host:port" such as "localhost:19001" or "bedrock-runtime.us-east-1.amazonaws.com:443"';
		}
		const separator = resource.lastIndexOf(':');
		const port = Number(resource.slice(separator + 1));
		if (port < 1 || port > MAX_PORT) return `port ${port} is not valid (use 1 to ${MAX_PORT})`;
		return NetworkResourceRule.hostProblem(resource.slice(0, separator));
	}

	/** Why a host (without port) is refused, or undefined: the same rule for network rules and for secrets. */
	static hostProblem(host: string): string | undefined {
		if (CATCH_ALL_HOSTS.has(host)) {
			return 'catch-all patterns are refused: a rule must name the hosts it opens';
		}
		if (!host.includes('*')) return undefined;
		if (!host.startsWith('*.') || host.slice(2).includes('*')) {
			return `the wildcard in "${host}" is refused: a wildcard is accepted only as the whole first label of a domain, once ("*.example.org")`;
		}
		const domain = host.slice(2);
		if (domain.split('.').length < 2) {
			return `the wildcard "${host}" would open every host under "${domain}": name a domain you control ("*.example.org")`;
		}
		return undefined;
	}
}
