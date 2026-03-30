// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Asciicast Playback Engine
 *
 * Drives playback of .cast files using a real xterm.js Terminal instance.
 * Supports play/pause, variable speed, and fast seeking via periodic
 * terminal-state snapshots (built with @xterm/addon-serialize).
 *
 * For the UI wrapper component see CastPlayer.tsx.
 */

import { Terminal } from '@xterm/xterm';
import { SerializeAddon } from '@xterm/addon-serialize';
import type {
  AsciicastEvent,
  AsciicastHeader,
  PlaybackState,
  PlaybackSpeed,
  TerminalSnapshot,
} from './types';
import { parseAsciicast, applyIdleTimeLimit } from './asciicast';

// ── Configuration ────────────────────────────────────────────────────────────

/** Interval (seconds) between terminal-state snapshots for seeking */
const SNAPSHOT_INTERVAL_SEC = 5;

// ── Playback Engine ──────────────────────────────────────────────────────────

export type PlayerCallbacks = {
  /** Called on every frame with current time and total duration */
  onProgress?: (currentTime: number, duration: number) => void;
  /** Called when playback state changes */
  onStateChange?: (state: PlaybackState) => void;
  /** Called when playback reaches the end */
  onFinished?: () => void;
};

export class AsciicastPlayer {
  private terminal: Terminal;
  private serializeAddon: SerializeAddon;
  private header: AsciicastHeader;
  private events: AsciicastEvent[];
  private outputEvents: { index: number; time: number; data: string }[] = [];
  private snapshots: TerminalSnapshot[] = [];

  // Playback state
  private state: PlaybackState = 'idle';
  private speed: PlaybackSpeed = 1;
  private currentIndex = 0;
  private playbackStartWall = 0;
  private playbackStartTime = 0; // cast-time of playback resume
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private callbacks: PlayerCallbacks = {};
  private progressRafId: number | null = null;

  constructor(terminal: Terminal, callbacks?: PlayerCallbacks) {
    this.terminal = terminal;
    this.serializeAddon = new SerializeAddon();
    this.terminal.loadAddon(this.serializeAddon);
    this.header = { version: 2, width: 80, height: 24 };
    this.events = [];
    if (callbacks) this.callbacks = callbacks;
  }

  // ── Load ───────────────────────────────────────────────────────────────

  /**
   * Load a .cast file content string.
   * Parses the file, applies idle time limit, and builds seek snapshots.
   */
  load(content: string): { header: AsciicastHeader; duration: number } {
    const { header, events } = parseAsciicast(content);
    this.header = header;

    // Apply idle time compression if specified
    this.events = header.idle_time_limit
      ? applyIdleTimeLimit(events, header.idle_time_limit)
      : events;

    // Pre-filter output events for fast iteration
    this.outputEvents = [];
    for (let i = 0; i < this.events.length; i++) {
      const [time, type, data] = this.events[i];
      if (type === 'o') {
        this.outputEvents.push({ index: i, time, data });
      }
    }

    // Resize terminal to match recording
    this.terminal.resize(header.width, header.height);

    // Build snapshots for seeking
    this.buildSnapshots();

    this.state = 'idle';
    this.currentIndex = 0;

    const duration = this.getDuration();
    return { header, duration };
  }

  /**
   * Load from a parsed header + events (skip parsing step).
   */
  loadParsed(header: AsciicastHeader, events: AsciicastEvent[]): void {
    this.header = header;
    this.events = header.idle_time_limit
      ? applyIdleTimeLimit(events, header.idle_time_limit)
      : events;

    this.outputEvents = [];
    for (let i = 0; i < this.events.length; i++) {
      const [time, type, data] = this.events[i];
      if (type === 'o') {
        this.outputEvents.push({ index: i, time, data });
      }
    }

    this.terminal.resize(header.width, header.height);
    this.buildSnapshots();
    this.state = 'idle';
    this.currentIndex = 0;
  }

  // ── Snapshot Building ──────────────────────────────────────────────────

