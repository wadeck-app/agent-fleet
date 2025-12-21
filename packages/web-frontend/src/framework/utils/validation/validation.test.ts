import { describe, expect, it } from 'vitest';

import {
	combine,
	commonValidators,
	createValidator,
	email,
	isbn,
	maxLength,
	maxValue,
	minLength,
	minValue,
	nonNegative,
	optional,
	pattern,
	positive,
	range,
	required,
	url,
	validateSchema,
	validateValue,
	when,
	year,
} from './validation';

describe('Validation Library', () => {
	describe('required', () => {
		it('should fail for null/undefined/empty', () => {
			const validator = required('Name');
			expect(validator(null)).toBeTruthy();
			expect(validator(undefined)).toBeTruthy();
			expect(validator('')).toBeTruthy();
			expect(validator('   ')).toBeTruthy();
		});

		it('should pass for non-empty values', () => {
			const validator = required('Name');
			expect(validator('test')).toBeNull();
			expect(validator(123)).toBeNull();
		});
	});

	describe('minLength', () => {
		it('should fail for strings shorter than min', () => {
			const validator = minLength(5, 'Password');
			expect(validator('abc')).toBeTruthy();
			expect(validator('abcd')).toBeTruthy();
		});

		it('should pass for strings equal or longer than min', () => {
			const validator = minLength(5, 'Password');
			expect(validator('abcde')).toBeNull();
			expect(validator('abcdef')).toBeNull();
		});
	});

	describe('maxLength', () => {
		it('should fail for strings longer than max', () => {
			const validator = maxLength(5, 'Name');
			expect(validator('abcdef')).toBeTruthy();
		});

		it('should pass for strings equal or shorter than max', () => {
			const validator = maxLength(5, 'Name');
			expect(validator('abc')).toBeNull();
			expect(validator('abcde')).toBeNull();
		});
	});

	describe('minValue', () => {
		it('should fail for numbers below min', () => {
			const validator = minValue(10, 'Age');
			expect(validator(5)).toBeTruthy();
			expect(validator(9)).toBeTruthy();
		});

		it('should pass for numbers equal or above min', () => {
			const validator = minValue(10, 'Age');
			expect(validator(10)).toBeNull();
			expect(validator(15)).toBeNull();
		});
	});

	describe('maxValue', () => {
		it('should fail for numbers above max', () => {
			const validator = maxValue(100, 'Score');
			expect(validator(101)).toBeTruthy();
		});

		it('should pass for numbers equal or below max', () => {
			const validator = maxValue(100, 'Score');
			expect(validator(100)).toBeNull();
			expect(validator(50)).toBeNull();
		});
	});

	describe('range', () => {
		it('should fail for numbers outside range', () => {
			const validator = range(10, 20, 'Value');
			expect(validator(9)).toBeTruthy();
			expect(validator(21)).toBeTruthy();
		});

		it('should pass for numbers within range', () => {
			const validator = range(10, 20, 'Value');
			expect(validator(10)).toBeNull();
			expect(validator(15)).toBeNull();
			expect(validator(20)).toBeNull();
		});
	});

	describe('positive', () => {
		it('should fail for negative numbers', () => {
			const validator = positive('Amount');
			expect(validator(-1)).toBeTruthy();
			expect(validator(-100)).toBeTruthy();
		});

		it('should pass for positive numbers', () => {
			const validator = positive('Amount');
			expect(validator(1)).toBeNull();
			expect(validator(100)).toBeNull();
		});
	});

	describe('nonNegative', () => {
		it('should fail for negative numbers', () => {
			const validator = nonNegative('Count');
			expect(validator(-1)).toBeTruthy();
		});

		it('should pass for zero and positive numbers', () => {
			const validator = nonNegative('Count');
			expect(validator(0)).toBeNull();
			expect(validator(1)).toBeNull();
		});
	});

	describe('email', () => {
		it('should fail for invalid emails', () => {
			const validator = email('Email');
			expect(validator('invalid')).toBeTruthy();
			expect(validator('invalid@')).toBeTruthy();
			expect(validator('@invalid.com')).toBeTruthy();
		});

		it('should pass for valid emails', () => {
			const validator = email('Email');
			expect(validator('test@example.com')).toBeNull();
			expect(validator('user.name@domain.co.uk')).toBeNull();
		});
	});

	describe('url', () => {
		it('should fail for invalid URLs', () => {
			const validator = url('Website');
			expect(validator('invalid')).toBeTruthy();
			expect(validator('not a url')).toBeTruthy();
		});

		it('should pass for valid URLs', () => {
			const validator = url('Website');
			expect(validator('https://example.com')).toBeNull();
			expect(validator('http://localhost:3000')).toBeNull();
		});
	});

	describe('pattern', () => {
		it('should fail for strings not matching pattern', () => {
			const validator = pattern(/^\d{3}-\d{3}$/, 'Must be XXX-XXX format');
			expect(validator('abc-def')).toBeTruthy();
			expect(validator('123-45')).toBeTruthy();
		});

		it('should pass for strings matching pattern', () => {
			const validator = pattern(/^\d{3}-\d{3}$/, 'Must be XXX-XXX format');
			expect(validator('123-456')).toBeNull();
		});
	});

	describe('isbn', () => {
		it('should fail for invalid ISBN formats', () => {
			const validator = isbn('ISBN');
			expect(validator('invalid')).toBeTruthy();
			expect(validator('123')).toBeTruthy();
		});

		it('should pass for valid ISBN formats', () => {
			const validator = isbn('ISBN');
			expect(validator('978-0-7432-7356-5')).toBeNull();
			expect(validator('1234567890')).toBeNull();
		});
	});

	describe('year', () => {
		it('should fail for negative years', () => {
			const validator = year('Year');
			expect(validator(-1)).toBeTruthy();
		});

		it('should fail for years too far in the future', () => {
			const validator = year('Year');
			const currentYear = new Date().getFullYear();
			expect(validator(currentYear + 11)).toBeTruthy();
		});

		it('should pass for reasonable years', () => {
			const validator = year('Year');
			const currentYear = new Date().getFullYear();
			expect(validator(2000)).toBeNull();
			expect(validator(currentYear)).toBeNull();
			expect(validator(currentYear + 5)).toBeNull();
		});
	});

	describe('combine', () => {
		it('should fail if any validator fails', () => {
			const validator = combine(required('Field'), minLength(5, 'Field'), maxLength(10, 'Field'));

			expect(validator('')).toBeTruthy(); // Required fails
			expect(validator('abc')).toBeTruthy(); // MinLength fails
			expect(validator('12345678901')).toBeTruthy(); // MaxLength fails
		});

		it('should pass only if all validators pass', () => {
			const validator = combine(required('Field'), minLength(5, 'Field'), maxLength(10, 'Field'));

			expect(validator('12345')).toBeNull();
			expect(validator('1234567890')).toBeNull();
		});
	});

	describe('optional', () => {
		it('should pass for empty values', () => {
			const validator = optional(minLength(5, 'Field'));
			expect(validator(undefined)).toBeNull();
			expect(validator(null)).toBeNull();
			expect(validator('')).toBeNull();
		});

		it('should validate non-empty values', () => {
			const validator = optional(minLength(5, 'Field'));
			expect(validator('abc')).toBeTruthy();
			expect(validator('abcde')).toBeNull();
		});
	});

	describe('when', () => {
		it('should only validate when condition is true', () => {
			const validator = when((value: number) => value > 0, positive('Value'));

			expect(validator(-5)).toBeNull(); // Condition false, skip validation
			expect(validator(5)).toBeNull(); // Condition true, validation passes
		});
	});

	describe('validateValue', () => {
		it('should collect all errors from multiple validators', () => {
			const errors = validateValue('a', [required('Field'), minLength(5, 'Field'), maxLength(10, 'Field')]);

			expect(errors.length).toBe(1); // Only minLength fails
			expect(errors[0]).toContain('at least 5');
		});
	});

	describe('validateSchema', () => {
		it('should validate object against schema', () => {
			const schema = {
				name: required('Name'),
				age: combine(required('Age'), minValue(18, 'Age')),
				email: optional(email('Email')),
			};

			const invalidData = {
				name: '',
				age: 15,
				email: 'invalid',
			};

			const result = validateSchema(invalidData, schema);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it('should pass for valid data', () => {
			const schema = {
				name: required('Name'),
				age: combine(required('Age'), minValue(18, 'Age')),
			};

			const validData = {
				name: 'John',
				age: 25,
			};

			const result = validateSchema(validData, schema);

			expect(result.valid).toBe(true);
			expect(result.errors.length).toBe(0);
		});
	});

	describe('createValidator', () => {
		it('should create a reusable validator function', () => {
			const validator = createValidator({
				name: required('Name'),
				age: positive('Age'),
			});

			const invalidResult = validator({ name: '', age: -1 });
			expect(invalidResult.valid).toBe(false);

			const validResult = validator({ name: 'John', age: 25 });
			expect(validResult.valid).toBe(true);
		});
	});

	describe('commonValidators', () => {
		it('should provide requiredText validator', () => {
			const validator = commonValidators.requiredText('Title');
			expect(validator('')).toBeTruthy();
			expect(validator('Test')).toBeNull();
		});

		it('should provide requiredPositive validator', () => {
			const validator = commonValidators.requiredPositive('Price');
			expect(validator(-1)).toBeTruthy();
			expect(validator(10)).toBeNull();
		});
	});
});
