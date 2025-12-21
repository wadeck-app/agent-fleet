// Utility to add entity metadata to test objects
export function withMetadata<T extends object>(
	data: T,
	overrides?: { version?: number; createdAt?: string; updatedAt?: string }
): T & { version: number; createdAt: string; updatedAt: string } {
	return {
		...data,
		version: overrides?.version ?? 1,
		createdAt: overrides?.createdAt ?? '2024-01-01T00:00:00Z',
		updatedAt: overrides?.updatedAt ?? '2024-01-01T00:00:00Z',
	};
}
