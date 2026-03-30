// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Asciicast v2 Format Type Definitions
 *
 * Implements the asciicast v2 NDJSON format used by asciinema.org.
 * Each .cast file is a newline-delimited JSON: header line + event lines.
 *
 * @see https://docs.asciinema.org/manual/asciicast/v2/
 */

// ── Header ───────────────────────────────────────────────────────────────────

export type AsciicastHeader = {
  /** Format version, always 2 */
  version: 2;
  /** Terminal width in columns */
  width: number;
  /** Terminal height in rows */
  height: number;
  /** Unix timestamp of recording start (seconds) */
  timestamp?: number;
  /** Total recording duration (seconds, float) */
  duration?: number;
  /** Maximum idle time between events (seconds); longer gaps are compressed */
  idle_time_limit?: number;
  /** Shell command that was recorded */
  command?: string;
  /** Recording title */
  title?: string;
  /** Environment variables captured at recording start */
  env?: Record<string, string>;
  /** Terminal colour theme */
  theme?: AsciicastTheme;
};

export type AsciicastTheme = {
  /** Foreground colour (CSS hex) */
  fg: string;
  /** Background colour (CSS hex) */
  bg: string;
  /** Colon-separated ANSI palette (16 colours) */
  palette?: string;
};

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * Event type codes:
 *  - "o" = terminal output (rendered to screen)
 *  - "i" = user input (keyboard)
 *  - "r" = terminal resize ("COLSxROWS")
 *  - "m" = marker / bookmark (v2.2 draft)
 */
export type AsciicastEventType = 'o' | 'i' | 'r' | 'm';

/**
 * A single asciicast event: [relativeTime, type, data]
 *
 * - relativeTime: seconds since recording start (µs precision)
 * - type: event category
 * - data: raw VT data (output/input), "COLSxROWS" (resize), or label (marker)
 */
export type AsciicastEvent = [number, AsciicastEventType, string];

// ── Legacy v1 (import-only) ──────────────────────────────────────────────────

export type AsciicastV1 = {
  version: 1;
  width: number;
  height: number;
  duration?: number;
  command?: string;
  title?: string;
  env?: Record<string, string>;
  /** v1 stores events inline as [time, data] tuples */
  stdout: [number, string][];
};

// ── Recording State ──────────────────────────────────────────────────────────

export type RecordingState = 'idle' | 'recording' | 'paused';

export type RecordingMetadata = {
  /** Session ID being recorded */
  sessionId: string;
  /** Terminal type */
  terminalType: 'ssh' | 'local';
  /** Connection label / host */
  label: string;
  /** Recording start timestamp */
  startedAt: number;
  /** Total event count */
  eventCount: number;
  /** Elapsed recording time (seconds) */
  elapsed: number;
};

// ── Playback State ───────────────────────────────────────────────────────────

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'finished';

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 1.5 | 2 | 4 | 8;

export const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 1.5, 2, 4, 8];

// ── Snapshot (for seek optimisation) ─────────────────────────────────────────

export type TerminalSnapshot = {
  /** Time offset (seconds from start) */
  time: number;
  /** Index into events array */
  eventIndex: number;
  /** Serialised terminal state (VT escape sequences from SerializeAddon) */
  serializedState: string;
};
