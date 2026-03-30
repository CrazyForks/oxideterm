// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Plugin-scoped localStorage wrapper
 *
 * Each plugin gets its own key namespace: `oxide-plugin-{pluginId}-{key}`
 * Provides get/set/remove with automatic JSON serialization.
 */

const PREFIX = 'oxide-plugin-';

function scopedKey(pluginId: string, key: string): string {
  return `${PREFIX}${pluginId}-${key}`;
}

export function createPluginStorage(pluginId: string) {
  return {
    get<T>(key: string): T | null {
      try {
        const raw = localStorage.getItem(scopedKey(pluginId, key));
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    set<T>(key: string, value: T): void {
      try {
        localStorage.setItem(scopedKey(pluginId, key), JSON.stringify(value));
      } catch {
        // localStorage full or other error — swallow
      }
    },

    remove(key: string): void {
      localStorage.removeItem(scopedKey(pluginId, key));
    },
  };
}

/**
 * Remove all localStorage entries for a given plugin.
 * Called when uninstalling a plugin with data cleanup.
 */
export function clearPluginStorage(pluginId: string): void {
  const prefix = scopedKey(pluginId, '');
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
