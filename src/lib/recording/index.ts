// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Recording module barrel export
 */
export { TerminalRecorder } from './recorder';
export type { RecorderOptions } from './recorder';
export { AsciicastPlayer } from './player';
export type { PlayerCallbacks } from './player';
export { parseAsciicast, serialiseAsciicast, mergeAdjacentEvents, applyIdleTimeLimit } from './asciicast';
export type { ParsedCast } from './asciicast';
export * from './types';
