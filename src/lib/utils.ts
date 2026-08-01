import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes using clsx for conditional logic and
 * tailwind-merge to eliminate conflicting utility classes.
 *
 * This is the canonical cn() helper used by shadcn/ui components.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
