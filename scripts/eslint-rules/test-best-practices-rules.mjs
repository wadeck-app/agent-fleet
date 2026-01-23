/**
 * ===========================================================================================
 * CUSTOM ESLINT RULES - TEST BEST PRACTICES
 * ===========================================================================================
 *
 * Rules to enforce deterministic, maintainable test patterns.
 *
 * Rules:
 * - no-settimeout-in-tests: Prevents setTimeout in test files
 *
 * ===========================================================================================
 */

/**
 * Rule: no-settimeout-in-tests
 * Prevents setTimeout usage in test files as it makes tests non-deterministic and slow.
 * Encourages use of deferred promises or waitFor() for async behavior.
 */
const noSetTimeoutInTests = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Prevent setTimeout in test files - use deferred promises instead',
			category: 'Best Practices',
			recommended: true,
		},
		messages: {
			noSetTimeout: [
				'setTimeout in tests is forbidden - it makes tests non-deterministic and slow.',
				'Use createDeferredPromise() from @framework/test-utils/deferredPromise for deterministic async control.',
				'',
				'Example:',
				'  // ❌ BAD',
				'  await new Promise(resolve => setTimeout(resolve, 100));',
				'',
				'  // ✅ GOOD',
				'  const deferred = createDeferredPromise();',
				'  vi.mocked(api.call).mockReturnValue(deferred.promise);',
				'  // ... test loading state ...',
				'  deferred.resolve(data);',
				'  await waitFor(() => expect(...));',
			].join('\n'),
		},
		schema: [],
	},
	create(context) {
		const filename = context.getFilename();

		// Only apply to test files
		if (!filename.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
			return {};
		}

		return {
			// Detect setTimeout calls
			CallExpression(node) {
				// Direct setTimeout call
				if (node.callee?.name === 'setTimeout') {
					context.report({
						node,
						messageId: 'noSetTimeout',
					});
					return;
				}

				// global.setTimeout or window.setTimeout
				if (
					node.callee?.type === 'MemberExpression' &&
					node.callee.property?.name === 'setTimeout' &&
					(node.callee.object?.name === 'global' || node.callee.object?.name === 'window')
				) {
					context.report({
						node,
						messageId: 'noSetTimeout',
					});
				}
			},

			// Detect new Promise((resolve) => setTimeout(...))
			NewExpression(node) {
				if (node.callee?.name !== 'Promise') {
					return;
				}

				// Check if the Promise callback uses setTimeout
				const callback = node.arguments?.[0];
				if (!callback || callback.type !== 'ArrowFunctionExpression') {
					return;
				}

				// Check if body contains setTimeout
				const body = callback.body;
				if (body.type === 'CallExpression') {
					// Arrow function with single expression: (resolve) => setTimeout(resolve, 100)
					if (
						body.callee?.name === 'setTimeout' ||
						(body.callee?.type === 'MemberExpression' && body.callee.property?.name === 'setTimeout')
					) {
						context.report({
							node,
							messageId: 'noSetTimeout',
						});
					}
				} else if (body.type === 'BlockStatement') {
					// Arrow function with block: (resolve) => { setTimeout(resolve, 100) }
					const hasSetTimeout = statement => {
						if (!statement) return false;

						if (statement.type === 'ExpressionStatement') {
							const expr = statement.expression;
							if (
								expr.type === 'CallExpression' &&
								(expr.callee?.name === 'setTimeout' ||
									(expr.callee?.type === 'MemberExpression' &&
										expr.callee.property?.name === 'setTimeout'))
							) {
								return true;
							}
						}

						// Recursively check nested blocks
						if (statement.body && Array.isArray(statement.body)) {
							return statement.body.some(hasSetTimeout);
						}
						if (statement.consequent) {
							return hasSetTimeout(statement.consequent);
						}
						if (statement.alternate) {
							return hasSetTimeout(statement.alternate);
						}

						return false;
					};

					if (body.body.some(hasSetTimeout)) {
						context.report({
							node,
							messageId: 'noSetTimeout',
						});
					}
				}
			},
		};
	},
};

export default {
	rules: {
		'no-settimeout-in-tests': noSetTimeoutInTests,
	},
};
