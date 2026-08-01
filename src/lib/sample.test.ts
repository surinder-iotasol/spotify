/**
 * STORY-setup-009: Sample unit test verifying Vitest configuration.
 *
 * Exercises the project's shared utility to confirm Vitest, the @ alias,
 * and co-located testing all work together before any feature tests are added.
 */
import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('sample', () => {
  it('cn() merges classes correctly (smoke test)', () => {
    expect(cn('text-sm', 'font-bold')).toBe('text-sm font-bold');
  });

  it('cn() overrides conflicting classes', () => {
    expect(cn('bg-blue-500', 'bg-red-500')).toBe('bg-red-500');
  });

  it('cn() ignores falsy values', () => {
    expect(cn('a', false, 'b', null, undefined, 'c')).toBe('a b c');
  });
});
