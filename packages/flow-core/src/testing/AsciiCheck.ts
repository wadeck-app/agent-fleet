import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_ASCII_CODE = 127;

/** Every file under `directory`, recursively. */
export function filesUnder(directory: string): string[] {
	return readdirSync(directory).flatMap(name => {
		const path = join(directory, name);
		return statSync(path).isDirectory() ? filesUnder(path) : [path];
	});
}

/** The lines of `file` holding a character above 127 (emoji, arrow, bullet, ellipsis...), as "<number>: <text>". */
export function nonAsciiLines(file: string): string[] {
	return readFileSync(file, 'utf8')
		.split('\n')
		.map((line, index) => ({ line, number: index + 1 }))
		.filter(({ line }) => [...line].some(char => char.charCodeAt(0) > MAX_ASCII_CODE))
		.map(({ line, number }) => `${number}: ${line.trim()}`);
}
