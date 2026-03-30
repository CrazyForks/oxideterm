// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Plugin i18n Manager
 *
 * Wraps i18next to provide plugin-scoped translation functions.
 * Plugin keys are automatically prefixed: `plugin.{pluginId}.{key}`
 * Plugin locale files are loaded via `i18n.addResourceBundle()`.
 */

import i18n from 'i18next';

export function createPluginI18nManager(pluginId: string) {
  const prefix = `plugin.${pluginId}.`;

  return {
    /** Translate a key (auto-prefixed with plugin namespace) */
    t(key: string, params?: Record<string, string | number>): string {
      return i18n.t(`${prefix}${key}`, params as Record<string, string>) || key;
    },

    /** Get current language */
    getLanguage(): string {
      return i18n.language;
    },

    /** Subscribe to language changes */
    onLanguageChange(handler: (lang: string) => void): () => void {
      const callback = (lng: string) => {
        try { handler(lng); } catch { /* swallow */ }
      };
      i18n.on('languageChanged', callback);
      return () => {
        i18n.off('languageChanged', callback);
      };
    },
  };
}

/**
 * Load plugin locale resources into i18next.
 * Called during plugin loading if the plugin provides a locales directory.
 */
export async function loadPluginI18n(
  pluginId: string,
  locales: Record<string, Record<string, string>>,
): Promise<void> {
  for (const [lang, translations] of Object.entries(locales)) {
    // Nest under `plugin.{pluginId}` namespace
    const nested: Record<string, unknown> = { plugin: { [pluginId]: translations } };
    i18n.addResourceBundle(lang, 'translation', nested, true, true);
  }
}

/**
 * Remove plugin locale resources from i18next.
 */
export function removePluginI18n(pluginId: string): void {
  // i18next doesn't have a clean removeResourceBundle API for nested keys.
  // We overwrite the plugin namespace with empty object for each language.
  for (const lang of Object.keys(i18n.store.data)) {
    const nested: Record<string, unknown> = { plugin: { [pluginId]: {} } };
    i18n.addResourceBundle(lang, 'translation', nested, true, true);
  }
}
