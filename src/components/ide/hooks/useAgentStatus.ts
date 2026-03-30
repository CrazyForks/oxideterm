// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

// src/components/ide/hooks/useAgentStatus.ts
//
// Hook for tracking Agent deployment status and providing
// a reactive indicator to the IDE UI.

import { useState, useEffect, useCallback, useRef } from 'react';
import { nodeAgentStatus } from '../../../lib/api';
import type { AgentStatus } from '../../../types';

export type AgentMode = 'agent' | 'sftp' | 'checking' | 'deploying' | 'manual-upload';

interface AgentStatusInfo {
  /** Current operating mode */
  mode: AgentMode;
  /** Detailed agent status from backend */
  status: AgentStatus | null;
  /** Human-readable label */
  label: string;
  /** Whether the agent is the active transport */
  isAgent: boolean;
  /** Refresh the status */
  refresh: () => void;
}

/**
 * Track agent readiness for a given node.
 * Returns reactive mode info for status bar display.
 */
export function useAgentStatus(nodeId: string | undefined): AgentStatusInfo {
  const [mode, setMode] = useState<AgentMode>('checking');
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!nodeId) return;

    try {
      const s = await nodeAgentStatus(nodeId);
      if (!mountedRef.current) return;

      setStatus(s);
      switch (s.type) {
        case 'ready':
          setMode('agent');
          break;
        case 'deploying':
          setMode('deploying');
          break;
        case 'manualUploadRequired':
          setMode('manual-upload');
          break;
        case 'notDeployed':
        case 'unsupportedArch':
        case 'failed':
        default:
          setMode('sftp');
          break;
      }
    } catch {
      if (!mountedRef.current) return;
      setMode('sftp');
      setStatus(null);
    }
  }, [nodeId]);

  useEffect(() => {
    mountedRef.current = true;
    if (nodeId) {
      refresh();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [nodeId, refresh]);

  // Poll while the agent is not yet ready (checking, deploying, or sftp).
  // Once deployed, the agent may become ready after the background deploy
  // finishes. Stop polling once we reach the 'agent' state or 'manual-upload' state (requires user action).
  useEffect(() => {
    if (!nodeId || mode === 'agent' || mode === 'manual-upload') return;

    // Poll more aggressively while deploying/checking, slower for sftp
    const interval = mode === 'deploying' || mode === 'checking' ? 2000 : 5000;
    let attempts = 0;
    const maxAttempts = mode === 'sftp' ? 6 : 15; // sftp: 30s max, deploying: 30s max

    const timer = setInterval(() => {
      attempts++;
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        return;
      }
      refresh();
    }, interval);

    return () => clearInterval(timer);
  }, [nodeId, mode, refresh]);

  const isAgent = mode === 'agent';

  const label = (() => {
    switch (mode) {
      case 'agent':
        return 'Agent';
      case 'deploying':
        return 'Agent…';
      case 'checking':
        return '…';
      case 'manual-upload':
        return 'SFTP';  // Still SFTP mode, but with hint available
      case 'sftp':
      default:
        return 'SFTP';
    }
  })();

  return { mode, status, label, isAgent, refresh };
}
