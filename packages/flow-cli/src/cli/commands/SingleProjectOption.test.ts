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
});
