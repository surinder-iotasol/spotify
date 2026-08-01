/**
 * STORY-setup-003: Unit test for the cn() utility helper.
 *
 * Verifies that clsx + tailwind-merge correctly merges Tailwind CSS classes,
 * handling conflicts (later classes win), falsy values, and arrays.
 */
import { describe, expect, it } from 'vitest';

// Import the cn function from the project's shared utility module.
import { cn } from '@/lib/utils';

describe('cn() utility', () => {
  it('returns a single class string unchanged', () => {
    expect(cn('bg-red-500')).toBe('bg-red-500');
  });

  it('returns an empty string when called with no arguments', () => {
    expect(cn()).toBe('');
  });

  it('ignores falsy values (null, undefined, false)', () => {
    expect(cn('text-sm', null, undefined, false, 'font-bold')).toBe('text-sm font-bold');
  });

  it('merges conflicting Tailwind classes — later class wins', () => {
    // bg-blue-500 overridden by bg-red-500
    expect(cn('bg-blue-500', 'bg-red-500')).toBe('bg-red-500');
  });

  it('combines non-conflicting classes with space-separated result', () => {
    expect(cn('text-sm', 'font-bold', 'bg-white')).toBe('text-sm font-bold bg-white');
  });

  it('handles arrays of classes', () => {
    expect(cn(['text-sm', 'font-bold'], 'bg-white')).toBe('text-sm font-bold bg-white');
  });

  it('handles nested arrays', () => {
    expect(cn(['text-sm', ['font-bold', 'underline']])).toBe('text-sm font-bold underline');
  });

  it('merges conditional classes using ternary expressions', () => {
    const isActive = true;
    expect(cn('base-class', isActive && 'active-class')).toBe('base-class active-class');

    const isDisabled = false;
    expect(cn('base-class', isDisabled && 'disabled-class')).toBe('base-class');
  });

  it('preserves order with tailwind-merge so later conflicting wins', () => {
    // p-2 overridden by p-4
    expect(cn('p-2', 'p-4')).toBe('p-4');
    // m-2 overridden by m-4
    expect(cn('m-2', 'm-4')).toBe('m-4');
  });

  it('handles empty strings gracefully', () => {
    expect(cn('text-sm', '', 'font-bold')).toBe('text-sm font-bold');
  });
});
