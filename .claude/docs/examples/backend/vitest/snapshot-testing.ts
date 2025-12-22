// @ts-nocheck - Example code, not compiled
// Snapshot Testing Pattern
// Demonstrates snapshot testing for complex objects

it('should return correct user structure', async () => {
	const user = await service.getUser('1');

	expect(user).toMatchSnapshot();
	// First run creates snapshot, subsequent runs compare
});

// Update snapshots when intentionally changed:
// npm test -- -u
