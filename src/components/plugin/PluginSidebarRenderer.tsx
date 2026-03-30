// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Plugin Sidebar Renderer
 *
 * Wraps plugin-provided sidebar panel components in an ErrorBoundary.
 * Looks up the component from pluginStore.sidebarPanels by composite key.
 */

import { usePluginStore } from '../../store/pluginStore';
import { ErrorBoundary } from '../ErrorBoundary';

type PluginSidebarRendererProps = {
  panelKey: string;  // "pluginId:panelId"
};

export function PluginSidebarRenderer({ panelKey }: PluginSidebarRendererProps) {
  const panel = usePluginStore((state) => state.sidebarPanels.get(panelKey));

  if (!panel) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        Plugin panel not available
      </div>
    );
  }

  const Component = panel.component;

  return (
    <ErrorBoundary
      fallback={
        <div className="flex items-center justify-center h-32 text-destructive text-xs">
          Plugin panel crashed
        </div>
      }
    >
      <Component />
    </ErrorBoundary>
  );
}
