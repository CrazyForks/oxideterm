/**
 * Plugin Snapshot Utilities
 *
 * Provides deep-freeze and sanitization helpers for plugin-facing data.
 * All data exposed to plugins goes through these functions to ensure
 * immutability (Object.freeze) and sensitive data removal.
 */

/**
 * Deep-freeze an object and all its enumerable properties.
 * Returns the same reference, now frozen.
 */
export function freezeSnapshot<T>(obj: T): Readonly<T> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const value of Object.values(obj as Record<string, unknown>)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      freezeSnapshot(value);
    }
  }
  return obj as Readonly<T>;
}

/**
 * Sanitize an object for plugin consumption by redacting specified keys.
 * Returns a shallow copy with redacted fields set to '[redacted]'.
 * Useful for AI message content that may contain terminal buffer data.
 */
export function sanitizeForPlugin<T extends Record<string, unknown>>(
  obj: T,
  redactKeys: string[],
): T {
  const redactSet = new Set(redactKeys);
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (redactSet.has(key) && typeof result[key] === 'string') {
      (result as Record<string, unknown>)[key] = '[redacted]';
    }
  }
  return result;
}
