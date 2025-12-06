// @ts-nocheck - Example code, not compiled
// Type Organization Pattern
// Demonstrates how to organize types in dedicated files

// types/api.ts - API contracts
export interface CreateUserRequest {
  email: string;
  name: string;
  age?: number;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

// types/domain.ts - Business entities
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string; // Not exposed in API
  createdAt: Date;
}

// types/enums.ts - Shared enumerations
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest'
}
