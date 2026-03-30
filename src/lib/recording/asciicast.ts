// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Asciicast v1/v2 Format Parser & v2 Writer
 *
 * Handles both reading and writing of asciicast files.
 * v1 files are converted to v2 on import for uniform handling.
 */

import type {
  AsciicastHeader,
  AsciicastEvent,
  AsciicastV1,
} from './types';

// ── Parser ───────────────────────────────────────────────────────────────────

export type ParsedCast = {
  header: AsciicastHeader;
  events: AsciicastEvent[];
};

/**
 * Parse an asciicast file (v1 or v2) from its text content.
 * Automatically detects version and normalises to v2 representation.
 */
export function parseAsciicast(content: string): ParsedCast {
  const trimmed = content.trim();
  if (!trimmed) throw new Error('Empty asciicast file');

  // Detect format: v1 is a single JSON object, v2 is NDJSON (multiple lines)
  const firstChar = trimmed[0];

  // v2: NDJSON format — first line is header, subsequent lines are events
  // Detected by having multiple lines (header + at least one event)
  if (firstChar === '{' && trimmed.includes('\n')) {
    // Check if this looks like NDJSON (has a second line starting with [ or {)
    const newlineIdx = trimmed.indexOf('\n');
    const secondLine = trimmed.substring(newlineIdx + 1).trimStart();
    if (secondLine.length > 0 && (secondLine[0] === '[' || secondLine[0] === '{')) {
      return parseV2(trimmed);
    }
  }

  // v1: entire file is one JSON object with "stdout" array
  if (firstChar === '{') {
    return parseV1(trimmed);
  }

  // v2: first line is header, subsequent lines are events
  return parseV2(trimmed);
}

function parseV1(content: string): ParsedCast {
  const raw: AsciicastV1 = JSON.parse(content);

  if (raw.version !== 1) {
    throw new Error(`Unsupported asciicast version: ${(raw as { version: unknown }).version}`);
  }

  const header: AsciicastHeader = {
    version: 2,
    width: raw.width,
    height: raw.height,
    duration: raw.duration,
    command: raw.command,
    title: raw.title,
    env: raw.env,
  };

  // Convert v1 [time, data] → v2 [time, "o", data]
  const events: AsciicastEvent[] = (raw.stdout || []).map(
    ([time, data]) => [time, 'o', data] as AsciicastEvent
  );

  return { header, events };
}

function parseV2(content: string): ParsedCast {
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) throw new Error('Empty asciicast v2 file');

  const header: AsciicastHeader = JSON.parse(lines[0]);

  if (header.version !== 2) {
    throw new Error(`Expected asciicast v2, got version: ${header.version}`);
  }

  const events: AsciicastEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      const event = JSON.parse(lines[i]) as AsciicastEvent;
      events.push(event);
    } catch {
      // Skip malformed lines (lenient parsing)
      console.warn(`[asciicast] Skipping malformed line ${i + 1}`);
    }
  }

  return { header, events };
}

// ── Writer ───────────────────────────────────────────────────────────────────

/**
 * Serialise a header and events array into asciicast v2 NDJSON format.
 * Returns a string ready for file writing.
 */
export function serialiseAsciicast(
  header: AsciicastHeader,
  events: AsciicastEvent[],
): string {
  const lines: string[] = [JSON.stringify(header)];
  for (const event of events) {
    lines.push(JSON.stringify(event));
  }
  return lines.join('\n') + '\n';
}

/**
 * Merge adjacent output events that are very close in time.
 * Reduces file size for high-frequency terminal output (e.g. htop, logs).
 *
 * @param events Input events
 * @param thresholdMs Events within this ms window are merged (default: 16ms ≈ 1 frame)
 */
export function mergeAdjacentEvents(
  events: AsciicastEvent[],
  thresholdMs = 16,
): AsciicastEvent[] {
  if (events.length <= 1) return events;

  const thresholdSec = thresholdMs / 1000;
  const merged: AsciicastEvent[] = [];
  let current = events[0];

  for (let i = 1; i < events.length; i++) {
    const next = events[i];
    // Only merge consecutive output events within threshold
    if (
      current[1] === 'o' &&
      next[1] === 'o' &&
      next[0] - current[0] < thresholdSec
    ) {
      current = [current[0], 'o', current[2] + next[2]];
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  return merged;
}

/**
 * Apply idle time limit: compress long pauses to `maxIdle` seconds.
 */
export function applyIdleTimeLimit(
  events: AsciicastEvent[],
  maxIdle: number,
): AsciicastEvent[] {
  if (events.length <= 1 || maxIdle <= 0) return events;

  const adjusted: AsciicastEvent[] = [[...events[0]] as AsciicastEvent];
  let cumulativeShift = 0;

  for (let i = 1; i < events.length; i++) {
    const gap = events[i][0] - events[i - 1][0];
    if (gap > maxIdle) {
      cumulativeShift += gap - maxIdle;
    }
    adjusted.push([
      events[i][0] - cumulativeShift,
      events[i][1],
      events[i][2],
    ]);
  }

  return adjusted;
}
