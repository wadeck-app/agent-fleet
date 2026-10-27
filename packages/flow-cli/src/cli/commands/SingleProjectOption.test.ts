import { Command } from 'commander';

import { singleProjectValue } from './SingleProjectOption';

function program(): Command {
	return new Command()
		.exitOverride()
		.configureOutput({ writeErr: () => {}, writeOut: () => {} })
		.command('probe')
		.option('-p, --project <ref>', 'project', singleProjectValue)
		.action(() => {});
}

describe('singleProjectValue', () => {
	it('takes the project given once', () => {
		const probe = program();
		probe.parse(['-p', 'my-app'], { from: 'user' });
		expect(probe.opts().project).toBe('my-app');
	});

	it('refuses a project given twice instead of silently keeping the last one', () => {
		const probe = program();
		expect(() => probe.parse(['-p', 'a', '--project', 'b'], { from: 'user' })).toThrow(
			/the project is given twice \("a" then "b"\); pass it once/
		);
	});

	it('refuses a value that looks like another option, with an actionable message', () => {
		const probe = program();
		expect(() => probe.parse(['-p', '--json'], { from: 'user' })).toThrow(
			/"--json" looks like another option, not a project; give the name, alias or id of a project after -p\/--project \("--project=--json" is refused too\)/
		);
	});
});
