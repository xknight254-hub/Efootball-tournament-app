// clsx and tailwind-merge are runtime-only (no @types needed)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const clsx = require('clsx');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { twMerge } = require('tailwind-merge');

type ClassValue = string | number | boolean | undefined | null | ClassValue[] | Record<string, boolean>;

/**
 * Tailwind-merge + clsx utility.
 * Resolves conflicting Tailwind classes (e.g. cn('p-4', 'p-2') → 'p-2').
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
