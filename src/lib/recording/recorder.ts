// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Terminal Session Recorder
 *
 * Captures terminal output, user input, and resize events into
 * asciicast v2 NDJSON format. Designed to hook into both SSH
 * (TerminalView WebSocket frames) and local (LocalTerminalView
 * Tauri events) terminal data paths.
 *
 * Usage:
 *   const recorder = new TerminalRecorder();
 *   recorder.start(120, 30, { title: 'My Session' });
 *   // In data handler:
 *   recorder.recordOutput(payloadBytes);
 *   // On user input:
 *   recorder.recordInput(data);
 *   // On resize:
 *   recorder.recordResize(cols, rows);
 *   // When done:
 *   const cast = recorder.stop();
 */

import type {
  AsciicastHeader,
  AsciicastEvent,
  AsciicastTheme,
  RecordingState,
} from './types';
import { serialiseAsciicast, mergeAdjacentEvents } from './asciicast';

// ── Configuration ────────────────────────────────────────────────────────────

export type RecorderOptions = {
  /** Recording title */
  title?: string;
  /** Record user input events (default: false for security) */
  captureInput?: boolean;
  /** Merge adjacent output events within this ms window (default: 16) */
  mergeThresholdMs?: number;
  /** Maximum idle time in seconds (0 = no limit, default: 0) */
  idleTimeLimit?: number;
  /** Terminal theme to embed in the cast file */
  theme?: AsciicastTheme;
  /** Environment variables to include */
  env?: Record<string, string>;
};

const DEFAULT_OPTIONS: Required<RecorderOptions> = {
  title: '',
  captureInput: false,
  mergeThresholdMs: 16,
  idleTimeLimit: 0,
  theme: undefined as unknown as AsciicastTheme,
  env: { TERM: 'xterm-256color' },
};

// ── Recorder ─────────────────────────────────────────────────────────────────

const textDecoder = new TextDecoder();

export class TerminalRecorder {
  private events: AsciicastEvent[] = [];
  private startTime = 0;
  private pauseOffset = 0;
  private pauseStart = 0;
  private state: RecordingState = 'idle';
  private cols = 80;
  private rows = 24;
  private options: Required<RecorderOptions> = { ...DEFAULT_OPTIONS };

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Begin recording. Resets all state.
   */
  start(cols: number, rows: number, options?: RecorderOptions): void {
    this.events = [];
    this.cols = cols;
    this.rows = rows;
    this.startTime = performance.now();
    this.pauseOffset = 0;
    this.pauseStart = 0;
    this.state = 'recording';
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Pause recording. Events received while paused are discarded.
   * Pause time is subtracted from event timestamps.
   */
  pause(): void {
    if (this.state !== 'recording') return;
    this.pauseStart = performance.now();
    this.state = 'paused';
  }

  /**
   * Resume a paused recording.
   */
  resume(): void {
    if (this.state !== 'paused') return;
    this.pauseOffset += performance.now() - this.pauseStart;
    this.pauseStart = 0;
    this.state = 'recording';
  }

  /**
   * Stop recording and return the asciicast v2 content as a string.
   * Optionally merges adjacent events before output.
   */
  stop(): string {
    if (this.state === 'idle') return '';
    if (this.state === 'paused') {
      // Account for final pause duration
      this.pauseOffset += performance.now() - this.pauseStart;
    }

    this.state = 'idle';

    // Merge adjacent output events
    const merged = mergeAdjacentEvents(this.events, this.options.mergeThresholdMs);

    const duration = merged.length > 0 ? merged[merged.length - 1][0] : 0;

    const header: AsciicastHeader = {
      version: 2,
      width: this.cols,
      height: this.rows,
      timestamp: Math.floor(Date.now() / 1000),
      duration,
      env: this.options.env,
    };

    if (this.options.title) header.title = this.options.title;
    if (this.options.idleTimeLimit > 0) header.idle_time_limit = this.options.idleTimeLimit;
    if (this.options.theme) header.theme = this.options.theme;

    const content = serialiseAsciicast(header, merged);

    // Clear events to free memory
    this.events = [];

    return content;
  }

  /**
   * Discard the recording without producing output.
   */
  discard(): void {
    this.state = 'idle';
    this.events = [];
  }

  // ── Event Recording ──────────────────────────────────────────────────────

  /**
   * Record terminal output data.
   * Called from the WebSocket MSG_TYPE_DATA handler or local PTY data listener.
   *
   * @param data Raw VT output bytes (Uint8Array)
   */
  recordOutput(data: Uint8Array): void {
    if (this.state !== 'recording') return;
    const elapsed = this.elapsed();
    const text = textDecoder.decode(data);
    this.events.push([elapsed, 'o', text]);
  }

  /**
   * Record user keyboard input.
   * Only active if `captureInput` option is enabled.
   *
   * @param data Input string from terminal.onData()
   */
  recordInput(data: string): void {
    if (this.state !== 'recording') return;
    if (!this.options.captureInput) return;
    const elapsed = this.elapsed();
    this.events.push([elapsed, 'i', data]);
  }

  /**
   * Record a terminal resize event.
   */
  recordResize(cols: number, rows: number): void {
    if (this.state !== 'recording') return;
    const elapsed = this.elapsed();
    this.cols = cols;
    this.rows = rows;
    this.events.push([elapsed, 'r', `${cols}x${rows}`]);
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  getState(): RecordingState {
    return this.state;
  }

  getEventCount(): number {
    return this.events.length;
  }

  /**
   * Get current recording elapsed time in seconds.
   */
  getElapsed(): number {
    if (this.state === 'idle') return 0;
    return this.elapsed();
  }

  isRecording(): boolean {
    return this.state === 'recording';
  }

  isPaused(): boolean {
    return this.state === 'paused';
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Calculate elapsed time in seconds, excluding paused intervals.
   * Uses 6-decimal precision (µs) to match asciicast spec.
   */
  private elapsed(): number {
    const now = performance.now();
    const currentPause = this.state === 'paused'
      ? (now - this.pauseStart)
      : 0;
    const rawMs = now - this.startTime - this.pauseOffset - currentPause;
    return parseFloat((rawMs / 1000).toFixed(6));
  }
}
