import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import { VmProxyEnvironment } from './VmProxyEnvironment';

const VM_ENV = [
	'PATH=/usr/bin',
	'HTTPS_PROXY=http://gateway.docker.internal:3128',
	'HTTP_PROXY=http://gateway.docker.internal:3128',
	'https_proxy=http://gateway.docker.internal:3128',
	'NO_PROXY=localhost,127.0.0.1',
	'NODE_USE_ENV_PROXY=1',
	'NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt',
	'GH_TOKEN=gho_sbxproxymanaged000000000000000000000',
	'PROXY_CA_CERT_B64=AAAA',
	'EMPTY_LINE_FOLLOWS',
	'',
].join('\n');

describe('VmProxyEnvironment', () => {
	it('keeps the proxy variables of the VM and nothing else', () => {
		expect(VmProxyEnvironment.parse('box', VM_ENV)).toEqual({
			HTTPS_PROXY: 'http://gateway.docker.internal:3128',
			HTTP_PROXY: 'http://gateway.docker.internal:3128',
			https_proxy: 'http://gateway.docker.internal:3128',
			NO_PROXY: 'localhost,127.0.0.1',
			NODE_USE_ENV_PROXY: '1',
			NODE_EXTRA_CA_CERTS: '/etc/ssl/certs/ca-certificates.crt',
		});
	});

	it('keeps a value that contains an equals sign', () => {
		expect(VmProxyEnvironment.parse('box', 'HTTPS_PROXY=http://h:1/?a=b\r\n').HTTPS_PROXY).toBe('http://h:1/?a=b');
	});

	it('accepts a lowercase https_proxy alone', () => {
		expect(VmProxyEnvironment.parse('box', 'https_proxy=http://h:1')).toEqual({ https_proxy: 'http://h:1' });
	});

	it('fails loudly, naming the sandbox and the command to look at, when the VM has no HTTPS_PROXY', () => {
		expect(() => VmProxyEnvironment.parse('flow-sbx-h1-run1', 'PATH=/usr/bin\n')).toThrow(SandboxError);
		expect(() => VmProxyEnvironment.parse('flow-sbx-h1-run1', 'PATH=/usr/bin\n')).toThrow(
			/flow-sbx-h1-run1[\s\S]*bypass the sbx proxy[\s\S]*sbx exec flow-sbx-h1-run1 env/
		);
	});
});
