module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'import'],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:import/recommended',
		'plugin:import/typescript',
	],
	settings: {
		'import/resolver': {
			typescript: {
				project: './tsconfig.base.json',
			},
		},
	},
	rules: {
		// Enforce import restrictions based on dependency matrix
		'import/no-restricted-paths': [
			'error',
			{
				zones: [
					// orchestrator can only import allowed packages
					{
						target: './packages/orchestrator/src',
						from: './packages',
						except: [
							'shared-orch-worker/src',
							'shared-orch-backend/src',
							'shared-common/src',
							'flow-engine/src',
							'test-utils/src',
						],
					},
					// worker can only import allowed packages
					{
						target: './packages/worker/src',
						from: './packages',
						except: ['shared-orch-worker/src', 'shared-common/src', 'flow-engine/src', 'test-utils/src'],
					},
					// flow-engine can only import shared-common
					{
						target: './packages/flow-engine/src',
						from: './packages',
						except: ['shared-common/src', 'test-utils/src'],
					},
					// web-backend can only import allowed packages
					{
						target: './packages/web-backend/src',
						from: './packages',
						except: [
							'shared-frontend-backend/src',
							'shared-orch-backend/src',
							'shared-common/src',
							'test-utils/src',
						],
					},
					// web-frontend can only import shared-frontend-backend
					{
						target: './packages/web-frontend/src',
						from: './packages',
						except: ['shared-frontend-backend/src'],
					},
					// shared-common cannot import anything
					{
						target: './packages/shared-common/src',
						from: './packages',
						except: [],
					},
					// shared-* can only import shared-common
					{
						target: './packages/shared-orch-worker/src',
						from: './packages',
						except: ['shared-common/src'],
					},
					{
						target: './packages/shared-frontend-backend/src',
						from: './packages',
						except: ['shared-common/src'],
					},
					{
						target: './packages/shared-orch-backend/src',
						from: './packages',
						except: ['shared-common/src'],
					},
					// test-utils can only import shared-common
					{
						target: './packages/test-utils/src',
						from: './packages',
						except: ['shared-common/src'],
					},
				],
			},
		],
	},
};
