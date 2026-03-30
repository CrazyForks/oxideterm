// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Creates a type guard function for a union of string literals.
 * Uses TS 5.0+ const type parameter to preserve literal types from the input array.
 * 
 * @example
 * const FORWARD_TYPES = ['local', 'remote', 'dynamic'] as const;
 * const isForwardType = createTypeGuard(FORWARD_TYPES);
 * // isForwardType(value) returns `value is 'local' | 'remote' | 'dynamic'`
 */
export function createTypeGuard<const T extends readonly string[]>(
  values: T
): (value: unknown) => value is T[number] {
  const set = new Set<unknown>(values);
  return (value: unknown): value is T[number] => set.has(value);
}
