// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Plugin Settings Manager
 *
 * Manages per-plugin settings with localStorage persistence.
 * Settings are declared in plugin.json contributes.settings.
 * Storage key pattern: `oxide-plugin-{pluginId}-setting-{settingId}`
 */

import type { PluginManifest, PluginSettingDef } from '../../types/plugin';

const SETTING_PREFIX = 'oxide-plugin-';

function settingKey(pluginId: string, key: string): string {
  return `${SETTING_PREFIX}${pluginId}-setting-${key}`;
}

type ChangeHandler = (newValue: unknown) => void;

export function createPluginSettingsManager(pluginId: string, manifest: PluginManifest) {
  const declaredSettings = new Map<string, PluginSettingDef>();
  for (const def of manifest.contributes?.settings ?? []) {
    declaredSettings.set(def.id, def);
  }

  const changeHandlers = new Map<string, Set<ChangeHandler>>();

  return {
    get<T>(key: string): T {
      const def = declaredSettings.get(key);
      const storageKey = settingKey(pluginId, key);
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw !== null) return JSON.parse(raw) as T;
      } catch { /* fall through to default */ }
      // Return declared default or undefined
      return (def?.default as T) ?? (undefined as T);
    },

    set<T>(key: string, value: T): void {
      const storageKey = settingKey(pluginId, key);
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch { /* swallow */ }

      // Notify change handlers
      const handlers = changeHandlers.get(key);
      if (handlers) {
        for (const handler of handlers) {
          try { handler(value); } catch { /* swallow */ }
        }
      }
    },

    onChange(key: string, handler: ChangeHandler): () => void {
      if (!changeHandlers.has(key)) {
        changeHandlers.set(key, new Set());
      }
      changeHandlers.get(key)!.add(handler);

      return () => {
        const set = changeHandlers.get(key);
        if (set) {
          set.delete(handler);
          if (set.size === 0) changeHandlers.delete(key);
        }
      };
    },

    /** Get all declared settings with their current values */
    getAllSettings(): Array<{ def: PluginSettingDef; value: unknown }> {
      return Array.from(declaredSettings.values()).map((def) => ({
        def,
        value: this.get(def.id),
      }));
    },
  };
}
