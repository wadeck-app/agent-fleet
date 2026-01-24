import { describe, expect, it } from 'vitest';

import { getBasename } from './pathUtils';

describe('pathUtils', () => {
	describe('getBasename', () => {
		it('should extract basename from Unix-style path', () => {
			expect(getBasename('/home/user/project')).toBe('project');
			expect(getBasename('/var/www/html')).toBe('html');
			expect(getBasename('/a/b/c/d')).toBe('d');
		});

		it('should extract basename from Windows-style path', () => {
			expect(getBasename('C:\\Users\\user\\project')).toBe('project');
			expect(getBasename('D:\\Workspace\\agent-fleet')).toBe('agent-fleet');
			expect(getBasename('C:\\a\\b\\c\\d')).toBe('d');
		});

		it('should handle mixed path separators', () => {
			expect(getBasename('C:/Users/user/project')).toBe('project');
			expect(getBasename('/home\\user\\project')).toBe('project');
		});

		it('should handle trailing separators', () => {
			expect(getBasename('/home/user/project/')).toBe('project');
			expect(getBasename('C:\\Users\\user\\project\\')).toBe('project');
			expect(getBasename('/home/user/project///')).toBe('project');
		});

		it('should return original path when no separators present', () => {
			expect(getBasename('project')).toBe('project');
			expect(getBasename('simple-path')).toBe('simple-path');
		});

		it('should handle edge cases', () => {
			expect(getBasename('')).toBe('');
			expect(getBasename('/')).toBe('');
			expect(getBasename('\\')).toBe('');
			expect(getBasename('//')).toBe('');
		});

		it('should handle single-segment paths', () => {
			expect(getBasename('/project')).toBe('project');
			expect(getBasename('\\project')).toBe('project');
		});

		it('should handle paths with spaces', () => {
			expect(getBasename('/home/user/my project')).toBe('my project');
			expect(getBasename('C:\\Users\\user\\my folder\\my project')).toBe('my project');
		});

		it('should handle paths with special characters', () => {
			expect(getBasename('/home/user/project-2024')).toBe('project-2024');
			expect(getBasename('/home/user/my_project')).toBe('my_project');
			expect(getBasename('/home/user/project.name')).toBe('project.name');
		});
	});
});
