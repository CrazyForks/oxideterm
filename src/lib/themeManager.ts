// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { themes } from './themes';

/**
 * Apply a global theme to the entire application
 * This function:
 * 1. Sets the data-theme attribute on the document root
 * 2. Dispatches an event for xterm.js terminals to update
 */
export const applyGlobalTheme = (themeName: string) => {
  // Validate theme exists
  if (!themes[themeName]) {
    console.warn(`Theme "${themeName}" not found, falling back to default`);
    themeName = 'default';
  }

  // Set data-theme attribute for CSS variables
  document.documentElement.setAttribute('data-theme', themeName);

  // Dispatch event for terminal components to update their xterm instances
  window.dispatchEvent(
    new CustomEvent('global-theme-changed', {
      detail: {
        themeName,
        xtermTheme: themes[themeName],
      },
    })
  );
};

/**
 * Get the current theme name from the document attribute
 */
export const getCurrentTheme = (): string => {
  return document.documentElement.getAttribute('data-theme') || 'default';
};

/**
 * Initialize theme on app startup
 * NOTE: This function is now a NO-OP as theme is managed by settingsStore
 * settingsStore automatically applies the theme during initialization
 * Kept for backwards compatibility
 */
export const initializeTheme = () => {
  // NO-OP: Theme initialization is handled by settingsStore.initializeSettings()
  // which reads the theme from oxide-settings-v2 and applies it automatically
  console.debug('[themeManager] initializeTheme() is deprecated - theme managed by settingsStore');
};
