// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * useTerminalRecording — hook for session recording integration
 *
 * Provides recording start/stop callbacks and a ref to feed data into.
 * Used by both TerminalView and LocalTerminalView.
 */

import { useCallback, useRef } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useRecordingStore } from '../store/recordingStore';
import { themes } from '../lib/themes';
import { useSettingsStore } from '../store/settingsStore';
import type { TerminalRecorder, RecorderOptions, AsciicastTheme } from '../lib/recording';

type UseTerminalRecordingOptions = {
  sessionId: string;
  terminalType: 'ssh' | 'local';
  label: string;
};

type UseTerminalRecordingReturn = {
  /** Start a new recording */
  startRecording: (cols: number, rows: number) => void;
  /** Feed output data to the active recorder */
  feedOutput: (data: Uint8Array) => void;
  /** Feed user input to the active recorder */
  feedInput: (data: string) => void;
  /** Feed resize event to the active recorder */
  feedResize: (cols: number, rows: number) => void;
  /** Handle recording stop — shows save dialog */
  handleRecordingStop: (castContent: string) => Promise<void>;
  /** Handle recording discard — no-op (store already cleared) */
  handleRecordingDiscard: () => void;
  /** Whether this session is currently recording */
  isRecording: boolean;
  /** Recorder ref for direct access */
  recorderRef: React.MutableRefObject<TerminalRecorder | null>;
};

/**
 * Converts an OxideTerm theme to asciicast theme format.
 */
function themeToAsciicast(themeKey: string): AsciicastTheme | undefined {
  const theme = themes[themeKey];
  if (!theme) return undefined;

  const palette = [
    theme.black, theme.red, theme.green, theme.yellow,
    theme.blue, theme.magenta, theme.cyan, theme.white,
    theme.brightBlack, theme.brightRed, theme.brightGreen, theme.brightYellow,
    theme.brightBlue, theme.brightMagenta, theme.brightCyan, theme.brightWhite,
  ].filter(Boolean).join(':');

  return {
    fg: theme.foreground || '#ffffff',
    bg: theme.background || '#000000',
    palette,
  };
}

export function useTerminalRecording({
  sessionId,
  terminalType,
  label,
}: UseTerminalRecordingOptions): UseTerminalRecordingReturn {
  const recorderRef = useRef<TerminalRecorder | null>(null);

  const startRec = useRecordingStore(s => s.startRecording);
  const isRec = useRecordingStore(s => s.isRecording(sessionId));

  const startRecording = useCallback((cols: number, rows: number) => {
    const themeKey = useSettingsStore.getState().settings.terminal.theme;
    const options: RecorderOptions = {
      captureInput: false, // Security: don't record input by default
      theme: themeToAsciicast(themeKey),
      env: { TERM: 'xterm-256color' },
    };

    const recorder = startRec(sessionId, cols, rows, { terminalType, label }, options);
    recorderRef.current = recorder;
  }, [sessionId, terminalType, label, startRec]);

  const feedOutput = useCallback((data: Uint8Array) => {
    recorderRef.current?.recordOutput(data);
  }, []);

  const feedInput = useCallback((data: string) => {
    recorderRef.current?.recordInput(data);
  }, []);

  const feedResize = useCallback((cols: number, rows: number) => {
    recorderRef.current?.recordResize(cols, rows);
  }, []);

  const handleRecordingStop = useCallback(async (castContent: string) => {
    try {
      const defaultName = `oxideterm-${sessionId.slice(0, 8)}-${Date.now()}.cast`;
      const savePath = await save({
        defaultPath: defaultName,
        filters: [{ name: 'Asciicast', extensions: ['cast'] }],
      });

      if (savePath) {
        await writeTextFile(savePath, castContent);
        console.log(`[Recording] Saved to ${savePath}`);
      }
    } catch (err) {
      console.error('[Recording] Save failed:', err);
    }
    recorderRef.current = null;
  }, [sessionId]);

  const handleRecordingDiscard = useCallback(() => {
    recorderRef.current = null;
  }, []);

  // Keep ref in sync with store
  const storeRecorder = useRecordingStore(s => s.getRecorder(sessionId));
  if (storeRecorder && !recorderRef.current) {
    recorderRef.current = storeRecorder;
  }
  if (!storeRecorder && recorderRef.current) {
    recorderRef.current = null;
  }

  return {
    startRecording,
    feedOutput,
    feedInput,
    feedResize,
    handleRecordingStop,
    handleRecordingDiscard,
    isRecording: isRec,
    recorderRef,
  };
}
