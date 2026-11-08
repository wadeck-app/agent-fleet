import { describe, expect, it } from 'vitest';

import {
	blankFilterDriverConfig,
	FILTER_DRIVER_LISTING_ARGS,
	FilterDriverListingError,
	parseUntrustedFilterDriverNames,
} from './HardenedGitFilters.js';

/** `git config --show-scope --get-regexp -z`: `scope NUL key [LF value] NUL`. */
const entry = (scope: string, key: string, value?: string): string =>
	`${scope}\0${key}${value === undefined ? '' : `\n${value}`}\0`;

describe('parseUntrustedFilterDriverNames', () => {
	it('returns no name for an empty listing', () => {
		expect(parseUntrustedFilterDriverNames('')).toEqual([]);
	});

	it('keeps the drivers declared in the repository, once each', () => {
		const output =
			entry('local', 'filter.a.clean', 'x') + entry('local', 'filter.a.smudge', 'y') + entry('worktree', 'filter.b.process', 'z');
		expect(parseUntrustedFilterDriverNames(output)).toEqual(['a', 'b']);
	});

	it('trusts the system and global configuration of the user (git-lfs)', () => {
		const output = entry('global', 'filter.lfs.clean', 'git-lfs clean -- %f') + entry('system', 'filter.lfs.required', 'true');
		expect(parseUntrustedFilterDriverNames(output)).toEqual([]);
	});

	it('blanks a driver of the user when the repository redefines it', () => {
		const output = entry('global', 'filter.lfs.clean', 'git-lfs clean') + entry('local', 'filter.lfs.clean', 'evil');
		expect(parseUntrustedFilterDriverNames(output)).toEqual(['lfs']);
	});

	it('takes the variable from the last dot segment, so a name may contain dots', () => {
		expect(parseUntrustedFilterDriverNames(entry('local', 'filter.my.dotted.name.clean', 'x'))).toEqual(['my.dotted.name']);
	});

	it('keeps odd characters of a name, including a newline in a value', () => {
		const output = entry('local', 'filter.we ird$name.clean', 'a\nb');
		expect(parseUntrustedFilterDriverNames(output)).toEqual(['we ird$name']);
	});

	it('handles a key without a value', () => {
		expect(parseUntrustedFilterDriverNames(entry('local', 'filter.a.required'))).toEqual(['a']);
	});

	it('ignores a key without a name (not a driver: git never reads it)', () => {
		expect(parseUntrustedFilterDriverNames(entry('local', 'filter.something', '1'))).toEqual([]);
	});

	it('fails on a name that cannot be written as a -c entry', () => {
		expect(() => parseUntrustedFilterDriverNames(entry('local', 'filter.a=b.clean', 'x'))).toThrow(FilterDriverListingError);
		expect(() => parseUntrustedFilterDriverNames(entry('local', 'filter.a=b.clean', 'x'))).toThrow(/a=b/);
	});

	it('fails on a record that has no scope', () => {
		expect(() => parseUntrustedFilterDriverNames('filter.a.clean\nx\0')).toThrow(FilterDriverListingError);
	});
});

describe('blankFilterDriverConfig', () => {
	it('disables clean, smudge and process, and does not fail when the filter is required', () => {
		expect(blankFilterDriverConfig(['a'])).toEqual([
			'filter.a.clean=',
			'filter.a.smudge=',
			'filter.a.process=',
			'filter.a.required=false',
		]);
	});

	it('returns nothing without drivers', () => {
		expect(blankFilterDriverConfig([])).toEqual([]);
	});
});

describe('FILTER_DRIVER_LISTING_ARGS', () => {
	it('is a pure configuration read with the scope of every entry', () => {
		expect(FILTER_DRIVER_LISTING_ARGS).toEqual(['config', '--show-scope', '--get-regexp', '-z', '^filter\\.']);
	});
});
