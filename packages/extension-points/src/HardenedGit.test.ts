import { describe, expect, it } from 'vitest';

import { HARDENED_GIT_MUTATING_CONFIG, HARDENED_GIT_READING_CONFIG, hardenedGit } from './HardenedGit.js';

const HOOKS_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';

describe('hardenedGit', () => {
	describe('reading command', () => {
		it('disables the fsmonitor command and the hooks, before the arguments of the command', () => {
			const { args } = hardenedGit(['status', '--porcelain'], { reading: true });
			expect(args).toEqual([
				'-c',
				'core.fsmonitor=false',
				'-c',
				`core.hooksPath=${HOOKS_DEVICE}`,
				'status',
				'--porcelain',
			]);
		});

		it('never uses an empty hooks path (git resolves it to the root of the drive)', () => {
			expect(HARDENED_GIT_READING_CONFIG).not.toContain('core.hooksPath=');
			expect(HARDENED_GIT_READING_CONFIG).toContain(`core.hooksPath=${HOOKS_DEVICE}`);
		});

		it('does not take the optional locks', () => {
			const { env } = hardenedGit(['status'], { reading: true, env: { PATH: '/bin' } });
			expect(env).toEqual({ PATH: '/bin', GIT_OPTIONAL_LOCKS: '0' });
		});
	});

	describe('mutating command (the hooks of the user repository keep running)', () => {
		it('disables only the fsmonitor command', () => {
			const { args } = hardenedGit(['worktree', 'add', 'x']);
			expect(args).toEqual(['-c', 'core.fsmonitor=false', 'worktree', 'add', 'x']);
			expect(args.join(' ')).not.toContain('hooksPath');
		});

		it('keeps the environment as given', () => {
			const { env } = hardenedGit(['clone'], { env: { PATH: '/bin', HOME: '/h' } });
			expect(env).toEqual({ PATH: '/bin', HOME: '/h' });
		});
	});

	it('exposes the entries per mode', () => {
		expect(HARDENED_GIT_MUTATING_CONFIG).toEqual(['core.fsmonitor=false']);
	});

	it('does not mutate the environment it is given', () => {
		const source = { PATH: '/bin' };
		hardenedGit(['status'], { reading: true, env: source });
		expect(source).toEqual({ PATH: '/bin' });
	});

	it('defaults to the environment of the process', () => {
		const { env } = hardenedGit(['status']);
		expect(env.PATH ?? env.Path).toBe(process.env.PATH ?? process.env.Path);
	});
});
