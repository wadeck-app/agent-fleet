/**
 * Application Services
 *
 * Centralized initialization of framework services with app-specific configuration.
 * This file creates singleton instances of framework services configured for this application.
 */
import { createCircuitBreaker } from '@framework/features/connectivity/CircuitBreakerService';

import { API_BASE_URL } from './api/config';

/**
 * Circuit Breaker Service Instance
 *
 * Configured with the application's health check endpoint.
 * This instance is used by the API layer to wrap all fetch calls.
 */
export const circuitBreakerService = createCircuitBreaker({
	healthCheckEndpoint: `${API_BASE_URL}/health`,
});
