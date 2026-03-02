/**
 * Event Log Capture Hook
 *
 * Listens to Tauri backend events and the reconnect orchestrator store,
 * converting them into EventLogEntry records pushed to eventLogStore.
 *
 * Must be mounted once at the App level (not inside tab components).
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useEventLogStore } from '../store/eventLogStore';
import { useReconnectOrchestratorStore, type ReconnectPhase } from '../store/reconnectOrchestratorStore';
import { topologyResolver } from '../lib/topologyResolver';
import type { EventSeverity } from '../store/eventLogStore';

// ============================================================================
// Backend event payload types (mirrors useConnectionEvents.ts)
// ============================================================================

interface ConnectionStatusEvent {
  connection_id: string;
  status: 'connected' | 'link_down' | 'reconnecting' | 'disconnected';
  affected_children: string[];
  timestamp: number;
}

interface NodeStateEvent {
  type: string;
  node_id: string;
  generation: number;
  state?: string;
  reason?: string;
}

// ============================================================================
// Helpers
// ============================================================================

/** Map connection status to severity */
function statusSeverity(status: string): EventSeverity {
  switch (status) {
    case 'connected': return 'info';
    case 'link_down': return 'error';
    case 'reconnecting': return 'warn';
    case 'disconnected': return 'info';
    default: return 'info';
  }
}

/** Map reconnect phase to severity */
function phaseSeverity(phase: ReconnectPhase): EventSeverity {
  switch (phase) {
    case 'failed': return 'error';
    case 'cancelled': return 'warn';
    case 'done': return 'info';
    default: return 'info';
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useEventLogCapture(): void {
  const addEntry = useEventLogStore((s) => s.addEntry);

  // ── Listen to connection_status_changed from backend ──
  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    listen<ConnectionStatusEvent>('connection_status_changed', (event) => {
      if (!mounted) return;
      const { connection_id, status, affected_children } = event.payload;
      const nodeId = topologyResolver.getNodeId(connection_id) ?? undefined;

      addEntry({
        severity: statusSeverity(status),
        category: 'connection',
        nodeId,
        connectionId: connection_id,
        title: `event_log.events.${status}`,
        detail: affected_children.length > 0
          ? `event_log.events.affected_children:${affected_children.length}`
          : undefined,
        source: 'connection_status_changed',
      });
    }).then((fn) => {
      if (mounted) { unlisten = fn; } else { fn(); }
    });

    return () => { mounted = false; unlisten?.(); };
  }, [addEntry]);

  // ── Listen to node:state from backend ──
  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    listen<NodeStateEvent>('node:state', (event) => {
      if (!mounted) return;
      const payload = event.payload;
      // Only capture ConnectionStateChanged events
      if (payload.type !== 'ConnectionStateChanged') return;

      const severity: EventSeverity =
        payload.state === 'Error' ? 'error'
        : payload.state === 'Disconnected' ? 'warn'
        : 'info';

      addEntry({
        severity,
        category: 'node',
        nodeId: payload.node_id,
        title: `event_log.events.node_state_${(payload.state ?? 'unknown').toLowerCase()}`,
        detail: payload.reason ?? undefined,
        source: 'node:state',
      });
    }).then((fn) => {
      if (mounted) { unlisten = fn; } else { fn(); }
    });

    return () => { mounted = false; unlisten?.(); };
  }, [addEntry]);

  // ── Subscribe to reconnect orchestrator phase changes ──
  useEffect(() => {
    // Track phases we've already logged to avoid duplicates
    const loggedPhases = new Map<string, number>(); // nodeId -> last logged phase index

    const unsubscribe = useReconnectOrchestratorStore.subscribe((state) => {
      const jobEntries = state.jobEntries;
      for (const [nodeId, job] of jobEntries) {
        const lastLoggedIndex = loggedPhases.get(nodeId) ?? 0;
        const history = job.phaseHistory;

        for (let i = lastLoggedIndex; i < history.length; i++) {
          const phaseEvent = history[i];
          // Only log phase starts (result === 'running')
          if (phaseEvent.result !== 'running') continue;

          addEntry({
            severity: phaseSeverity(phaseEvent.phase),
            category: 'reconnect',
            nodeId,
            title: `event_log.events.reconnect_phase`,
            detail: phaseEvent.phase,
            source: 'reconnect_orchestrator',
          });
        }

        loggedPhases.set(nodeId, history.length);
      }
    });

    return () => {
      unsubscribe();
      loggedPhases.clear();
    };
  }, [addEntry]);
}
