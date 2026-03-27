// src/components/ide/IdeEditorArea.tsx
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Code2 } from 'lucide-react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { useIdeTabs, useIdeActiveTab, useIdeStore } from '../../store/ideStore';
import { IdeEditorTabs } from './IdeEditorTabs';
import { IdeBreadcrumb } from './IdeBreadcrumb';
import { IdeEditor } from './IdeEditor';
import { IdeConflictDialog, ConflictResolution } from './dialogs/IdeConflictDialog';

export function IdeEditorArea() {
  const { t } = useTranslation();
  const tabs = useIdeTabs();
  const activeTab = useIdeActiveTab();
  const { conflictState, resolveConflict, clearConflict } = useIdeStore();
  const splitDirection = useIdeStore(s => s.splitDirection);
  const splitActiveTabId = useIdeStore(s => s.splitActiveTabId);
  
  // 分栏侧活动的标签
  const splitActiveTab = splitActiveTabId
    ? tabs.find(t => t.id === splitActiveTabId) ?? null
    : null;
  
  // 获取冲突文件信息
  const conflictTab = conflictState 
    ? tabs.find(t => t.id === conflictState.tabId) 
    : null;
  
  // 处理冲突解决
  const handleConflictResolve = useCallback(async (resolution: ConflictResolution) => {
    if (resolution === 'cancel') {
      clearConflict();
      return;
    }
    
    try {
      await resolveConflict(resolution === 'overwrite' ? 'overwrite' : 'reload');
    } catch (e) {
      console.error('[IdeEditorArea] Conflict resolution failed:', e);
    }
  }, [resolveConflict, clearConflict]);
  
  if (tabs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-theme-text-muted bg-theme-bg/50 text-center px-4">
        <Code2 className="w-16 h-16 mb-4 opacity-20 shrink-0" />
        <p className="text-sm">{t('ide.no_open_files')}</p>
        <p className="text-xs mt-1 opacity-60">{t('ide.click_to_open')}</p>
      </div>
    );
  }
  
  const editorContent = (
    <>
      {/* 标签栏 */}
      <IdeEditorTabs />
      
      {/* 面包屑导航 */}
      <IdeBreadcrumb />
      
      {/* 编辑器区域 */}
      <div className="flex-1 min-h-0 relative">
        {activeTab && <IdeEditor tab={activeTab} />}
      </div>
    </>
  );
  
  const splitContent = splitActiveTab ? (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
        <IdeEditor tab={splitActiveTab} key={`split-${splitActiveTab.id}`} />
      </div>
    </div>
  ) : null;
  
  return (
    <div className="h-full flex flex-col">
      {splitDirection && splitContent ? (
        <PanelGroup
          orientation={splitDirection === 'horizontal' ? 'horizontal' : 'vertical'}
          className="flex-1"
        >
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col">
              {editorContent}
            </div>
          </Panel>
          <PanelResizeHandle
            className={splitDirection === 'horizontal'
              ? 'w-1 group relative cursor-col-resize'
              : 'h-1 group relative cursor-row-resize'
            }
          >
            <div className={splitDirection === 'horizontal'
              ? 'absolute inset-y-0 -left-0.5 -right-0.5 group-hover:bg-theme-accent/30 transition-colors'
              : 'absolute inset-x-0 -top-0.5 -bottom-0.5 group-hover:bg-theme-accent/30 transition-colors'
            } />
          </PanelResizeHandle>
          <Panel defaultSize={50} minSize={20}>
            {splitContent}
          </Panel>
        </PanelGroup>
      ) : (
        editorContent
      )}
      
      {/* 冲突对话框 */}
      <IdeConflictDialog
        open={!!conflictState && !!conflictTab}
        fileName={conflictTab?.name || ''}
        localTime={new Date((conflictState?.localMtime || 0) * 1000)}
        remoteTime={new Date((conflictState?.remoteMtime || 0) * 1000)}
        onResolve={handleConflictResolve}
      />
    </div>
  );
}
