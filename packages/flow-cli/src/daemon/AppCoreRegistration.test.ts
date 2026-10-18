import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_CORE_MODULE_ID, type AppCoreDiagnostic, registerWithAppCore } from './AppCoreRegistration.js';

const sdk = vi.hoisted(() => ({
	registerModule: vi.fn(),
	describeRegistration: vi.fn(),
	describeRegistrationFailure: vi.fn(),
}));
vi.mock('@wadeck-app/app-core-sdk/register', () => sdk);

let lines: AppCoreDiagnostic[];
const log = (entry: AppCoreDiagnostic): void => {
	lines.push(entry);
};

beforeEach(() => {
	lines = [];
});

describe('registerWithAppCore', () => {
	it('registers the module under the id "flow" with the given manifest and logs what app-core answered', async () => {
		const outcome = { status: 'registered', port: 4850 };
		sdk.registerModule.mockResolvedValue(outcome);
		sdk.describeRegistration.mockReturnValue('app-core: module "flow" registered on port 4850');

		await registerWithAppCore('/abs/manifest.json', log);

		expect(APP_CORE_MODULE_ID).toBe('flow');
		expect(sdk.registerModule).toHaveBeenCalledWith({ id: 'flow', manifestPath: '/abs/manifest.json' });
		expect(sdk.describeRegistration).toHaveBeenCalledWith(outcome, 'flow');
		expect(lines).toEqual([
			{
				level: 'info',
				source: 'AppCoreRegistration',
				message: 'app-core: module "flow" registered on port 4850',
			},
		]);
	});

	it.each(['deferred', 'skipped'])(
		'logs %s (app-core not running or not installed) as information: it is a normal state, but never silent',
		async status => {
			sdk.registerModule.mockResolvedValue({ status });
			sdk.describeRegistration.mockReturnValue(`app-core: ${status}`);

			await registerWithAppCore('/abs/manifest.json', log);

			expect(lines).toEqual([{ level: 'info', source: 'AppCoreRegistration', message: `app-core: ${status}` }]);
		}
	);

	it("logs app-core's own reason as an error when it refuses the module", async () => {
		sdk.registerModule.mockResolvedValue({
			status: 'refused',
			port: 4850,
			httpStatus: 400,
			reason: 'bad manifest',
		});
		sdk.describeRegistration.mockReturnValue('app-core refused module "flow" (HTTP 400): bad manifest');

		await registerWithAppCore('/abs/manifest.json', log);

		expect(lines).toEqual([
			{
				level: 'error',
				source: 'AppCoreRegistration',
				message: 'app-core refused module "flow" (HTTP 400): bad manifest',
			},
		]);
	});

	it('logs the failure as an error and does not throw when the SDK rejects (invalid APP_CORE_PORT, missing manifest)', async () => {
		sdk.registerModule.mockRejectedValue(new Error('APP_CORE_PORT "abc" is not a port'));
		sdk.describeRegistrationFailure.mockReturnValue(
			'app-core: could not register: APP_CORE_PORT "abc" is not a port'
		);

		await expect(registerWithAppCore('/abs/manifest.json', log)).resolves.toBeUndefined();

		expect(lines).toEqual([
			{
				level: 'error',
				source: 'AppCoreRegistration',
				message: 'app-core: could not register: APP_CORE_PORT "abc" is not a port',
			},
		]);
	});

	it('does not throw either when the diagnostic sink itself throws', async () => {
		sdk.registerModule.mockResolvedValue({ status: 'registered', port: 1 });
		sdk.describeRegistration.mockReturnValue('ok');

		await expect(
			registerWithAppCore('/abs/manifest.json', () => {
				throw new Error('disk full');
			})
		).resolves.toBeUndefined();
	});
});
