/**
 * Recursive implementation of Fibonacci sequence
 * @param n The index of the Fibonacci number to calculate (0-indexed)
 * @returns The Fibonacci number at the given index
 */
export function fibonacciRecursive(n: number): number {
  if (n < 0) {
    throw new Error('Input must be a non-negative integer');
  }

  if (n <= 1) return n;
  return fibonacciRecursive(n - 1) + fibonacciRecursive(n - 2);
}

/**
 * Iterative implementation of Fibonacci sequence (default export)
 * @param n The index of the Fibonacci number to calculate (0-indexed)
 * @returns The Fibonacci number at the given index
 */
export default function fibonacci(n: number): number {
  if (n < 0) {
    throw new Error('Input must be a non-negative integer');
  }

  if (n <= 1) return n;

  let prev = 0;
  let current = 1;

  for (let i = 2; i <= n; i++) {
    const next = prev + current;
    prev = current;
    current = next;
  }

  return current;
}

/**
 * Generates a Fibonacci sequence up to the nth number
 * @param n The length of the sequence to generate
 * @returns An array of Fibonacci numbers
 * @throws {Error} If n is negative
 */
export function fibonacciSequence(n: number): number[] {
  if (n < 0) {
    throw new Error('Sequence length cannot be negative');
  }

  const sequence: number[] = [];
  for (let i = 0; i < n; i++) {
    sequence.push(fibonacci(i));
  }

  return sequence;
}