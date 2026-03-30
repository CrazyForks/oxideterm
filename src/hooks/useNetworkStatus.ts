// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { api } from '@/lib/api';
import { slog } from '@/lib/structuredLog';

/**
 * 防抖时间（ms）：网络恢复 / 唤醒后等待一小段时间再探测，
 * 避免 WiFi 重连瞬间的瞬态失败。
 */
const PROBE_DEBOUNCE_MS = 2000;

/**
 * 最小探测间隔（ms）：防止频繁探测。
 * 例如快速合盖开盖反复触发 visibilitychange。
 */
const MIN_PROBE_INTERVAL_MS = 10_000;

/**
 * Hook to monitor network status and page visibility.
 *
 * 三层检测：
 *   1. browser online/offline — WiFi 断开、飞行模式
 *   2. visibilitychange — 笔记本合盖/休眠唤醒
 *   3. 后端 15s 心跳 — 兜底（无需此 hook）
 *
 * 当检测到网络恢复或页面从隐藏变为可见时，
 * 主动调用 `probe_connections` 对所有 active SSH 连接做 keepalive 探测。
 * 已死连接会被后端标记 link_down 并通过事件通知 orchestrator 自动重连。
 *
 * Should be mounted once at the app root level.
 */
export function useNetworkStatus(): void {
  const setNetworkOnline = useAppStore((state) => state.setNetworkOnline);
  const lastProbeRef = useRef<number>(0);
  const probeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    /**
     * 防抖探测：延迟 PROBE_DEBOUNCE_MS 后执行，
     * 确保网络/WiFi 有时间完全恢复再发 SSH keepalive。
     */
    const scheduleProbe = (reason: string) => {
      // 检查最小间隔
      const now = Date.now();
      const elapsed = now - lastProbeRef.current;
      if (elapsed < MIN_PROBE_INTERVAL_MS) {
        console.log(`[Network] Probe skipped (last probe ${elapsed}ms ago, min interval ${MIN_PROBE_INTERVAL_MS}ms)`);
        return;
      }

      // 取消之前的待执行探测（折叠多次触发）
      if (probeTimerRef.current) {
        clearTimeout(probeTimerRef.current);
      }

      probeTimerRef.current = setTimeout(async () => {
        probeTimerRef.current = null;

        // 只在有活跃连接时探测
        const connections = useAppStore.getState().connections;
        if (connections.size === 0) {
          console.log(`[Network] No active connections, skipping probe`);
          return;
        }

        console.log(`[Network] 🔍 Probing connections (reason: ${reason})`);
        lastProbeRef.current = Date.now();

        slog({
          component: 'NetworkStatus',
          event: 'probe:start',
          detail: reason,
        });

        try {
          const deadConnections = await api.probeConnections();
          if (deadConnections.length > 0) {
            console.log(`[Network] Probe found ${deadConnections.length} dead connection(s) → orchestrator will handle reconnect`);
            slog({
              component: 'NetworkStatus',
              event: 'probe:dead_found',
              outcome: 'error',
              detail: `${deadConnections.length} dead connection(s)`,
            });
          } else {
            console.log(`[Network] Probe: all connections alive ✅`);
            slog({
              component: 'NetworkStatus',
              event: 'probe:all_alive',
              outcome: 'ok',
            });
          }
        } catch (e) {
          console.warn(`[Network] Probe failed:`, e);
          slog({
            component: 'NetworkStatus',
            event: 'probe:error',
            outcome: 'error',
            detail: e instanceof Error ? e.message : String(e),
          });
        }
      }, PROBE_DEBOUNCE_MS);
    };

    // ─── 1. Browser online/offline ───

    const handleOnline = () => {
      console.log('[Network] 🟢 Browser reports online');
      setNetworkOnline(true);
      // 网络恢复 → 主动探测
      scheduleProbe('network_online');
    };

    const handleOffline = () => {
      console.log('[Network] 🔴 Browser reports offline');
      setNetworkOnline(false);
      // offline 时不探测（肯定会全部失败）
    };

    // ─── 2. Page visibility (sleep/wake) ───

    let lastHiddenAt = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面变为隐藏（合盖/最小化/切换标签页）
        lastHiddenAt = Date.now();
        console.log('[Network] 📴 Page hidden (possible sleep)');
      } else {
        // 页面变为可见（开盖/恢复）
        const hiddenDuration = lastHiddenAt > 0 ? Date.now() - lastHiddenAt : 0;
        console.log(`[Network] 📱 Page visible (was hidden for ${Math.round(hiddenDuration / 1000)}s)`);

        // 只在隐藏超过 5 秒时探测（避免普通标签页切换触发）
        if (hiddenDuration > 5_000) {
          scheduleProbe(`wake_after_${Math.round(hiddenDuration / 1000)}s`);
        }
      }
    };

    // Set initial state
    setNetworkOnline(navigator.onLine);

    // Listen for events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (probeTimerRef.current) {
        clearTimeout(probeTimerRef.current);
      }
    };
  }, [setNetworkOnline]);
}