  private buildSnapshots(): void {
    this.snapshots = [];

    // Use a hidden terminal for snapshot generation
    const snapshotTerm = new Terminal({
      cols: this.header.width,
      rows: this.header.height,
      allowProposedApi: true,
    });
    const snapshotSerialize = new SerializeAddon();
    snapshotTerm.loadAddon(snapshotSerialize);

    // We need the terminal to be "open" for the serializer to work,
    // but we don't need it visible. Create a detached container.
    const offscreen = document.createElement('div');
    offscreen.style.position = 'absolute';
    offscreen.style.left = '-9999px';
    offscreen.style.visibility = 'hidden';
    document.body.appendChild(offscreen);
    snapshotTerm.open(offscreen);

    let lastSnapshotTime = -Infinity;

    // Initial snapshot at t=0
    this.snapshots.push({
      time: 0,
      eventIndex: 0,
      serializedState: '',
    });

    for (let i = 0; i < this.outputEvents.length; i++) {
      const { time, data } = this.outputEvents[i];
      snapshotTerm.write(data);

      if (time - lastSnapshotTime >= SNAPSHOT_INTERVAL_SEC) {
        this.snapshots.push({
          time,
          eventIndex: i + 1,
          serializedState: snapshotSerialize.serialize(),
        });
        lastSnapshotTime = time;
      }
    }

    // Cleanup
    snapshotTerm.dispose();
    offscreen.remove();
  }

  // ── Playback Controls ──────────────────────────────────────────────────

  play(): void {
    if (this.outputEvents.length === 0) return;

    if (this.state === 'finished') {
      // Restart from beginning
      this.terminal.reset();
      this.currentIndex = 0;
    }

    this.state = 'playing';
    this.playbackStartWall = performance.now();
    this.playbackStartTime = this.currentIndex > 0
      ? this.outputEvents[Math.min(this.currentIndex, this.outputEvents.length - 1)].time
      : 0;

    this.callbacks.onStateChange?.('playing');
    this.scheduleNext();
    this.startProgressUpdates();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.cancelScheduled();
    this.stopProgressUpdates();
    this.state = 'paused';
    this.callbacks.onStateChange?.('paused');
  }

  togglePlayPause(): void {
    if (this.state === 'playing') this.pause();
    else this.play();
  }

  /**
   * Seek to a specific time (seconds).
   * Uses snapshots for fast seeking if available.
   */
  seek(targetTime: number): void {
    this.cancelScheduled();
    const wasPlaying = this.state === 'playing';

    // Clamp target
    const duration = this.getDuration();
    targetTime = Math.max(0, Math.min(targetTime, duration));

    // Find nearest snapshot before targetTime
    let snapshot = this.snapshots[0];
    for (const s of this.snapshots) {
      if (s.time <= targetTime) snapshot = s;
      else break;
    }

    // Restore terminal from snapshot
    this.terminal.reset();
    if (snapshot.serializedState) {
      this.terminal.write(snapshot.serializedState);
    }

    // Replay output events from snapshot to target time
    let nextIdx = 0;
    for (let i = snapshot.eventIndex; i < this.outputEvents.length; i++) {
      const { time, data } = this.outputEvents[i];
      if (time > targetTime) break;
      this.terminal.write(data);
      nextIdx = i + 1;
    }

    this.currentIndex = nextIdx;

    // Handle resize events up to targetTime
    for (const [time, type, data] of this.events) {
      if (time > targetTime) break;
      if (type === 'r') {
        const [cols, rows] = data.split('x').map(Number);
        if (cols > 0 && rows > 0) {
          this.terminal.resize(cols, rows);
        }
      }
    }

    this.callbacks.onProgress?.(targetTime, duration);

    if (targetTime >= duration) {
      this.state = 'finished';
      this.callbacks.onStateChange?.('finished');
      this.callbacks.onFinished?.();
      return;
    }

    if (wasPlaying) {
      this.playbackStartWall = performance.now();
      this.playbackStartTime = targetTime;
      this.state = 'playing';
      this.scheduleNext();
      this.startProgressUpdates();
    } else {
      this.state = 'paused';
      this.callbacks.onStateChange?.('paused');
    }
  }

  setSpeed(speed: PlaybackSpeed): void {
    const wasPlaying = this.state === 'playing';
    if (wasPlaying) {
      // Recalculate playback time reference
      const currentCastTime = this.getCurrentTime();
      this.speed = speed;
      this.playbackStartWall = performance.now();
      this.playbackStartTime = currentCastTime;
      this.cancelScheduled();
      this.scheduleNext();
    } else {
      this.speed = speed;
    }
  }

  getSpeed(): PlaybackSpeed {
    return this.speed;
  }

