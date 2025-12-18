/**
 * REST API Test Helpers
 *
 * Helper functions specifically for testing REST API endpoints.
 */

import type { Express } from 'express';
import { vi, it, describe, expect } from 'vitest';

/**
 * Options for endpoint testing
 */
export interface TestEndpointOptions {
  /** Express app instance */
  app: Express | any;
  /** Supertest request function */
  request: any;
  /** HTTP method (GET, POST, PUT, DELETE) */
  method: 'get' | 'post' | 'put' | 'delete';
  /** Endpoint path */
  path: string;
  /** Request body for POST/PUT (optional) */
  body?: any;
  /** Mock function to configure for success test */
  mockSuccess?: () => void;
  /** Mock function to configure for error test */
  mockError?: (mockFn: any) => void;
  /** Expected success status code (default: 200) */
  successStatus?: number;
  /** Expected error status code (default: 500) */
  errorStatus?: number;
  /** Description suffix for test names */
  description?: string;
}

/**
 * Create standard success and error tests for an endpoint
 *
 * This helper reduces boilerplate by generating two common test cases:
 * 1. Success case - endpoint returns expected status
 * 2. Error case - endpoint handles errors gracefully
 *
 * @example
 * ```typescript
 * testEndpoint({
 *   app,
 *   request,
 *   method: 'get',
 *   path: '/api/tasks',
 *   mockSuccess: () => {
 *     mockTaskManager.getAllTasks.mockReturnValue([]);
 *   },
 *   mockError: (fn) => {
 *     fn.mockImplementation(() => { throw new Error('DB error'); });
 *   },
 * });
 * ```
 */
export function testEndpoint(options: TestEndpointOptions): void {
  const {
    app,
    request,
    method,
    path,
    body,
    mockSuccess,
    mockError,
    successStatus = 200,
    errorStatus = 500,
    description = '',
  } = options;

  const suffix = description ? ` ${description}` : '';

  it(`should handle ${method.toUpperCase()} ${path} success${suffix}`, async () => {
    if (mockSuccess) {
      mockSuccess();
    }

    const req = request(app)[method](path);
    if (body) {
      req.send(body);
    }

    const response = await req;
    expect(response.status).toBe(successStatus);
  });

  if (mockError) {
    it(`should handle ${method.toUpperCase()} ${path} error${suffix}`, async () => {
      // The mockError callback receives a reference to set up the error
      const mockFn = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      mockError(mockFn);

      const req = request(app)[method](path);
      if (body) {
        req.send(body);
      }

      const response = await req;
      expect(response.status).toBe(errorStatus);
    });
  }
}

/**
 * Create standard CRUD tests for a resource endpoint
 *
 * Generates tests for GET (list), GET/:id, POST, PUT/:id, DELETE/:id
 *
 * @example
 * ```typescript
 * testCRUDEndpoint({
 *   app,
 *   request,
 *   basePath: '/api/tasks',
 *   mocks: {
 *     list: mockTaskManager.getAllTasks,
 *     get: mockTaskManager.getTask,
 *     create: mockTaskManager.addTask,
 *     update: mockTaskManager.updateTask,
 *     delete: mockTaskManager.deleteTask,
 *   },
 * });
 * ```
 */
export function testCRUDEndpoint(options: {
  app: Express | any;
  request: any;
  basePath: string;
  mocks: {
    list?: any;
    get?: any;
    create?: any;
    update?: any;
    delete?: any;
  };
}): void {
  const { app, request, basePath, mocks } = options;

  describe(`${basePath} CRUD operations`, () => {
    if (mocks.list) {
      testEndpoint({
        app,
        request,
        method: 'get',
        path: basePath,
        mockSuccess: () => mocks.list.mockReturnValue([]),
        mockError: (fn) => {
          mocks.list.mockImplementation(() => {
            throw new Error('List error');
          });
        },
        description: '(list)',
      });
    }

    if (mocks.get) {
      testEndpoint({
        app,
        request,
        method: 'get',
        path: `${basePath}/test-id`,
        mockSuccess: () => mocks.get.mockReturnValue({ id: 'test-id' }),
        mockError: (fn) => {
          mocks.get.mockReturnValue(undefined);
        },
        errorStatus: 404,
        description: '(get by id)',
      });
    }

    if (mocks.create) {
      testEndpoint({
        app,
        request,
        method: 'post',
        path: basePath,
        body: { test: 'data' },
        mockSuccess: () => mocks.create.mockReturnValue({ id: 'new-id' }),
        mockError: (fn) => {
          mocks.create.mockImplementation(() => {
            throw new Error('Create error');
          });
        },
        successStatus: 201,
        description: '(create)',
      });
    }

    if (mocks.update) {
      testEndpoint({
        app,
        request,
        method: 'put',
        path: `${basePath}/test-id`,
        body: { test: 'updated' },
        mockSuccess: () => mocks.update.mockReturnValue({ id: 'test-id' }),
        mockError: (fn) => {
          mocks.update.mockImplementation(() => {
            throw new Error('Update error');
          });
        },
        description: '(update)',
      });
    }

    if (mocks.delete) {
      testEndpoint({
        app,
        request,
        method: 'delete',
        path: `${basePath}/test-id`,
        mockSuccess: () => mocks.delete.mockReturnValue(true),
        mockError: (fn) => {
          mocks.delete.mockImplementation(() => {
            throw new Error('Delete error');
          });
        },
        successStatus: 204,
        description: '(delete)',
      });
    }
  });
}
