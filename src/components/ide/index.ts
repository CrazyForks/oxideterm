// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

// src/components/ide/index.ts
export { IdeWorkspace } from './IdeWorkspace';
export { IdeTree } from './IdeTree';
export { IdeEditorArea } from './IdeEditorArea';
export { IdeEditorTabs } from './IdeEditorTabs';
export { IdeEditor } from './IdeEditor';
export { IdeTerminal } from './IdeTerminal';
export { IdeStatusBar } from './IdeStatusBar';
export { IdeSearchPanel } from './IdeSearchPanel';
export { IdeSaveConfirmDialog } from './dialogs/IdeSaveConfirmDialog';
export { IdeConflictDialog } from './dialogs/IdeConflictDialog';
export { useCodeMirrorEditor } from './hooks/useCodeMirrorEditor';
export { useIdeTerminal } from './hooks/useIdeTerminal';
export { useGitStatus, GIT_STATUS_COLORS, GIT_STATUS_LABELS } from './hooks/useGitStatus';
export type { GitFileStatus, GitStatus } from './hooks/useGitStatus';
