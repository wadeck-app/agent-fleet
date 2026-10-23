import { describeCommandLine } from './CommandLineLog';

// Built at runtime from parts: a literal would trip secret scanners on the source file.
const VALUE = ['tk', '_Ab3xY9', 'Q7z'].join('');

describe('describeCommandLine', () => {
	it('keeps the command and its other arguments', () => {
		expect(describeCommandLine(['run', 'flow.yml', '--wait'])).toBe('cmd: flow run flow.yml --wait');
	});

	it.each([
		[['run', 'f.yml', '-i', `T=${VALUE}`], 'cmd: flow run f.yml -i T=<value omitted>'],
		[['run', 'f.yml', '--input', `T=${VALUE}`], 'cmd: flow run f.yml --input T=<value omitted>'],
		[['run', 'f.yml', '--inputs', `T=${VALUE}`], 'cmd: flow run f.yml --inputs T=<value omitted>'],
		[['run', 'f.yml', `--input=T=${VALUE}`], 'cmd: flow run f.yml --input=T=<value omitted>'],
		[['run', 'f.yml', `-iT=${VALUE}`], 'cmd: flow run f.yml -iT=<value omitted>'],
	])('omits the value of an input given as %j', (args, expected) => {
		const line = describeCommandLine(args);
		expect(line).toBe(expected);
		expect(line).not.toContain(VALUE);
	});

	it('omits a value even when the option has no key=value shape', () => {
		expect(describeCommandLine(['run', 'f.yml', '-i', VALUE])).toBe('cmd: flow run f.yml -i <value omitted>');
	});

	it('handles several inputs', () => {
		expect(describeCommandLine(['run', 'f.yml', '-i', 'a=1', '-i', 'b=2'])).toBe(
			'cmd: flow run f.yml -i a=<value omitted> -i b=<value omitted>'
		);
	});
});
