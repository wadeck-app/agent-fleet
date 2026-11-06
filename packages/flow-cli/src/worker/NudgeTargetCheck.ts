/** Longest nudged address looked at; a real one is a few dozen characters. */
const MAX_NUDGED_URL_LENGTH = 512;

export type NudgeTargetVerdict =
	| { accepted: true }
	| {
			accepted: false;
			/** `host:port` of the nudged address when it parses, never userinfo, path or query. */
			nudgedHostPort: string | undefined;
			/** `host:port` of the trusted address when it parses. */
			trustedHostPort: string | undefined;
	  };

interface Endpoint {
	protocol: string;
	hostPort: string;
}

function endpointOf(raw: string): Endpoint | undefined {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return undefined;
	}
	if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
		return undefined;
	}
	const port = url.port === '' ? (url.protocol === 'wss:' ? '443' : '80') : url.port;
	return { protocol: url.protocol, hostPort: `${url.hostname}:${port}` };
}

/**
 * Decides whether a nudged WebSocket address is the one the worker already trusts.
 *
 * Accepted only when it is ws:/wss: with no userinfo, and scheme, host and port all equal the trusted address. Path,
 * query and fragment are not compared: the caller dials the trusted address, never the nudged text.
 */
export function checkNudgeTarget(nudged: string, trusted: string): NudgeTargetVerdict {
	const trustedEndpoint = endpointOf(trusted);
	const nudgedEndpoint = nudged.length > MAX_NUDGED_URL_LENGTH ? undefined : endpointOf(nudged);
	const refused: NudgeTargetVerdict = {
		accepted: false,
		nudgedHostPort: nudgedEndpoint?.hostPort,
		trustedHostPort: trustedEndpoint?.hostPort,
	};
	if (trustedEndpoint === undefined || nudgedEndpoint === undefined) {
		return refused;
	}
	const parsed = new URL(nudged);
	if (parsed.username !== '' || parsed.password !== '') {
		return refused;
	}
	if (nudgedEndpoint.protocol !== trustedEndpoint.protocol || nudgedEndpoint.hostPort !== trustedEndpoint.hostPort) {
		return refused;
	}
	return { accepted: true };
}

/** `host:port` of a nudged address for logging (never userinfo, path or query), or undefined when it is not a ws(s) URL. */
export function hostPortOf(nudged: string): string | undefined {
	return nudged.length > MAX_NUDGED_URL_LENGTH ? undefined : endpointOf(nudged)?.hostPort;
}
