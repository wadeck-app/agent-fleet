const NETWORK_RESOURCE = /^[A-Za-z0-9*][A-Za-z0-9.*-]*:\d{1,5}$/;
const CATCH_ALL_HOSTS = new Set(['*', '**']);

/** Validation of the `host:port` resources accepted for a per-sandbox network rule. */
export class NetworkResourceRule {
	/** Why the resource is refused, or undefined when it is acceptable. Catch-all hosts are always refused. */
	static problem(resource: string): string | undefined {
		if (!NETWORK_RESOURCE.test(resource)) {
			return 'expected "host:port" such as "localhost:19001" or "bedrock-runtime.us-east-1.amazonaws.com:443"';
		}
		const host = resource.slice(0, resource.lastIndexOf(':'));
		if (CATCH_ALL_HOSTS.has(host)) {
			return 'catch-all patterns are refused: a rule must name the hosts it opens';
		}
		return undefined;
	}

	/** Same rule for a host that must not carry a port (secrets). */
	static isCatchAllHost(host: string): boolean {
		return CATCH_ALL_HOSTS.has(host);
	}
}
