// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Plugin Icon Resolver
 *
 * Maps icon name strings from plugin manifests to actual Lucide React components.
 * Used by Sidebar.tsx and TabBar.tsx to render plugin-declared icons.
 *
 * Supports:
 *   - Lucide icon names: "LayoutDashboard", "Server", "Activity", etc.
 *   - Falls back to Puzzle icon for unknown/missing names.
 */

import { icons, Puzzle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Resolve a Lucide icon name string to its React component.
 *
 * @param name - PascalCase Lucide icon name (e.g. "LayoutDashboard")
 * @param fallback - Component to use when name is not found (defaults to Puzzle)
 * @returns The Lucide icon component
 *
 * @example
 * ```ts
 * const Icon = resolvePluginIcon('LayoutDashboard'); // => LayoutDashboard component
 * const Icon = resolvePluginIcon('nonexistent');      // => Puzzle component
 * ```
 */
export function resolvePluginIcon(
  name: string | undefined | null,
  fallback: LucideIcon = Puzzle,
): LucideIcon {
  if (!name) return fallback;
  return (icons as Record<string, LucideIcon>)[name] ?? fallback;
}
