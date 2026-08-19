/**
 * Loop Handler Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LoopHandler } from '../processing/LoopHandler';
import type { DAG, DAGNode, FlowStep, StepTrace } from '../types';

// @formatter:off
// Mock DAGBuilder
vi.mock('./DAGBuilder');
// @formatter:on

describe('LoopHandler', () => {
	let handler: LoopHandler;
	let mockDAG: DAG;
	let mockStep: FlowStep;
	let mockStepTrace: StepTrace;
	let iterations: Map<string, number>;
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let mockDAGBuilder: any;

	beforeEach(() => {
		vi.clearAllMocks();

		handler = new LoopHandler();
		iterations = new Map();

		// Get the mocked DAGBuilder instance and setup default behavior
		mockDAGBuilder = (handler as any).dagBuilder;
		if (mockDAGBuilder && mockDAGBuilder.getDescendants) {
			mockDAGBuilder.getDescendants = vi.fn().mockReturnValue(new Set());
		}

		// Setup mock DAG structure
		mockDAG = {
			nodes: new Map(),
			roots: ['step1'],
			leaves: ['step3'],
		};

		// Create a basic step
		mockStep = {
			id: 'step1',
			name: 'Test Step',
			type: 'script',
			script: 'echo test',
		};

		// Create a basic step trace
		mockStepTrace = {
			stepId: 'step1',
			stepName: 'Test Step',
			stepType: 'script',
			startTime: Date.now(),
			endTime: Date.now(),
			durationMs: 100,
		};

		// Spy on console.log
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleLogSpy.mockRestore();
	});

	describe('checkLoop()', () => {
		describe('No onFailure.goto configured', () => {
			it('should return shouldLoop=false when step has no onFailure config', () => {
				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toBe('No onFailure.goto configured for this step');
				expect(result.targetStepId).toBeUndefined();
			});

			it('should return shouldLoop=false when onFailure exists but no goto', () => {
				mockStep.onFailure = { maxIterations: 5 };

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toBe('No onFailure.goto configured for this step');
			});
		});

		describe('Step succeeded (no error)', () => {
			it('should return shouldLoop=false when stepTrace has no error', () => {
				mockStep.onFailure = { goto: 'step0' };

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toBe('Step did not fail (no error in stepTrace)');
				expect(result.targetStepId).toBeUndefined();
			});

			it('should return shouldLoop=false even with valid goto config if no error', () => {
				mockStep.onFailure = { goto: 'step0', maxIterations: 3 };

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toBe('Step did not fail (no error in stepTrace)');
			});
		});

		describe('Step failed with goto configured', () => {
			beforeEach(() => {
				mockStep.onFailure = { goto: 'step0' };
				mockStepTrace.error = 'Something went wrong';
			});

			it('should return shouldLoop=true when step failed and goto is configured', () => {
				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(true);
				expect(result.targetStepId).toBe('step0');
				expect(result.reason).toBeUndefined();
			});

			it('should return shouldLoop=true on first failure (iteration 0)', () => {
				iterations.set('step1', 0);

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(true);
				expect(result.targetStepId).toBe('step0');
			});

			it('should return shouldLoop=true when below maxIterations', () => {
				mockStep.onFailure = { goto: 'step0', maxIterations: 5 };
				iterations.set('step1', 2);

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(true);
				expect(result.targetStepId).toBe('step0');
			});
		});

		describe('Max iterations limit', () => {
			beforeEach(() => {
				mockStepTrace.error = 'Something went wrong';
			});

			it('should return shouldLoop=false when max iterations exceeded (default 3)', () => {
				mockStep.onFailure = { goto: 'step0' };
				iterations.set('step1', 3);

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toContain('Max iterations (3) exceeded');
				expect(result.reason).toContain("step 'step1'");
				expect(result.reason).toContain('current: 3');
			});

			it('should use default maxIterations of 3 when not specified', () => {
				mockStep.onFailure = { goto: 'step0' };
				iterations.set('step1', 3);

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toContain('Max iterations (3)');
			});

			it('should respect custom maxIterations value', () => {
				mockStep.onFailure = { goto: 'step0', maxIterations: 5 };
				iterations.set('step1', 5);

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toContain('Max iterations (5) exceeded');
			});

			it('should allow loop when at maxIterations - 1', () => {
				mockStep.onFailure = { goto: 'step0', maxIterations: 5 };
				iterations.set('step1', 4);

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(true);
				expect(result.targetStepId).toBe('step0');
			});

			it('should block loop when above maxIterations', () => {
				mockStep.onFailure = { goto: 'step0', maxIterations: 3 };
				iterations.set('step1', 10);

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toContain('Max iterations (3) exceeded');
			});

			it('should handle maxIterations of 1', () => {
				mockStep.onFailure = { goto: 'step0', maxIterations: 1 };
				iterations.set('step1', 1);

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(false);
				expect(result.reason).toContain('Max iterations (1) exceeded');
			});
		});

		describe('Edge cases', () => {
			it('should handle step not in iterations map (treats as 0)', () => {
				mockStep.onFailure = { goto: 'step0', maxIterations: 3 };
				mockStepTrace.error = 'Error';

				const result = handler.checkLoop(mockStep, mockStepTrace, iterations);

				expect(result.shouldLoop).toBe(true);
			});

			it('should handle empty iterations map', () => {
				mockStep.onFailure = { goto: 'step0' };
				mockStepTrace.error = 'Error';
				const emptyIterations = new Map<string, number>();

				const result = handler.checkLoop(mockStep, mockStepTrace, emptyIterations);

				expect(result.shouldLoop).toBe(true);
				expect(result.targetStepId).toBe('step0');
			});
		});
	});

	describe('handleLoop()', () => {
		let completed: Set<string>;

		beforeEach(() => {
			completed = new Set();
			mockStep.onFailure = { goto: 'step0', maxIterations: 3 };
		});

		describe('Valid target step', () => {
			beforeEach(() => {
				// Setup DAG with target step
				const targetNode: DAGNode = {
					step: { id: 'step0', name: 'Target', type: 'script', script: 'echo' },
					dependencies: [],
					dependents: ['step1'],
				};
				mockDAG.nodes.set('step0', targetNode);
			});

			it('should return success=true when target exists in DAG', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set());

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(result.success).toBe(true);
				expect(result.error).toBeUndefined();
			});

			it('should invalidate target step', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set());
				completed.add('step0');

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(completed.has('step0')).toBe(false);
				expect(result.invalidatedSteps).toContain('step0');
			});

			it('should increment iteration count for triggering step', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set());

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(iterations.get('step1')).toBe(1);
				expect(result.currentIteration).toBe(1);
			});

			it('should increment from existing iteration count', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set());
				iterations.set('step1', 2);

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(iterations.get('step1')).toBe(3);
				expect(result.currentIteration).toBe(3);
			});
		});

		describe('Invalid target step', () => {
			it('should return success=false when target not in DAG', () => {
				const result = handler.handleLoop(mockStep, 'nonexistent', mockDAG, completed, iterations);

				expect(result.success).toBe(false);
				expect(result.error).toBe("Target step 'nonexistent' not found in DAG");
				expect(result.invalidatedSteps).toEqual([]);
				expect(result.skippedSteps).toEqual([]);
			});

			it('should not modify completed set when target not found', () => {
				completed.add('step1');
				completed.add('step2');

				handler.handleLoop(mockStep, 'nonexistent', mockDAG, completed, iterations);

				expect(completed.size).toBe(2);
				expect(completed.has('step1')).toBe(true);
				expect(completed.has('step2')).toBe(true);
			});

			it('should not increment iteration count when target not found', () => {
				iterations.set('step1', 1);

				handler.handleLoop(mockStep, 'nonexistent', mockDAG, completed, iterations);

				expect(iterations.get('step1')).toBe(1);
			});
		});

		describe('Invalidate descendants', () => {
			beforeEach(() => {
				const targetNode: DAGNode = {
					step: { id: 'step0', name: 'Target', type: 'script', script: 'echo' },
					dependencies: [],
					dependents: ['step1', 'step2'],
				};
				mockDAG.nodes.set('step0', targetNode);

				const descendant1: DAGNode = {
					step: { id: 'step2', name: 'Desc1', type: 'script', script: 'echo' },
					dependencies: ['step0'],
					dependents: ['step3'],
				};
				mockDAG.nodes.set('step2', descendant1);

				const descendant2: DAGNode = {
					step: { id: 'step3', name: 'Desc2', type: 'script', script: 'echo' },
					dependencies: ['step2'],
					dependents: [],
				};
				mockDAG.nodes.set('step3', descendant2);
			});

			it('should invalidate all descendants of target step', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set(['step2', 'step3']));
				completed.add('step0');
				completed.add('step2');
				completed.add('step3');

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(completed.has('step0')).toBe(false);
				expect(completed.has('step2')).toBe(false);
				expect(completed.has('step3')).toBe(false);
				expect(result.invalidatedSteps).toContain('step0');
				expect(result.invalidatedSteps).toContain('step2');
				expect(result.invalidatedSteps).toContain('step3');
			});

			it('should only invalidate descendants that were completed', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set(['step2', 'step3']));
				completed.add('step0');
				completed.add('step2');
				// step3 not completed

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(result.invalidatedSteps).toContain('step0');
				expect(result.invalidatedSteps).toContain('step2');
				expect(result.invalidatedSteps).not.toContain('step3');
			});

			it('should handle empty descendants set', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set());
				completed.add('step0');

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(result.invalidatedSteps).toEqual(['step0']);
				expect(result.invalidatedSteps.length).toBe(1);
			});
		});

		describe('skipOnLoop handling', () => {
			beforeEach(() => {
				const targetNode: DAGNode = {
					step: { id: 'step0', name: 'Target', type: 'script', script: 'echo' },
					dependencies: [],
					dependents: ['step1', 'step2'],
				};
				mockDAG.nodes.set('step0', targetNode);
			});

			it('should skip descendants with skipOnLoop=true', () => {
				const skipStep: DAGNode = {
					step: {
						id: 'step2',
						name: 'Skip Step',
						type: 'script',
						script: 'echo',
						skipOnLoop: true,
					},
					dependencies: ['step0'],
					dependents: [],
				};
				mockDAG.nodes.set('step2', skipStep);

				mockDAGBuilder.getDescendants.mockReturnValue(new Set(['step2']));
				completed.add('step0');
				completed.add('step2');

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(result.skippedSteps).toContain('step2');
				expect(result.invalidatedSteps).not.toContain('step2');
				expect(completed.has('step2')).toBe(true); // Re-added to completed
			});

			it('should handle mix of skipped and invalidated descendants', () => {
				const skipStep: DAGNode = {
					step: {
						id: 'step2',
						name: 'Skip Step',
						type: 'script',
						script: 'echo',
						skipOnLoop: true,
					},
					dependencies: ['step0'],
					dependents: [],
				};
				mockDAG.nodes.set('step2', skipStep);

				const normalStep: DAGNode = {
					step: {
						id: 'step3',
						name: 'Normal Step',
						type: 'script',
						script: 'echo',
					},
					dependencies: ['step0'],
					dependents: [],
				};
				mockDAG.nodes.set('step3', normalStep);

				mockDAGBuilder.getDescendants.mockReturnValue(new Set(['step2', 'step3']));
				completed.add('step0');
				completed.add('step2');
				completed.add('step3');

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(result.skippedSteps).toContain('step2');
				expect(result.skippedSteps).not.toContain('step3');
				expect(result.invalidatedSteps).toContain('step3');
				expect(result.invalidatedSteps).not.toContain('step2');
				expect(completed.has('step2')).toBe(true);
				expect(completed.has('step3')).toBe(false);
			});

			it('should not skip descendants with skipOnLoop=false', () => {
				const normalStep: DAGNode = {
					step: {
						id: 'step2',
						name: 'Normal Step',
						type: 'script',
						script: 'echo',
						skipOnLoop: false,
					},
					dependencies: ['step0'],
					dependents: [],
				};
				mockDAG.nodes.set('step2', normalStep);

				mockDAGBuilder.getDescendants.mockReturnValue(new Set(['step2']));
				completed.add('step0');
				completed.add('step2');

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(result.skippedSteps).not.toContain('step2');
				expect(result.invalidatedSteps).toContain('step2');
				expect(completed.has('step2')).toBe(false);
			});

			it('should skip intermediate step with skipOnLoop=true but still invalidate its downstream', () => {
				// Chain: step0 (goto target) -> stepB (skipOnLoop) -> stepC (normal)
				// When loop fires goto step0: stepB skipped, stepC invalidated
				const stepB: DAGNode = {
					step: {
						id: 'stepB',
						name: 'Intermediate Skip',
						type: 'script',
						script: 'echo',
						skipOnLoop: true,
					},
					dependencies: ['step0'],
					dependents: ['stepC'],
				};
				mockDAG.nodes.set('stepB', stepB);

				const stepC: DAGNode = {
					step: {
						id: 'stepC',
						name: 'Downstream Normal',
						type: 'script',
						script: 'echo',
					},
					dependencies: ['stepB'],
					dependents: [],
				};
				mockDAG.nodes.set('stepC', stepC);

				mockDAGBuilder.getDescendants.mockReturnValue(new Set(['stepB', 'stepC']));
				completed.add('step0');
				completed.add('stepB');
				completed.add('stepC');

				const result = handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				// stepB is skipped (skipOnLoop=true) — stays in completed
				expect(result.skippedSteps).toContain('stepB');
				expect(result.invalidatedSteps).not.toContain('stepB');
				expect(completed.has('stepB')).toBe(true);

				// stepC is invalidated (normal step) — removed from completed
				expect(result.invalidatedSteps).toContain('stepC');
				expect(result.skippedSteps).not.toContain('stepC');
				expect(completed.has('stepC')).toBe(false);

				// step0 (goto target) is always invalidated
				expect(result.invalidatedSteps).toContain('step0');
				expect(completed.has('step0')).toBe(false);
			});
		});

		describe('Console logging', () => {
			beforeEach(() => {
				const targetNode: DAGNode = {
					step: { id: 'step0', name: 'Target', type: 'script', script: 'echo' },
					dependencies: [],
					dependents: [],
				};
				mockDAG.nodes.set('step0', targetNode);
			});

			it('should log loop information with iteration count', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set());
				mockStep.onFailure = { goto: 'step0', maxIterations: 5 };

				handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🔄 [LOOP]'));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Step 'step1' failed"));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("returning to 'step0'"));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('iteration 1/5'));
			});

			it('should log invalidated steps', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set(['step2']));
				const descendant: DAGNode = {
					step: { id: 'step2', name: 'Desc', type: 'script', script: 'echo' },
					dependencies: ['step0'],
					dependents: [],
				};
				mockDAG.nodes.set('step2', descendant);
				completed.add('step0');
				completed.add('step2');

				handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('📝 Invalidated 2 step(s)'));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('step0, step2'));
			});

			it('should log skipped steps when skipOnLoop=true', () => {
				const skipStep: DAGNode = {
					step: {
						id: 'step2',
						name: 'Skip',
						type: 'script',
						script: 'echo',
						skipOnLoop: true,
					},
					dependencies: ['step0'],
					dependents: [],
				};
				mockDAG.nodes.set('step2', skipStep);
				mockDAGBuilder.getDescendants.mockReturnValue(new Set(['step2']));
				completed.add('step0');
				completed.add('step2');

				handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('⏭️  Skipped 1 step(s)'));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('skipOnLoop=true'));
				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('step2'));
			});

			it('should not log skipped steps when none are skipped', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set());
				completed.add('step0');

				handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				const skipLogCall = consoleLogSpy.mock.calls.find((call: any[]) => call[0].includes('⏭️'));
				expect(skipLogCall).toBeUndefined();
			});

			it('should use default maxIterations in log when not specified', () => {
				mockDAGBuilder.getDescendants.mockReturnValue(new Set());
				mockStep.onFailure = { goto: 'step0' };

				handler.handleLoop(mockStep, 'step0', mockDAG, completed, iterations);

				expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('iteration 1/3'));
			});
		});
	});

	describe('isIterationLimitExceeded()', () => {
		it('should return false when below limit', () => {
			iterations.set('step1', 2);

			const result = handler.isIterationLimitExceeded('step1', iterations, 3);

			expect(result).toBe(false);
		});

		it('should return true when at limit', () => {
			iterations.set('step1', 3);

			const result = handler.isIterationLimitExceeded('step1', iterations, 3);

			expect(result).toBe(true);
		});

		it('should return true when above limit', () => {
			iterations.set('step1', 5);

			const result = handler.isIterationLimitExceeded('step1', iterations, 3);

			expect(result).toBe(true);
		});

		it('should use default maxIterations of 3 when not provided', () => {
			iterations.set('step1', 3);

			const result = handler.isIterationLimitExceeded('step1', iterations);

			expect(result).toBe(true);
		});

		it('should return false for step not in iterations map (0 iterations)', () => {
			const result = handler.isIterationLimitExceeded('step1', iterations, 3);

			expect(result).toBe(false);
		});

		it('should handle custom maxIterations values', () => {
			iterations.set('step1', 9);

			expect(handler.isIterationLimitExceeded('step1', iterations, 10)).toBe(false);
			expect(handler.isIterationLimitExceeded('step1', iterations, 9)).toBe(true);
			expect(handler.isIterationLimitExceeded('step1', iterations, 8)).toBe(true);
		});

		it('should handle maxIterations of 0', () => {
			iterations.set('step1', 0);

			const result = handler.isIterationLimitExceeded('step1', iterations, 0);

			expect(result).toBe(true);
		});

		it('should handle maxIterations of 1', () => {
			iterations.set('step1', 0);
			expect(handler.isIterationLimitExceeded('step1', iterations, 1)).toBe(false);

			iterations.set('step1', 1);
			expect(handler.isIterationLimitExceeded('step1', iterations, 1)).toBe(true);
		});
	});

	describe('getLoopMetadata()', () => {
		it('should format metadata with current iteration', () => {
			iterations.set('step1', 2);

			const result = handler.getLoopMetadata('step1', iterations, 5);

			expect(result).toBe('[Loop metadata] Step: step1, Iteration: 2, Total loops: 5');
		});

		it('should handle step not in iterations map (0 iterations)', () => {
			const result = handler.getLoopMetadata('step1', iterations, 3);

			expect(result).toBe('[Loop metadata] Step: step1, Iteration: 0, Total loops: 3');
		});

		it('should handle zero total loops', () => {
			iterations.set('step1', 1);

			const result = handler.getLoopMetadata('step1', iterations, 0);

			expect(result).toBe('[Loop metadata] Step: step1, Iteration: 1, Total loops: 0');
		});

		it('should handle various step IDs', () => {
			iterations.set('build-step', 3);

			const result = handler.getLoopMetadata('build-step', iterations, 10);

			expect(result).toContain('Step: build-step');
			expect(result).toContain('Iteration: 3');
			expect(result).toContain('Total loops: 10');
		});
	});

	describe('resetIterations()', () => {
		it('should remove iteration count for specified step', () => {
			iterations.set('step1', 5);

			handler.resetIterations('step1', iterations);

			expect(iterations.has('step1')).toBe(false);
		});

		it('should not affect other step iterations', () => {
			iterations.set('step1', 3);
			iterations.set('step2', 5);
			iterations.set('step3', 2);

			handler.resetIterations('step2', iterations);

			expect(iterations.get('step1')).toBe(3);
			expect(iterations.has('step2')).toBe(false);
			expect(iterations.get('step3')).toBe(2);
		});

		it('should handle resetting non-existent step (no error)', () => {
			iterations.set('step1', 2);

			expect(() => {
				handler.resetIterations('nonexistent', iterations);
			}).not.toThrow();

			expect(iterations.get('step1')).toBe(2);
		});

		it('should handle empty iterations map', () => {
			expect(() => {
				handler.resetIterations('step1', iterations);
			}).not.toThrow();
		});
	});

	describe('handleResetOnSuccess()', () => {
		let allSteps: FlowStep[];

		beforeEach(() => {
			allSteps = [
				{
					id: 'step1',
					name: 'Step 1',
					type: 'script',
					script: 'echo test',
					onFailure: { goto: 'step0', resetOnSuccess: true },
				},
				{
					id: 'step2',
					name: 'Step 2',
					type: 'script',
					script: 'echo test',
					onFailure: { goto: 'step0', resetOnSuccess: false },
				},
				{
					id: 'step3',
					name: 'Step 3',
					type: 'script',
					script: 'echo test',
					onFailure: { goto: 'step1' },
				},
			];
		});

		it('should reset iterations for steps with resetOnSuccess=true', () => {
			iterations.set('step1', 3);
			iterations.set('step2', 2);

			handler.handleResetOnSuccess('step0', allSteps, iterations);

			expect(iterations.has('step1')).toBe(false);
			expect(iterations.get('step2')).toBe(2); // Not reset (resetOnSuccess=false)
		});

		it('should not reset if step has no iterations', () => {
			handler.handleResetOnSuccess('step0', allSteps, iterations);

			expect(iterations.size).toBe(0);
			// Should not log if oldCount is 0
			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		it('should log reset information when resetting', () => {
			iterations.set('step1', 5);

			handler.handleResetOnSuccess('step0', allSteps, iterations);

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🔄 Reset iteration counter'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("'step1'"));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('(was 5)'));
			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('resetOnSuccess'));
		});

		it('should not reset if goto points to different step', () => {
			iterations.set('step1', 3);
			iterations.set('step3', 2);

			handler.handleResetOnSuccess('step0', allSteps, iterations);

			expect(iterations.has('step1')).toBe(false); // Reset (goto='step0')
			expect(iterations.get('step3')).toBe(2); // Not reset (goto='step1')
		});

		it('should handle multiple steps with same goto target', () => {
			const moreSteps: FlowStep[] = [
				...allSteps,
				{
					id: 'step4',
					name: 'Step 4',
					type: 'script',
					script: 'echo test',
					onFailure: { goto: 'step0', resetOnSuccess: true },
				},
			];
			iterations.set('step1', 3);
			iterations.set('step4', 2);

			handler.handleResetOnSuccess('step0', moreSteps, iterations);

			expect(iterations.has('step1')).toBe(false);
			expect(iterations.has('step4')).toBe(false);
			expect(consoleLogSpy).toHaveBeenCalledTimes(2);
		});

		it('should not reset if onFailure.resetOnSuccess is undefined', () => {
			iterations.set('step3', 3);

			handler.handleResetOnSuccess('step1', allSteps, iterations);

			expect(iterations.get('step3')).toBe(3); // Not reset (resetOnSuccess undefined)
		});

		it('should handle empty allSteps array', () => {
			iterations.set('step1', 3);

			expect(() => {
				handler.handleResetOnSuccess('step0', [], iterations);
			}).not.toThrow();

			expect(iterations.get('step1')).toBe(3);
		});
	});

	describe('getLoopPath()', () => {
		beforeEach(() => {
			// Build a simple DAG: step0 -> step1 -> step2 -> step3
			const nodes = new Map<string, DAGNode>();

			nodes.set('step0', {
				step: { id: 'step0', name: 'Step 0', type: 'script', script: 'echo' },
				dependencies: [],
				dependents: ['step1'],
			});

			nodes.set('step1', {
				step: { id: 'step1', name: 'Step 1', type: 'script', script: 'echo' },
				dependencies: ['step0'],
				dependents: ['step2'],
			});

			nodes.set('step2', {
				step: { id: 'step2', name: 'Step 2', type: 'script', script: 'echo' },
				dependencies: ['step1'],
				dependents: ['step3'],
			});

			nodes.set('step3', {
				step: { id: 'step3', name: 'Step 3', type: 'script', script: 'echo' },
				dependencies: ['step2'],
				dependents: [],
			});

			mockDAG.nodes = nodes;
		});

		it('should find path from target to triggering step', () => {
			const path = handler.getLoopPath(mockDAG, 'step3', 'step0');

			expect(path).toEqual(['step0', 'step1', 'step2', 'step3']);
		});

		it('should find path for adjacent steps', () => {
			const path = handler.getLoopPath(mockDAG, 'step1', 'step0');

			expect(path).toEqual(['step0', 'step1']);
		});

		it('should find path for same step (immediate loop)', () => {
			const path = handler.getLoopPath(mockDAG, 'step1', 'step1');

			expect(path).toEqual(['step1']);
		});

		it('should return empty array when no path exists', () => {
			const path = handler.getLoopPath(mockDAG, 'step0', 'step3');

			expect(path).toEqual([]);
		});

		it('should handle branching DAG', () => {
			// Add branch: step1 -> step2a and step1 -> step2b
			const nodes = mockDAG.nodes;
			nodes.get('step1')!.dependents = ['step2', 'step2a'];

			nodes.set('step2a', {
				step: { id: 'step2a', name: 'Step 2a', type: 'script', script: 'echo' },
				dependencies: ['step1'],
				dependents: ['step3'],
			});

			// Update step3 to have both step2 and step2a as dependencies
			nodes.get('step3')!.dependencies = ['step2', 'step2a'];

			const path = handler.getLoopPath(mockDAG, 'step3', 'step0');

			expect(path).toContain('step0');
			expect(path).toContain('step1');
			expect(path).toContain('step3');
			// Should include either step2 or step2a (BFS finds one path)
			expect(path.some(s => s === 'step2' || s === 'step2a')).toBe(true);
		});

		it('should handle missing from step in DAG', () => {
			const path = handler.getLoopPath(mockDAG, 'nonexistent', 'step0');

			expect(path).toEqual([]);
		});

		it('should handle missing to step in DAG', () => {
			const path = handler.getLoopPath(mockDAG, 'step3', 'nonexistent');

			expect(path).toEqual([]);
		});

		it('should handle empty DAG', () => {
			const emptyDAG: DAG = {
				nodes: new Map(),
				roots: [],
				leaves: [],
			};

			const path = handler.getLoopPath(emptyDAG, 'step1', 'step0');

			expect(path).toEqual([]);
		});

		it('should handle single node DAG', () => {
			const singleNodeDAG: DAG = {
				nodes: new Map([
					[
						'only',
						{
							step: { id: 'only', name: 'Only', type: 'script', script: 'echo' },
							dependencies: [],
							dependents: [],
						},
					],
				]),
				roots: ['only'],
				leaves: ['only'],
			};

			const path = handler.getLoopPath(singleNodeDAG, 'only', 'only');

			expect(path).toEqual(['only']);
		});

		it('should not revisit nodes (handle cycles in search)', () => {
			// Even though DAG should not have cycles, the BFS should handle it
			const cyclicNodes = new Map<string, DAGNode>();

			cyclicNodes.set('a', {
				step: { id: 'a', name: 'A', type: 'script', script: 'echo' },
				dependencies: [],
				dependents: ['b', 'c'],
			});

			cyclicNodes.set('b', {
				step: { id: 'b', name: 'B', type: 'script', script: 'echo' },
				dependencies: ['a'],
				dependents: ['c'],
			});

			cyclicNodes.set('c', {
				step: { id: 'c', name: 'C', type: 'script', script: 'echo' },
				dependencies: ['a', 'b'],
				dependents: [],
			});

			const testDAG: DAG = {
				nodes: cyclicNodes,
				roots: ['a'],
				leaves: ['c'],
			};

			const path = handler.getLoopPath(testDAG, 'c', 'a');

			expect(path).toContain('a');
			expect(path).toContain('c');
			expect(path.length).toBeGreaterThan(0);
		});
	});
});
