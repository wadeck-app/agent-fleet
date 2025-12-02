import { describe, it, expect } from 'vitest';
import fibonacci from './fibonacci.js';

describe('fibonacci', () => {
  it('should return 0 for n = 0', () => {
    expect(fibonacci(0)).toBe(0);
  });

  it('should return 1 for n = 1', () => {
    expect(fibonacci(1)).toBe(1);
  });

  it('should calculate correct Fibonacci numbers for small values', () => {
    expect(fibonacci(2)).toBe(1);
    expect(fibonacci(3)).toBe(2);
    expect(fibonacci(4)).toBe(3);
    expect(fibonacci(5)).toBe(5);
    expect(fibonacci(6)).toBe(8);
    expect(fibonacci(7)).toBe(13);
  });

  it('should calculate correct Fibonacci numbers for larger values', () => {
    expect(fibonacci(10)).toBe(55);
    expect(fibonacci(15)).toBe(610);
    expect(fibonacci(20)).toBe(6765);
  });

  it('should throw an error for negative numbers', () => {
    expect(() => fibonacci(-1)).toThrow('Input must be a non-negative integer');
    expect(() => fibonacci(-5)).toThrow('Input must be a non-negative integer');
    expect(() => fibonacci(-100)).toThrow('Input must be a non-negative integer');
  });

  it('should handle edge case of very large Fibonacci numbers', () => {
    // Fibonacci(50) = 12586269025
    expect(fibonacci(50)).toBe(12586269025);
  });

  // Random test case for fibonacci(12)
  it('should return 144 for n = 12', () => {
    expect(fibonacci(12)).toBe(144);
  });

  // New random test case for fibonacci(17)
  it('should return 1597 for n = 17', () => {
    expect(fibonacci(17)).toBe(1597);
  });

  // New random test case for fibonacci(23)
  it('should return 28657 for n = 23', () => {
    expect(fibonacci(23)).toBe(28657);
  });

  // New random test case for fibonacci(33)
  it('should return 3524578 for n = 33', () => {
    expect(fibonacci(33)).toBe(3524578);
  });

  // New random test case for fibonacci(42)
  it('should return 267914296 for n = 42', () => {
    expect(fibonacci(42)).toBe(267914296);
  });

  // New random test case for fibonacci(36)
  it('should return 14930352 for n = 36', () => {
    expect(fibonacci(36)).toBe(14930352);
  });
});
