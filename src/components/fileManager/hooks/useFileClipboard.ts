// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * useFileClipboard Hook
 * Manages file clipboard operations (copy, cut, paste)
 */

import { useState, useCallback } from 'react';
import { copyFile, rename, mkdir, readDir, stat } from '@tauri-apps/plugin-fs';
import type { FileInfo, ClipboardData, ClipboardMode } from '../types';

export interface PasteProgress {
  /** Currently processing file index (1-based) */
  current: number;
  /** Total file count (including files inside directories) */
  total: number;
  /** Name of the file currently being processed */
  fileName: string;
  /** Whether the operation is in progress */
  active: boolean;
}

export interface UseFileClipboardOptions {
  onSuccess?: (message: string) => void;
  onError?: (title: string, message: string) => void;
  onProgress?: (progress: PasteProgress) => void;
}

export interface UseFileClipboardReturn {
  clipboard: ClipboardData | null;
  hasClipboard: boolean;
  clipboardMode: ClipboardMode | null;
  copy: (files: FileInfo[], sourcePath: string) => void;
  cut: (files: FileInfo[], sourcePath: string) => void;
  paste: (destPath: string) => Promise<void>;
  clear: () => void;
}

export function useFileClipboard(options: UseFileClipboardOptions = {}): UseFileClipboardReturn {
  const { onSuccess, onError, onProgress } = options;
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Copy files to clipboard
  const copy = useCallback((files: FileInfo[], sourcePath: string) => {
    setClipboard({
      files: [...files],
      mode: 'copy',
      sourcePath,
    });
  }, []);

  // Cut files to clipboard
  const cut = useCallback((files: FileInfo[], sourcePath: string) => {
    setClipboard({
      files: [...files],
      mode: 'cut',
      sourcePath,
    });
  }, []);

  // Clear clipboard
  const clear = useCallback(() => {
    setClipboard(null);
  }, []);

  // Count total files recursively (for progress tracking)
  const countFiles = async (files: FileInfo[]): Promise<number> => {
    let count = 0;
    for (const file of files) {
      if (file.file_type === 'Directory') {
        count += await countDirFiles(file.path);
      } else {
        count++;
      }
    }
    return count;
  };

  const countDirFiles = async (dirPath: string): Promise<number> => {
    let count = 0;
    try {
      const entries = await readDir(dirPath);
      for (const entry of entries) {
        if (entry.isDirectory) {
          count += await countDirFiles(`${dirPath}/${entry.name}`);
        } else {
          count++;
        }
      }
    } catch {
      // If we can't read, count as 1 to not block progress
      count = 1;
    }
    return count;
  };

  // Mutable progress tracker shared across a single paste operation.
  // emitProgress throttles onProgress calls to at most once per PROGRESS_THROTTLE_MS
  // to avoid a full-pane rerender on every copied file.
  const PROGRESS_THROTTLE_MS = 100;

  const emitProgress = (
    tracker: { done: number; total: number; fileName: string; lastEmit: number },
    force?: boolean,
  ) => {
    const now = performance.now();
    if (force || now - tracker.lastEmit >= PROGRESS_THROTTLE_MS) {
      tracker.lastEmit = now;
      onProgress?.({
        current: tracker.done,
        total: tracker.total,
        fileName: tracker.fileName,
        active: true,
      });
    }
  };

  // Recursively copy a directory (with progress tracking)
  const copyDirectory = async (
    srcPath: string,
    destPath: string,
    tracker: { done: number; total: number; fileName: string; lastEmit: number },
  ): Promise<void> => {
    // Create destination directory
    await mkdir(destPath, { recursive: true });
    
    // Read source directory contents
    const entries = await readDir(srcPath);
    
    for (const entry of entries) {
      const srcChildPath = `${srcPath}/${entry.name}`;
      const destChildPath = `${destPath}/${entry.name}`;
      
      if (entry.isDirectory) {
        await copyDirectory(srcChildPath, destChildPath, tracker);
      } else {
        await copyFile(srcChildPath, destChildPath);
        tracker.done++;
        tracker.fileName = entry.name;
        emitProgress(tracker);
      }
    }
  };

  // Generate unique name if file exists
  const getUniqueName = async (destPath: string, name: string, isDirectory: boolean): Promise<string> => {
    const fullPath = `${destPath}/${name}`;
    
    try {
      await stat(fullPath);
      // File exists, generate unique name
      const ext = isDirectory ? '' : (name.includes('.') ? `.${name.split('.').pop()}` : '');
      const baseName = isDirectory ? name : (ext ? name.slice(0, -ext.length) : name);
      
      let counter = 1;
      let newName = `${baseName} (${counter})${ext}`;
      
      while (true) {
        try {
          await stat(`${destPath}/${newName}`);
          counter++;
          newName = `${baseName} (${counter})${ext}`;
        } catch {
          // Name is available
          return newName;
        }
      }
    } catch {
      // File doesn't exist, use original name
      return name;
    }
  };

  // Paste files from clipboard
  const paste = useCallback(async (destPath: string) => {
    if (!clipboard) return;

    const { files, mode, sourcePath } = clipboard;
    let successCount = 0;
    let errorCount = 0;
    let firstError: string | null = null;

    // Count total files for progress (only for copy; move is atomic per top-level item)
    const totalFiles = mode === 'copy'
      ? await countFiles(files)
      : files.length;
    const tracker = { done: 0, total: totalFiles, fileName: '', lastEmit: 0 };

    // Signal progress start (force — always render the initial 0%)
    emitProgress(tracker, true);

    for (const file of files) {
      try {
        // Check if pasting to same directory
        const isSameDir = sourcePath === destPath;
        
        // Get destination name (handle duplicates)
        const destName = isSameDir && mode === 'copy'
          ? await getUniqueName(destPath, file.name, file.file_type === 'Directory')
          : file.name;
        
        const destFilePath = `${destPath}/${destName}`;
        
        if (file.file_type === 'Directory') {
          if (mode === 'copy') {
            await copyDirectory(file.path, destFilePath, tracker);
          } else {
            // Cut = move
            if (!isSameDir) {
              await rename(file.path, destFilePath);
              tracker.done++;
              tracker.fileName = file.name;
              emitProgress(tracker);
            }
          }
        } else {
          if (mode === 'copy') {
            await copyFile(file.path, destFilePath);
            tracker.done++;
            tracker.fileName = file.name;
            emitProgress(tracker);
          } else {
            // Cut = move
            if (!isSameDir) {
              await rename(file.path, destFilePath);
              tracker.done++;
              tracker.fileName = file.name;
              emitProgress(tracker);
            }
          }
        }
        
        successCount++;
      } catch (err) {
        console.error(`Failed to ${mode} file:`, file.name, err);
        if (!firstError) firstError = `${file.name}: ${String(err)}`;
        errorCount++;
        // Still advance tracker on error so bar doesn't stall
        tracker.done++;
        tracker.fileName = file.name;
        emitProgress(tracker);
      }
    }

    // Signal progress end (force — always render the final 100% / dismiss)
    onProgress?.({ current: totalFiles, total: totalFiles, fileName: '', active: false });

    // Clear clipboard after cut operation
    if (mode === 'cut') {
      setClipboard(null);
    }

    // Report results
    if (successCount > 0 && errorCount === 0) {
      const action = mode === 'copy' ? 'Copied' : 'Moved';
      onSuccess?.(`${action} ${successCount} item(s)`);
    } else if (errorCount > 0) {
      const detail = errorCount === 1 && firstError
        ? firstError
        : `Failed to paste ${errorCount} of ${files.length} items${firstError ? `\n${firstError}` : ''}`;
      onError?.('Paste Error', detail);
    }
  }, [clipboard, onSuccess, onError]);

  return {
    clipboard,
    hasClipboard: clipboard !== null && clipboard.files.length > 0,
    clipboardMode: clipboard?.mode ?? null,
    copy,
    cut,
    paste,
    clear,
  };
}
