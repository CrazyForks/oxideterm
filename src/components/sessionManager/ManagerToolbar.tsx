// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { useTranslation } from 'react-i18next';
import { Search, Plus, Download, Upload, Network } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useAppStore } from '../../store/appStore';
import { BatchActionsMenu } from './BatchActionsMenu';
import type { ConnectionInfo } from '../../types';

type ManagerToolbarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedIds: Set<string>;
  allConnections: ConnectionInfo[];
  groups: string[];
  onRefresh: () => Promise<void>;
  onClearSelection: () => void;
  onShowImport: () => void;
  onShowExport: () => void;
};

export const ManagerToolbar = ({
  searchQuery,
  onSearchChange,
  selectedIds,
  allConnections,
  groups,
  onRefresh,
  onClearSelection,
  onShowImport,
  onShowExport,
}: ManagerToolbarProps) => {
  const { t } = useTranslation();
  const toggleModal = useAppStore(s => s.toggleModal);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-border bg-theme-bg shrink-0 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 min-w-[160px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-theme-text-muted pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('sessionManager.toolbar.search_placeholder')}
          className="pl-8 h-8 text-sm"
        />
      </div>

      {/* New Connection */}
      <Button
        size="sm"
        onClick={() => toggleModal('newConnection', true)}
        className="gap-1.5 shrink-0"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">{t('sessionManager.toolbar.new_connection')}</span>
      </Button>

      {/* Auto-Route */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => toggleModal('autoRoute', true)}
        className="gap-1.5 shrink-0"
        title={t('sessionManager.toolbar.auto_route')}
      >
        <Network className="h-4 w-4" />
        <span className="hidden sm:inline">{t('sessionManager.toolbar.auto_route')}</span>
      </Button>

      {/* Batch actions (only when items are selected) */}
      {selectedIds.size > 0 && (
        <BatchActionsMenu
          selectedIds={selectedIds}
          allConnections={allConnections}
          groups={groups}
          onRefresh={onRefresh}
          onClearSelection={onClearSelection}
        />
      )}

      <div className="flex-1 min-w-0" />

      {/* Import / Export */}
      <Button variant="ghost" size="sm" onClick={onShowImport} className="gap-1.5 shrink-0" title={t('sessionManager.toolbar.import')}>
        <Download className="h-4 w-4" />
        <span className="hidden md:inline">{t('sessionManager.toolbar.import')}</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onShowExport} className="gap-1.5 shrink-0" title={t('sessionManager.toolbar.export')}>
        <Upload className="h-4 w-4" />
        <span className="hidden md:inline">{t('sessionManager.toolbar.export')}</span>
      </Button>
    </div>
  );
};
