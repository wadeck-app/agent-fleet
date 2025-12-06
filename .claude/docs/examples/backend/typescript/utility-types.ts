// @ts-nocheck - Example code, not compiled
// Utility Types Examples
// Demonstrates common TypeScript utility types

// Pick subset of properties
type UserSummary = Pick<User, 'id' | 'email' | 'name'>;

// Make all properties optional
type PartialUser = Partial<User>;

// Make all properties required
type CompleteUser = Required<PartialUser>;

// Exclude properties
type PublicUser = Omit<User, 'passwordHash'>;

// Extract enum values
type RoleValue = `${UserRole}`; // 'admin' | 'user' | 'guest'

// Readonly (immutable)
type ImmutableUser = Readonly<User>;