  reset(): void {
    this.cancelScheduled();
    this.stopProgressUpdates();
    this.terminal.reset();
    this.currentIndex = 0;
    this.state = 'idle';
    this.callbacks.onStateChange?.('idle');
  }

  getState(): PlaybackState {
    return this.state;
  }

  getDuration(): number {
    if (this.header.duration) return this.header.duration;
    if (this.outputEvents.length === 0) return 0;
    return this.outputEvents[this.outputEvents.length - 1].time;
  }

  getCurrentTime(): number {
    if (this.state === 'idle') return 0;
    if (this.state === 'finished') return this.getDuration();
    if (this.state === 'paused') {
      if (this.currentIndex === 0) return 0;
      const idx = Math.min(this.currentIndex - 1, this.outputEvents.length - 1);
      return idx >= 0 ? this.outputEvents[idx].time : 0;
    }
    // playing: compute from wall clock
    const wallElapsed = (performance.now() - this.playbackStartWall) / 1000;
    return this.playbackStartTime + wallElapsed * this.speed;
  }

  getHeader(): AsciicastHeader {
    return this.header;
  }

  dispose(): void {
    this.cancelScheduled();
    this.stopProgressUpdates();
    this.serializeAddon.dispose();
    this.events = [];
    this.outputEvents = [];
    this.snapshots = [];
  }

  // ── Internal Scheduling ────────────────────────────────────────────────

  private scheduleNext(): void {
    if (this.currentIndex >= this.outputEvents.length) {
      this.stopProgressUpdates();
      this.state = 'finished';
      this.callbacks.onStateChange?.('finished');
      this.callbacks.onFinished?.();
      this.callbacks.onProgress?.(this.getDuration(), this.getDuration());
      return;
    }

    const event = this.outputEvents[this.currentIndex];
    const currentCastTime = this.playbackStartTime +
      ((performance.now() - this.playbackStartWall) / 1000) * this.speed;
    const delay = Math.max(0, ((event.time - currentCastTime) / this.speed) * 1000);

    this.timerId = setTimeout(() => {
      if (this.state !== 'playing') return;

      // Write all events that should have been rendered by now
      const now = performance.now();
      const castTimeNow = this.playbackStartTime +
        ((now - this.playbackStartWall) / 1000) * this.speed;

      while (
        this.currentIndex < this.outputEvents.length &&
        this.outputEvents[this.currentIndex].time <= castTimeNow
      ) {
        this.terminal.write(this.outputEvents[this.currentIndex].data);

        // Also apply any resize events between output events
        this.applyResizesBefore(this.outputEvents[this.currentIndex].time);

        this.currentIndex++;
      }

      this.scheduleNext();
    }, delay);
  }

  private applyResizesBefore(upToTime: number): void {
    for (const [time, type, data] of this.events) {
      if (time > upToTime) break;
      if (type === 'r') {
        const [cols, rows] = data.split('x').map(Number);
        if (cols > 0 && rows > 0) {
          this.terminal.resize(cols, rows);
        }
      }
    }
  }

  private cancelScheduled(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  // ── Progress Updates ───────────────────────────────────────────────────

  private startProgressUpdates(): void {
    this.stopProgressUpdates();
    const update = () => {
      if (this.state !== 'playing') return;
      this.callbacks.onProgress?.(this.getCurrentTime(), this.getDuration());
      this.progressRafId = requestAnimationFrame(update);
    };
    this.progressRafId = requestAnimationFrame(update);
  }

  private stopProgressUpdates(): void {
    if (this.progressRafId !== null) {
      cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
  }

  // ── Static Helpers ─────────────────────────────────────────────────────

  /**
   * Search output events for a text substring.
   * Returns list of matches with time offsets.
   */
  searchText(query: string, caseSensitive = false): { time: number; snippet: string }[] {
    const results: { time: number; snippet: string }[] = [];
    const q = caseSensitive ? query : query.toLowerCase();

    for (const { time, data } of this.outputEvents) {
      const haystack = caseSensitive ? data : data.toLowerCase();
      if (haystack.includes(q)) {
        // Extract a context snippet
        const idx = haystack.indexOf(q);
        const start = Math.max(0, idx - 20);
        const end = Math.min(data.length, idx + query.length + 20);
        // Strip ANSI escape sequences from snippet
        const snippet = data.slice(start, end).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
        results.push({ time, snippet });
      }
    }

    return results;
  }
}
