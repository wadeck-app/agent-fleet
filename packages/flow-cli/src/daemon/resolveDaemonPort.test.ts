import { resolveDaemonPort } from './resolveDaemonPort';

describe('resolveDaemonPort', () => {
	it('leaves the standard port alone when the variable is absent', () => {
		expect(resolveDaemonPort({})).toBeUndefined();
	});

	it('leaves the standard port alone when the variable is empty', () => {
		expect(resolveDaemonPort({ FLOW_DAEMON_PORT: '' })).toBeUndefined();
	});

	it.each([
		['0', 0],
		['47900', 47900],
		['65535', 65535],
	])('reads %s', (raw, expected) => {
		expect(resolveDaemonPort({ FLOW_DAEMON_PORT: raw })).toBe(expected);
	});

	it.each(['abc', '-1', '65536', '12.5', '1e3', ' 80', '0x50'])(
		'rejects %j and names the variable and the accepted range',
		raw => {
			expect(() => resolveDaemonPort({ FLOW_DAEMON_PORT: raw })).toThrow(/FLOW_DAEMON_PORT.*0.*65535/);
		}
	);
});
