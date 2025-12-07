/**
 * Error Handling Utilities - Centralized error handling
 * Following FRONTEND_WOW.md: Reusable error handling with user-friendly messages
 */

/**
 * Error handling result
 */
export interface ErrorResult {
  message: string;
  shouldThrow: boolean;
}

/**
 * Handle service errors consistently
 * Extracts error message and provides user-friendly fallback
 *
 * @param error - The error that occurred
 * @param fallbackMessage - User-friendly fallback message
 * @param shouldThrow - Whether the error should be re-thrown after handling
 * @returns Error result with message and throw flag
 */
export function handleServiceError(
  error: unknown,
  fallbackMessage: string,
  shouldThrow: boolean = false
): ErrorResult {
  // Extract error message
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = fallbackMessage;
  }

  return {
    message,
    shouldThrow,
  };
}

/**
 * Create an error handler for async operations
 * Returns a function that wraps error handling logic
 *
 * @param setError - State setter for error message
 * @param fallbackMessage - Fallback error message
 * @param shouldThrow - Whether to re-throw the error
 */
export function createErrorHandler(
  setError: (error: string | null) => void,
  fallbackMessage: string,
  shouldThrow: boolean = false
) {
  return (error: unknown): never | void => {
    const result = handleServiceError(error, fallbackMessage, shouldThrow);
    setError(result.message);

    if (result.shouldThrow) {
      throw new Error(result.message);
    }
  };
}
