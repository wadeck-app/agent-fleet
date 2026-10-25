import { defaultRegistryDir } from '@wadeck-app/project-sdk';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function insideTemp(dir: string): boolean {
	const temp = fs.realpathSync.native(os.tmpdir()).toLowerCase();
	const real = (fs.existsSync(dir) ? fs.realpathSync.native(dir) : dir).toLowerCase();
	return path.resolve(real).startsWith(path.resolve(temp));
}

describe('shared project registry under the test setup', () => {
	it('XDG_CONFIG_HOME points inside the temp dir, so the real registry is unreachable', () => {
		const value = process.env['XDG_CONFIG_HOME'];
		expect(value, 'XDG_CONFIG_HOME is not set by RegistrySafetyNet.setup.ts').toBeTruthy();
		expect(insideTemp(value!), `XDG_CONFIG_HOME=${value} is not under ${os.tmpdir()}`).toBe(true);
	});

	it('the default registry dir is inside the temp dir', () => {
		expect(insideTemp(defaultRegistryDir(process.env))).toBe(true);
	});
});
