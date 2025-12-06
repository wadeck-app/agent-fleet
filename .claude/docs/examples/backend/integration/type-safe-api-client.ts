// @ts-nocheck - Example code, not compiled
// Type-Safe API Client Pattern
// Demonstrates sharing types between server and client

// server/types/api.ts - Shared between server and client
export interface CreateUserRequest { /* ... */ }
export interface UserResponse { /* ... */ }

// client/api.ts
import type { CreateUserRequest, UserResponse } from '../server/types/api';

class ApiClient {
  async createUser(data: CreateUserRequest): Promise<UserResponse> {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Request failed');
    return response.json() as Promise<UserResponse>;
  }
}
