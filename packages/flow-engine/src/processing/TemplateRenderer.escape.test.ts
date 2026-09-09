/**
 * Template Renderer Escape Tests
 *
 * Tests for handling literal characters: $, {, }
 */
import { describe, expect, it } from 'vitest';

import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { TemplateContext } from '../processing/TemplateRenderer';

describe('TemplateRenderer - Escape & Literal Characters', () => {
	const renderer = new TemplateRenderer();

	const mockContext: TemplateContext = {
		inputs: {
			name: 'Alice',
			value: 42,
		},
		stepOutputs: new Map(),
		taskMetadata: {},
	};

	describe('Shell variables (single $)', () => {
		it('should preserve shell variables like $HOME', () => {
			const template = 'echo $HOME';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('echo $HOME');
		});

		it('should preserve shell variables like $PATH', () => {
			const template = 'export PATH=$PATH:/new/path';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('export PATH=$PATH:/new/path');
		});

		it('should preserve shell variable expansion ${VAR}', () => {
			const template = 'echo ${HOME}/documents';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('echo ${HOME}/documents');
		});
	});

	describe('Mixing flow and shell variables', () => {
		it('should interpolate flow vars and preserve shell vars', () => {
			const template = 'echo "${{ inputs.name }}" lives in $HOME';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('echo "Alice" lives in $HOME');
		});

		it('should handle complex mixed expressions', () => {
			const template = 'cp ${{ inputs.name }}.txt ${HOME}/backup/';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('cp Alice.txt ${HOME}/backup/');
		});
	});

	describe('Literal curly braces', () => {
		it('should preserve single { }', () => {
			const template = 'JSON: { "key": "value" }';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('JSON: { "key": "value" }');
		});

		it('should preserve double {{ }} without $', () => {
			const template = 'Mustache: {{ variable }}';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('Mustache: {{ variable }}');
		});
	});

	describe('Incomplete ${{ patterns', () => {
		it('should preserve incomplete pattern ${{ without closing', () => {
			const template = 'Text ${{ incomplete';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('Text ${{ incomplete');
		});

		it('should preserve single ${ without second brace', () => {
			const template = 'Text ${ single brace }';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('Text ${ single brace }');
		});
	});

	describe('Escaping flow variables', () => {
		it('should NOT interpolate if pattern is broken', () => {
			// If we need to show literal ${{ in output, we can break the pattern
			const template = 'To use: $ {{ inputs.var }}'; // Space breaks pattern
			const result = renderer.render(template, mockContext);
			expect(result).toBe('To use: $ {{ inputs.var }}');
		});

		it('should NOT interpolate with backslash escape', () => {
			// Test if backslash escaping works (currently not implemented)
			const template = '\\${{ inputs.name }}';
			const result = renderer.render(template, mockContext);
			// Currently this will still interpolate since we don't handle \
			// This test documents current behavior
			expect(result).toBe('\\Alice'); // The \ is preserved, var is interpolated
		});
	});

	describe('Double-dollar escape syntax ($${{ ... }})', () => {
		it('should render $${{ inputs.foo }} as literal ${{ inputs.foo }}', () => {
			const template = 'task set-status $${{ inputs.name }} done';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('task set-status ${{ inputs.name }} done');
		});

		it('should preserve inner whitespace in the escaped literal', () => {
			const template = '$${{ inputs.value }}';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('${{ inputs.value }}');
		});

		it('should mix regular ${{ }} interpolation and $${{ }} literals', () => {
			const template = 'Hello ${{ inputs.name }}, use $${{ inputs.name }} as a template variable';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('Hello Alice, use ${{ inputs.name }} as a template variable');
		});

		it('should handle multiple $${{ }} escapes in the same template', () => {
			const template = 'cmd $${{ inputs.name }} and $${{ inputs.value }}';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('cmd ${{ inputs.name }} and ${{ inputs.value }}');
		});

		it('should not throw for unknown variable in $${{ }} (it is not resolved)', () => {
			const template = '$${{ inputs.nonexistent }}';
			expect(() => renderer.render(template, mockContext)).not.toThrow();
			expect(renderer.render(template, mockContext)).toBe('${{ inputs.nonexistent }}');
		});

		it('should handle $${{ }} inside {% if %} block content', () => {
			const template = '{% if inputs.name %}use $${{ inputs.name }} here{% endif %}';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('use ${{ inputs.name }} here');
		});

		it('should expand regular variables in the same template as $${{ }} escapes', () => {
			const template = [
				'# Flow template',
				'Run: ${{ inputs.name }}',
				'# Literal for downstream YAML:',
				'prompt: $${{ steps.prior.outputs.result }}',
			].join('\n');
			const result = renderer.render(template, mockContext);
			expect(result).toBe(
				[
					'# Flow template',
					'Run: Alice',
					'# Literal for downstream YAML:',
					'prompt: ${{ steps.prior.outputs.result }}',
				].join('\n')
			);
		});
	});

	describe('Complex real-world examples', () => {
		it('should handle bash script with mixed syntax', () => {
			// Use string concatenation to avoid TS template literal parsing
			const template = [
				'#!/bin/bash',
				'USER=${{ inputs.name }}',
				'HOME_DIR=$HOME',
				'CONFIG_FILE=${HOME}/.config',
				'echo "User: $USER, Home: $HOME_DIR"',
			].join('\n');

			const result = renderer.render(template, mockContext);
			expect(result).toContain('USER=Alice');
			expect(result).toContain('HOME_DIR=$HOME');
			expect(result).toContain('CONFIG_FILE=${HOME}/.config');
		});

		it('should handle JSON with flow variables', () => {
			const template = '{ "name": "${{ inputs.name }}", "count": ${{ inputs.value }} }';
			const result = renderer.render(template, mockContext);
			expect(result).toBe('{ "name": "Alice", "count": 42 }');
		});

		it('should handle awk scripts', () => {
			const template = "awk '{ print $1 }' ${{ inputs.name }}.txt";
			const result = renderer.render(template, mockContext);
			expect(result).toBe("awk '{ print $1 }' Alice.txt");
		});
	});
});
