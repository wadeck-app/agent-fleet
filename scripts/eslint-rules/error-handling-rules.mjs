/**
 * Custom ESLint rules for error handling best practices
 */

/**
 * Rule: require-get-error-message
 * Prevents direct access to error.message in UI code
 * Enforces use of getErrorMessage(error) utility
 */
const requireGetErrorMessage = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Require getErrorMessage() instead of direct error.message access',
			category: 'Best Practices',
			recommended: true,
		},
		messages: {
			useGetErrorMessage:
				'Use getErrorMessage(error) from @framework/utils/errors/errorUtils instead of accessing error.message directly. This ensures proper formatting of API validation errors.',
		},
		fixable: 'code',
		schema: [],
	},
	create(context) {
		return {
			MemberExpression(node) {
				// Check if accessing .message property
				if (node.property?.name !== 'message') {
					return;
				}

				// Check if the object is named 'error', 'err', or 'e'
				const objectName = node.object?.name;
				if (!['error', 'err', 'e'].includes(objectName)) {
					return;
				}

				// Check if we're inside a catch block
				let parent = node.parent;
				let inCatchBlock = false;
				while (parent) {
					if (parent.type === 'CatchClause') {
						inCatchBlock = true;
						break;
					}
					parent = parent.parent;
				}

				if (!inCatchBlock) {
					return;
				}

				// Skip if inside console.error or console.log (logging is fine)
				let currentParent = node.parent;
				while (currentParent) {
					if (
						currentParent.type === 'CallExpression' &&
						currentParent.callee?.type === 'MemberExpression' &&
						currentParent.callee.object?.name === 'console' &&
						['error', 'log', 'warn'].includes(currentParent.callee.property?.name)
					) {
						return; // Allow in console statements
					}
					currentParent = currentParent.parent;
				}

				// Report the error
				context.report({
					node,
					messageId: 'useGetErrorMessage',
				});
			},
		};
	},
};

/**
 * Rule: require-user-feedback-on-error
 * Requires showToast or similar user feedback when catching errors in UI components
 */
const requireUserFeedbackOnError = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Require user feedback (showToast) when catching errors in UI code',
			category: 'Best Practices',
			recommended: true,
		},
		messages: {
			missingUserFeedback:
				'Caught error without showing user feedback. Add showToast(getErrorMessage(error), "error") to inform the user.',
		},
		schema: [],
	},
	create(context) {
		return {
			CatchClause(node) {
				const filename = context.getFilename();

				// Only apply to React components and UI dialogs
				if (!filename.includes('src/app/') && !filename.includes('src/framework/')) {
					return;
				}

				// Skip test files
				if (filename.includes('.test.') || filename.includes('.spec.')) {
					return;
				}

				// Check if catch block contains showToast or setError
				const catchBody = node.body;
				let hasUserFeedback = false;

				// Simple AST traversal to look for showToast or setError calls
				const checkForFeedback = currentNode => {
					if (!currentNode) return;

					// Check if it's a showToast call
					if (currentNode.type === 'CallExpression' && currentNode.callee?.name === 'showToast') {
						hasUserFeedback = true;
						return;
					}

					// Check if it's setError call (for form state)
					if (
						currentNode.type === 'CallExpression' &&
						(currentNode.callee?.name === 'setError' || currentNode.callee?.property?.name === 'setError')
					) {
						hasUserFeedback = true;
						return;
					}

					// Check if error is re-thrown (defer to caller)
					if (currentNode.type === 'ThrowStatement') {
						hasUserFeedback = true;
						return;
					}

					// Recursively check children
					for (const key in currentNode) {
						if (key === 'parent') continue; // Skip parent to avoid circular reference
						const child = currentNode[key];
						if (Array.isArray(child)) {
							child.forEach(checkForFeedback);
						} else if (child && typeof child === 'object' && child.type) {
							checkForFeedback(child);
						}
					}
				};

				checkForFeedback(catchBody);

				// Report if no user feedback found
				if (!hasUserFeedback) {
					// Additional check: skip if catch block is empty except for console.error
					const statements = catchBody.body;
					if (statements.length === 0) {
						return; // Empty catch is handled by other rules
					}

					// Check if only console.error/log is present
					const onlyLogging = statements.every(stmt => {
						if (stmt.type !== 'ExpressionStatement') return false;
						const expr = stmt.expression;
						if (expr.type !== 'CallExpression') return false;
						const callee = expr.callee;
						return (
							callee.type === 'MemberExpression' &&
							callee.object?.name === 'console' &&
							['error', 'log', 'warn'].includes(callee.property?.name)
						);
					});

					if (onlyLogging && statements.length > 0) {
						context.report({
							node,
							messageId: 'missingUserFeedback',
						});
					}
				}
			},
		};
	},
};

/**
 * Rule: defensive-array-access
 * Requires defensive checks when accessing .map, .filter, etc. on API responses
 */
const defensiveArrayAccess = {
	meta: {
		type: 'suggestion',
		docs: {
			description: 'Require defensive array access on API response properties',
			category: 'Best Practices',
			recommended: true,
		},
		messages: {
			useDefensiveAccess:
				'Use defensive array access (response.{{property}} || []) to handle undefined/null values from API responses.',
		},
		schema: [],
	},
	create(context) {
		return {
			CallExpression(node) {
				// Check if calling .map, .filter, .forEach, etc.
				if (
					node.callee?.type !== 'MemberExpression' ||
					!['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every'].includes(
						node.callee.property?.name
					)
				) {
					return;
				}

				const object = node.callee.object;

				// Check if accessing a property that looks like an array from API response
				// e.g., response.items, data.results, etc.
				if (
					object.type === 'MemberExpression' &&
					object.object?.name &&
					['response', 'data', 'result'].includes(object.object.name) &&
					object.property?.name &&
					['items', 'results', 'data', 'list', 'entries', 'rows'].includes(object.property.name)
				) {
					// Check if already using defensive access (|| [])
					let parent = node.parent;
					let hasDefensiveAccess = false;

					// Look for LogicalExpression with || []
					if (
						parent?.type === 'LogicalExpression' &&
						parent.operator === '||' &&
						parent.right?.type === 'ArrayExpression' &&
						parent.right.elements.length === 0
					) {
						hasDefensiveAccess = true;
					}

					// Check if wrapped in parentheses with || []
					if (object.type === 'LogicalExpression' && object.operator === '||') {
						hasDefensiveAccess = true;
					}

					if (!hasDefensiveAccess) {
						context.report({
							node: object,
							messageId: 'useDefensiveAccess',
							data: {
								property: object.property.name,
							},
						});
					}
				}
			},
		};
	},
};

export default {
	rules: {
		'require-get-error-message': requireGetErrorMessage,
		'require-user-feedback-on-error': requireUserFeedbackOnError,
		'defensive-array-access': defensiveArrayAccess,
	},
};
