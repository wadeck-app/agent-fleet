/**
 * FlowDiscoveryRegistry Unit Tests
 *
 * Coverage:
 * - Test 1.1-1.5: Worker registration (including version mismatch)
 * - Test 2.1-2.5: Query operations
 * - Test 3.1-3.6: Update and unregister operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FlowDiscoveryRegistry, FlowVersionMismatchError, WorkerFlowEntry } from './FlowDiscoveryRegistry.js';
import { FlowMetadata } from '../../flow/types.js';

// Helper to create test flow metadata
function createFlowMetadata(
  id: string,
  version: string,
  hash: string,
  overrides: Partial<FlowMetadata> = {}
): FlowMetadata {
  return {
    id,
    version,
    hash,
    name: `Flow ${id}`,
    description: `Test flow ${id}`,
    inputs: { input1: 'string' },
    workspace: {
      mode: 'isolated',
      gitStrategy: 'feature-branch',
      reusePolicy: 'if-available',
    },
    ...overrides,
  };
}

describe('FlowDiscoveryRegistry', () => {
  let registry: FlowDiscoveryRegistry;

  beforeEach(() => {
    registry = new FlowDiscoveryRegistry();
  });

  // ========================================
  // Test 1.x: Worker Registration
  // ========================================

  describe('Test 1.1: Basic worker registration', () => {
    it('should register a worker with flows', () => {
      const flows: FlowMetadata[] = [
        createFlowMetadata('flow1', '1.0.0', 'abc12345'),
        createFlowMetadata('flow2', '1.0.0', 'def67890'),
      ];

      registry.registerWorker('worker1', 'project1', '/path/to/workspace', flows);

      expect(registry.hasWorker('worker1')).toBe(true);
      expect(registry.getWorkerFlows('worker1')).toEqual(flows);
    });

    it('should index flows in projectFlowIndex', () => {
      const flows: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'abc12345')];

      registry.registerWorker('worker1', 'project1', '/path/to/workspace', flows);

      const projectFlows = registry.getProjectFlows('project1');
      expect(projectFlows).toBeDefined();
      expect(projectFlows?.size).toBe(1);
      expect(projectFlows?.has('flow1')).toBe(true);
    });

    it('should handle worker with no flows', () => {
      registry.registerWorker('worker1', 'project1', '/path/to/workspace', []);

      expect(registry.hasWorker('worker1')).toBe(true);
      expect(registry.getWorkerFlows('worker1')).toEqual([]);
    });
  });

  describe('Test 1.2: Multiple workers with same flow', () => {
    it('should allow multiple workers to register the same flow version with same hash', () => {
      const flow1: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'abc12345')];
      const flow2: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'abc12345')];

      registry.registerWorker('worker1', 'project1', '/path/to/workspace1', flow1);
      registry.registerWorker('worker2', 'project1', '/path/to/workspace2', flow2);

      expect(registry.hasWorker('worker1')).toBe(true);
      expect(registry.hasWorker('worker2')).toBe(true);

      const workers = registry.findWorkersWithFlow('project1', 'flow1', '1.0.0');
      expect(workers).toHaveLength(2);
      expect(workers.map((w) => w.workerId)).toContain('worker1');
      expect(workers.map((w) => w.workerId)).toContain('worker2');
    });
  });

  describe('Test 1.3: Version mismatch detection', () => {
    it('should throw FlowVersionMismatchError when hash conflicts', () => {
      const flow1: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'abc12345')];
      const flow2: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'xyz99999')]; // Different hash!

      registry.registerWorker('worker1', 'project1', '/path/to/workspace1', flow1);

      expect(() => {
        registry.registerWorker('worker2', 'project1', '/path/to/workspace2', flow2);
      }).toThrow(FlowVersionMismatchError);
    });

    it('should include detailed error information in FlowVersionMismatchError', () => {
      const flow1: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'abc12345')];
      const flow2: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'xyz99999')];

      registry.registerWorker('worker1', 'project1', '/path/to/workspace1', flow1);

      try {
        registry.registerWorker('worker2', 'project1', '/path/to/workspace2', flow2);
        expect.fail('Should have thrown FlowVersionMismatchError');
      } catch (error) {
        expect(error).toBeInstanceOf(FlowVersionMismatchError);
        const err = error as FlowVersionMismatchError;
        expect(err.projectId).toBe('project1');
        expect(err.flowId).toBe('flow1');
        expect(err.version).toBe('1.0.0');
        expect(err.existingHash).toBe('abc12345');
        expect(err.newHash).toBe('xyz99999');
        expect(err.existingWorkerId).toBe('worker1');
        expect(err.newWorkerId).toBe('worker2');
      }
    });
  });

  describe('Test 1.4: Different versions of same flow', () => {
    it('should allow different versions with different hashes', () => {
      const flow1v1: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'abc12345')];
      const flow1v2: FlowMetadata[] = [createFlowMetadata('flow1', '2.0.0', 'xyz99999')];

      registry.registerWorker('worker1', 'project1', '/path/to/workspace1', flow1v1);
      registry.registerWorker('worker2', 'project1', '/path/to/workspace2', flow1v2);

      expect(registry.hasWorker('worker1')).toBe(true);
      expect(registry.hasWorker('worker2')).toBe(true);

      const workersV1 = registry.findWorkersWithFlow('project1', 'flow1', '1.0.0');
      expect(workersV1).toHaveLength(1);
      expect(workersV1[0].workerId).toBe('worker1');

      const workersV2 = registry.findWorkersWithFlow('project1', 'flow1', '2.0.0');
      expect(workersV2).toHaveLength(1);
      expect(workersV2[0].workerId).toBe('worker2');
    });
  });

  describe('Test 1.5: Project isolation', () => {
    it('should isolate flows by project', () => {
      const flow1: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'abc12345')];
      const flow2: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'xyz99999')]; // Different hash, different project

      registry.registerWorker('worker1', 'project1', '/path/to/workspace1', flow1);
      registry.registerWorker('worker2', 'project2', '/path/to/workspace2', flow2); // Different project

      expect(registry.hasWorker('worker1')).toBe(true);
      expect(registry.hasWorker('worker2')).toBe(true);

      const project1Flows = registry.findWorkersWithFlow('project1', 'flow1', '1.0.0');
      expect(project1Flows).toHaveLength(1);
      expect(project1Flows[0].workerId).toBe('worker1');
      expect(project1Flows[0].hash).toBe('abc12345');

      const project2Flows = registry.findWorkersWithFlow('project2', 'flow1', '1.0.0');
      expect(project2Flows).toHaveLength(1);
      expect(project2Flows[0].workerId).toBe('worker2');
      expect(project2Flows[0].hash).toBe('xyz99999');
    });
  });

  // ========================================
  // Test 2.x: Query Operations
  // ========================================

  describe('Test 2.1: findWorkersWithFlow - basic queries', () => {
    beforeEach(() => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);
      registry.registerWorker('worker2', 'project1', '/path/2', [
        createFlowMetadata('flow1', '2.0.0', 'hash2'),
      ]);
      registry.registerWorker('worker3', 'project1', '/path/3', [
        createFlowMetadata('flow2', '1.0.0', 'hash3'),
      ]);
    });

    it('should find workers with specific version', () => {
      const workers = registry.findWorkersWithFlow('project1', 'flow1', '1.0.0');
      expect(workers).toHaveLength(1);
      expect(workers[0].workerId).toBe('worker1');
      expect(workers[0].version).toBe('1.0.0');
    });

    it('should find all workers with flow (all versions)', () => {
      const workers = registry.findWorkersWithFlow('project1', 'flow1');
      expect(workers).toHaveLength(2);
      expect(workers.map((w) => w.workerId)).toContain('worker1');
      expect(workers.map((w) => w.workerId)).toContain('worker2');
    });

    it('should return empty array for non-existent flow', () => {
      const workers = registry.findWorkersWithFlow('project1', 'nonexistent');
      expect(workers).toEqual([]);
    });

    it('should return empty array for non-existent project', () => {
      const workers = registry.findWorkersWithFlow('nonexistent', 'flow1');
      expect(workers).toEqual([]);
    });

    it('should return empty array for non-existent version', () => {
      const workers = registry.findWorkersWithFlow('project1', 'flow1', '99.0.0');
      expect(workers).toEqual([]);
    });
  });

  describe('Test 2.2: getLatestVersion', () => {
    it('should return latest version using semver comparison', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);
      registry.registerWorker('worker2', 'project1', '/path/2', [
        createFlowMetadata('flow1', '1.2.0', 'hash2'),
      ]);
      registry.registerWorker('worker3', 'project1', '/path/3', [
        createFlowMetadata('flow1', '1.1.0', 'hash3'),
      ]);

      const latest = registry.getLatestVersion('project1', 'flow1');
      expect(latest).toBe('1.2.0');
    });

    it('should handle major version differences', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.9.9', 'hash1'),
      ]);
      registry.registerWorker('worker2', 'project1', '/path/2', [
        createFlowMetadata('flow1', '2.0.0', 'hash2'),
      ]);

      const latest = registry.getLatestVersion('project1', 'flow1');
      expect(latest).toBe('2.0.0');
    });

    it('should return undefined for non-existent flow', () => {
      const latest = registry.getLatestVersion('project1', 'nonexistent');
      expect(latest).toBeUndefined();
    });

    it('should return undefined for non-existent project', () => {
      const latest = registry.getLatestVersion('nonexistent', 'flow1');
      expect(latest).toBeUndefined();
    });

    it('should handle single version', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);

      const latest = registry.getLatestVersion('project1', 'flow1');
      expect(latest).toBe('1.0.0');
    });
  });

  describe('Test 2.3: getAllProjects', () => {
    it('should return all registered projects', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);
      registry.registerWorker('worker2', 'project2', '/path/2', [
        createFlowMetadata('flow2', '1.0.0', 'hash2'),
      ]);
      registry.registerWorker('worker3', 'project3', '/path/3', [
        createFlowMetadata('flow3', '1.0.0', 'hash3'),
      ]);

      const projects = registry.getAllProjects();
      expect(projects).toHaveLength(3);
      expect(projects).toContain('project1');
      expect(projects).toContain('project2');
      expect(projects).toContain('project3');
    });

    it('should return empty array when no projects registered', () => {
      const projects = registry.getAllProjects();
      expect(projects).toEqual([]);
    });
  });

  describe('Test 2.4: getProjectFlows', () => {
    it('should return all flows for a project', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
        createFlowMetadata('flow2', '1.0.0', 'hash2'),
      ]);

      const flows = registry.getProjectFlows('project1');
      expect(flows).toBeDefined();
      expect(flows?.size).toBe(2);
      expect(flows?.has('flow1')).toBe(true);
      expect(flows?.has('flow2')).toBe(true);
    });

    it('should return undefined for non-existent project', () => {
      const flows = registry.getProjectFlows('nonexistent');
      expect(flows).toBeUndefined();
    });

    it('should include all versions of a flow', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);
      registry.registerWorker('worker2', 'project1', '/path/2', [
        createFlowMetadata('flow1', '2.0.0', 'hash2'),
      ]);

      const flows = registry.getProjectFlows('project1');
      const flow1Entries = flows?.get('flow1');
      expect(flow1Entries).toHaveLength(2);
      expect(flow1Entries?.map((e) => e.version)).toContain('1.0.0');
      expect(flow1Entries?.map((e) => e.version)).toContain('2.0.0');
    });
  });

  describe('Test 2.5: getWorkerFlows and hasWorker', () => {
    it('should return flows for a registered worker', () => {
      const flows: FlowMetadata[] = [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
        createFlowMetadata('flow2', '1.0.0', 'hash2'),
      ];
      registry.registerWorker('worker1', 'project1', '/path/1', flows);

      const workerFlows = registry.getWorkerFlows('worker1');
      expect(workerFlows).toEqual(flows);
    });

    it('should return undefined for non-existent worker', () => {
      const workerFlows = registry.getWorkerFlows('nonexistent');
      expect(workerFlows).toBeUndefined();
    });

    it('hasWorker should return true for registered worker', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', []);
      expect(registry.hasWorker('worker1')).toBe(true);
    });

    it('hasWorker should return false for non-existent worker', () => {
      expect(registry.hasWorker('nonexistent')).toBe(false);
    });
  });

  // ========================================
  // Test 3.x: Update and Unregister Operations
  // ========================================

  describe('Test 3.1: unregisterWorker - basic cleanup', () => {
    it('should remove worker and all its flows', () => {
      const flows: FlowMetadata[] = [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
        createFlowMetadata('flow2', '1.0.0', 'hash2'),
      ];
      registry.registerWorker('worker1', 'project1', '/path/1', flows);

      expect(registry.hasWorker('worker1')).toBe(true);

      registry.unregisterWorker('worker1');

      expect(registry.hasWorker('worker1')).toBe(false);
      expect(registry.getWorkerFlows('worker1')).toBeUndefined();
    });

    it('should clean up flowVersionIndex', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);

      registry.unregisterWorker('worker1');

      const workers = registry.findWorkersWithFlow('project1', 'flow1', '1.0.0');
      expect(workers).toEqual([]);
    });

    it('should clean up projectFlowIndex', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);

      registry.unregisterWorker('worker1');

      const flows = registry.getProjectFlows('project1');
      expect(flows).toBeUndefined();
    });

    it('should handle unregistering non-existent worker gracefully', () => {
      expect(() => {
        registry.unregisterWorker('nonexistent');
      }).not.toThrow();
    });
  });

  describe('Test 3.2: unregisterWorker - partial cleanup', () => {
    it('should only remove flows for the unregistered worker', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);
      registry.registerWorker('worker2', 'project1', '/path/2', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);

      registry.unregisterWorker('worker1');

      expect(registry.hasWorker('worker1')).toBe(false);
      expect(registry.hasWorker('worker2')).toBe(true);

      const workers = registry.findWorkersWithFlow('project1', 'flow1', '1.0.0');
      expect(workers).toHaveLength(1);
      expect(workers[0].workerId).toBe('worker2');
    });

    it('should preserve other flows in the same project', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);
      registry.registerWorker('worker2', 'project1', '/path/2', [
        createFlowMetadata('flow2', '1.0.0', 'hash2'),
      ]);

      registry.unregisterWorker('worker1');

      const flows = registry.getProjectFlows('project1');
      expect(flows).toBeDefined();
      expect(flows?.size).toBe(1);
      expect(flows?.has('flow2')).toBe(true);
      expect(flows?.has('flow1')).toBe(false);
    });
  });

  describe('Test 3.3: updateWorkerFlows - add flows', () => {
    it('should add new flows to existing worker', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);

      const updatedFlows: FlowMetadata[] = [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
        createFlowMetadata('flow2', '1.0.0', 'hash2'), // New flow
      ];

      registry.updateWorkerFlows('worker1', updatedFlows);

      const workerFlows = registry.getWorkerFlows('worker1');
      expect(workerFlows).toHaveLength(2);
      expect(workerFlows?.map((f) => f.id)).toContain('flow1');
      expect(workerFlows?.map((f) => f.id)).toContain('flow2');
    });
  });

  describe('Test 3.4: updateWorkerFlows - remove flows', () => {
    it('should remove flows from existing worker', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
        createFlowMetadata('flow2', '1.0.0', 'hash2'),
      ]);

      const updatedFlows: FlowMetadata[] = [
        createFlowMetadata('flow1', '1.0.0', 'hash1'), // flow2 removed
      ];

      registry.updateWorkerFlows('worker1', updatedFlows);

      const workerFlows = registry.getWorkerFlows('worker1');
      expect(workerFlows).toHaveLength(1);
      expect(workerFlows?.[0].id).toBe('flow1');

      const workers = registry.findWorkersWithFlow('project1', 'flow2', '1.0.0');
      expect(workers).toEqual([]);
    });
  });

  describe('Test 3.5: updateWorkerFlows - version conflicts', () => {
    it('should throw error when updating with conflicting hash', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);
      registry.registerWorker('worker2', 'project1', '/path/2', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);

      const updatedFlows: FlowMetadata[] = [
        createFlowMetadata('flow1', '1.0.0', 'hash_DIFFERENT'), // Conflicting hash
      ];

      expect(() => {
        registry.updateWorkerFlows('worker2', updatedFlows);
      }).toThrow(FlowVersionMismatchError);
    });

    it('should allow updating own flow with different hash (version changed)', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);

      const updatedFlows: FlowMetadata[] = [
        createFlowMetadata('flow1', '2.0.0', 'hash2'), // Different version, different hash
      ];

      expect(() => {
        registry.updateWorkerFlows('worker1', updatedFlows);
      }).not.toThrow();

      const workerFlows = registry.getWorkerFlows('worker1');
      expect(workerFlows).toHaveLength(1);
      expect(workerFlows?.[0].version).toBe('2.0.0');
      expect(workerFlows?.[0].hash).toBe('hash2');
    });

    it('should throw error when worker not registered', () => {
      const flows: FlowMetadata[] = [createFlowMetadata('flow1', '1.0.0', 'hash1')];

      expect(() => {
        registry.updateWorkerFlows('nonexistent', flows);
      }).toThrow('Worker nonexistent not registered');
    });
  });

  describe('Test 3.6: updateWorkerFlows - complex scenarios', () => {
    it('should handle simultaneous add, remove, and update', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
        createFlowMetadata('flow2', '1.0.0', 'hash2'),
        createFlowMetadata('flow3', '1.0.0', 'hash3'),
      ]);

      const updatedFlows: FlowMetadata[] = [
        createFlowMetadata('flow1', '2.0.0', 'hash1_v2'), // Updated version
        // flow2 removed
        createFlowMetadata('flow3', '1.0.0', 'hash3'), // Unchanged
        createFlowMetadata('flow4', '1.0.0', 'hash4'), // Added
      ];

      registry.updateWorkerFlows('worker1', updatedFlows);

      const workerFlows = registry.getWorkerFlows('worker1');
      expect(workerFlows).toHaveLength(3);
      expect(workerFlows?.map((f) => f.id)).toContain('flow1');
      expect(workerFlows?.map((f) => f.id)).toContain('flow3');
      expect(workerFlows?.map((f) => f.id)).toContain('flow4');
      expect(workerFlows?.map((f) => f.id)).not.toContain('flow2');

      const flow1Entry = workerFlows?.find((f) => f.id === 'flow1');
      expect(flow1Entry?.version).toBe('2.0.0');
    });

    it('should update indices correctly', () => {
      registry.registerWorker('worker1', 'project1', '/path/1', [
        createFlowMetadata('flow1', '1.0.0', 'hash1'),
      ]);

      registry.updateWorkerFlows('worker1', [createFlowMetadata('flow2', '1.0.0', 'hash2')]);

      const flow1Workers = registry.findWorkersWithFlow('project1', 'flow1', '1.0.0');
      expect(flow1Workers).toEqual([]);

      const flow2Workers = registry.findWorkersWithFlow('project1', 'flow2', '1.0.0');
      expect(flow2Workers).toHaveLength(1);
      expect(flow2Workers[0].workerId).toBe('worker1');
    });
  });
});
