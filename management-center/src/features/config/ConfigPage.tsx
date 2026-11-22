import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { HugeiconsIcon } from '@hugeicons/react';
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { useVisualConfig } from '@/hooks/useVisualConfig';
import { useAuthStore, useNotificationStore } from '@/stores';
import {
  CONFIG_MODE_STORAGE_KEY,
  CONFIG_SECTION_STORAGE_KEY,
  LEGACY_EDITOR_MODE_STORAGE_KEY,
  type ConfigEditorMode,
  type ConfigTabId,
} from './constants';
import {
  CONFIG_FIELD_COUNT,
  buildConfigTabs,
  buildHeaderMeta,
  countSectionErrors,
  countTotalErrors,
  readSavedMode,
  readSavedSection,
  resolveDirtyTabs,
  resolveStatus,
  type ConfigStatusTone,
  type HeaderMetaSegment,
} from './uiState';
import { findConfigFieldById } from './searchIndex';
import { shouldReloadVisualDraft, useConfigDocument } from './hooks/useConfigDocument';
import { useFieldJump } from './hooks/useFieldJump';
import { useSourceSearch } from './hooks/useSourceSearch';
import { ConfigSearch } from './components/ConfigSearch';
import { DiffModal } from './components/DiffModal';
import { FloatingSaveBar } from './components/FloatingSaveBar';
import { ModeSwitch } from './components/ModeSwitch';
import { SourcePanel, SourceSearchBar } from './components/SourcePanel';
import { SectionAdvanced } from './components/sections/SectionAdvanced';
import { SectionCommon } from './components/sections/SectionCommon';
import { SectionConnectivity } from './components/sections/SectionConnectivity';
import { SectionLogging } from './components/sections/SectionLogging';
import { SectionNetwork } from './components/sections/SectionNetwork';
import { SectionPayload } from './components/sections/SectionPayload';
import { SectionStreaming } from './components/sections/SectionStreaming';

const statusDot: Record<ConfigStatusTone, string> = {
  error: 'bg-destructive',
  warning: 'bg-warning',
  busy: 'bg-primary',
  muted: 'bg-faint',
  ok: 'bg-success',
};

const metaTone: Record<HeaderMetaSegment['tone'], string> = {
  muted: 'text-muted-foreground',
  warning: 'text-warning',
  error: 'text-destructive',
  ok: 'text-muted-foreground',
};

export function ConfigPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedFieldEntry = useMemo(() => {
    const fieldId = new URLSearchParams(location.search).get('field');
    return findConfigFieldById(fieldId);
  }, [location.search]);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.isCurrentLayer : true;
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const {
    visualValues,
    visualDirty,
    visualDirtyFields,
    visualParseError,
    visualValidationErrors,
    visualHasPayloadValidationErrors,
    loadVisualValuesFromYaml,
    rebaseVisualValuesFromYaml,
    applyVisualChangesToYaml,
    setVisualValues,
  } = useVisualConfig();

  const [mode, setMode] = useState<ConfigEditorMode>(() =>
    requestedFieldEntry ? 'visual' : readSavedMode(localStorage.getItem(CONFIG_MODE_STORAGE_KEY))
  );
  const [activeSection, setActiveSection] = useState<ConfigTabId>(
    () =>
      requestedFieldEntry?.sectionId ??
      readSavedSection(localStorage.getItem(CONFIG_SECTION_STORAGE_KEY))
  );
  const handledRequestedFieldRef = useRef<string | null>(null);

  // 旧「简单/完整」双模式已退役，清掉遗留的持久化键。
  useEffect(() => {
    localStorage.removeItem(LEGACY_EDITOR_MODE_STORAGE_KEY);
  }, []);

  const doc = useConfigDocument({
    mode,
    visualDirty,
    visualParseError,
    loadVisualValuesFromYaml,
    rebaseVisualValuesFromYaml,
    applyVisualChangesToYaml,
  });
  const sourceSearch = useSourceSearch();

  const disableControls = connectionStatus !== 'connected';
  const hasVisualModeError = !!visualParseError;
  const hasVisualValidationErrors =
    mode === 'visual' &&
    (Object.values(visualValidationErrors).some(Boolean) || visualHasPayloadValidationErrors);

  const unsavedChangesDialog = useMemo(
    () => ({
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.confirm'),
      cancelText: t('common.cancel'),
    }),
    [t]
  );

  useUnsavedChangesGuard({
    enabled: isCurrentLayer,
    shouldBlock: doc.isDirty,
    dialog: unsavedChangesDialog,
  });

  // YAML 解析失败：切换到源码模式；修复后仍可重试进入可视化模式。
  useEffect(() => {
    if (mode !== 'visual' || !visualParseError) return;

    setMode('source');
    localStorage.setItem(CONFIG_MODE_STORAGE_KEY, 'source');
    showNotification(
      t('config_management.visual_mode_unavailable_detail', { message: visualParseError }),
      'error'
    );
  }, [mode, showNotification, t, visualParseError]);

  // 可视化 ↔ 源码切换的 dirty 交接：
  // → 源码：物化可视化脏字段供查看，但不把同步动作记作用户源码编辑；
  // → 可视化：源码草稿必须先保存或放弃；纯查看源码往返保留字段级 dirty。
  const handleModeChange = useCallback(
    (nextMode: ConfigEditorMode) => {
      if (nextMode === mode) return;
      if (nextMode === 'visual' && doc.sourceDirty) {
        showNotification(t('config_management.source_changes_before_visual'), 'warning');
        return;
      }

      if (nextMode === 'source') {
        if (visualDirty) {
          // content may be an earlier local source preview, not a server readback.
          const nextContent = applyVisualChangesToYaml(doc.content, 'draft');
          if (nextContent !== doc.content) {
            doc.syncContentFromVisual(nextContent);
          }
        }
      } else if (shouldReloadVisualDraft(doc.sourceDirty, visualParseError)) {
        const result = loadVisualValuesFromYaml(doc.content);
        if (!result.ok) {
          showNotification(
            t('config_management.visual_mode_unavailable_detail', { message: result.error }),
            'error'
          );
          return;
        }
      }

      setMode(nextMode);
      localStorage.setItem(CONFIG_MODE_STORAGE_KEY, nextMode);
    },
    [
      applyVisualChangesToYaml,
      doc,
      loadVisualValuesFromYaml,
      mode,
      showNotification,
      t,
      visualDirty,
      visualParseError,
    ]
  );

  const handleSectionChange = useCallback((sectionId: ConfigTabId) => {
    setActiveSection(sectionId);
    localStorage.setItem(CONFIG_SECTION_STORAGE_KEY, sectionId);
  }, []);

  const { jumpToField } = useFieldJump({
    values: visualValues,
    setActiveSection: handleSectionChange,
  });

  useEffect(() => {
    if (!requestedFieldEntry || handledRequestedFieldRef.current === requestedFieldEntry.fieldId) {
      return;
    }

    handledRequestedFieldRef.current = requestedFieldEntry.fieldId;
    localStorage.setItem(CONFIG_MODE_STORAGE_KEY, 'visual');
    jumpToField(requestedFieldEntry);

    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.delete('field');
    const nextSearch = nextSearchParams.toString();
    void navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
        hash: location.hash,
      },
      { replace: true }
    );
  }, [
    jumpToField,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    requestedFieldEntry,
  ]);

  const errorCounts = useMemo(
    () => countSectionErrors(visualValidationErrors, visualHasPayloadValidationErrors),
    [visualHasPayloadValidationErrors, visualValidationErrors]
  );
  const dirtyTabs = useMemo(() => resolveDirtyTabs(visualDirtyFields), [visualDirtyFields]);
  const totalErrors = useMemo(
    () => countTotalErrors(visualValidationErrors, visualHasPayloadValidationErrors),
    [visualHasPayloadValidationErrors, visualValidationErrors]
  );

  const status = resolveStatus({
    disconnected: disableControls,
    loading: doc.loading,
    loadFailed: Boolean(doc.error),
    yamlError: hasVisualModeError,
    validationBlocked: hasVisualValidationErrors,
    saving: doc.saving,
    dirty: doc.isDirty,
  });
  const headerMeta = buildHeaderMeta({
    fieldCount: CONFIG_FIELD_COUNT,
    status,
    dirtyCount: visualDirtyFields.size,
    sourceDirty: doc.sourceDirty,
    errorCount: mode === 'visual' ? totalErrors : 0,
  });

  const saveDisabled =
    disableControls ||
    doc.loading ||
    doc.saving ||
    !doc.isDirty ||
    doc.diffModalOpen ||
    hasVisualModeError ||
    hasVisualValidationErrors;

  const sectionProps = {
    values: visualValues,
    validationErrors: visualValidationErrors,
    disabled:
      disableControls || doc.loading || doc.saving || doc.diffModalOpen || doc.recoveryRequired,
    onChange: setVisualValues,
  };

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'common':
        return <SectionCommon {...sectionProps} />;
      case 'connectivity':
        return <SectionConnectivity {...sectionProps} />;
      case 'network':
        return <SectionNetwork {...sectionProps} />;
      case 'logging':
        return <SectionLogging {...sectionProps} />;
      case 'streaming':
        return <SectionStreaming {...sectionProps} />;
      case 'advanced':
        return <SectionAdvanced {...sectionProps} />;
      case 'payload':
        return (
          <SectionPayload
            {...sectionProps}
            hasPayloadValidationErrors={visualHasPayloadValidationErrors}
          />
        );
    }
  };

  const tabs = buildConfigTabs(t, dirtyTabs, errorCounts);

  // The field count never changes, so the header only shows the state.
  const statusMeta = headerMeta.filter((segment) => segment.key !== 'fields');

  const actions = (
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      <p className="flex items-center gap-2 text-[13px] max-lg:sr-only" aria-live="polite">
        <span className={cn('size-2 rounded-full', statusDot[status.tone])} />
        {statusMeta.map((segment, index) => (
          <span key={segment.key} className={metaTone[segment.tone]}>
            {index > 0 ? <span className="mr-2 text-faint">·</span> : null}
            {segment.count !== undefined
              ? t(segment.labelKey, { count: segment.count })
              : t(segment.labelKey)}
          </span>
        ))}
      </p>
      <ModeSwitch
        mode={mode}
        disabled={doc.saving || doc.loading || doc.diffModalOpen || doc.recoveryRequired}
        onChange={handleModeChange}
      />
      <Button
        variant="outline"
        size="icon-lg"
        onClick={doc.handleReload}
        disabled={doc.loading || doc.saving}
        aria-label={t('config_management.reload')}
        title={t('config_management.reload')}
      >
        <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.75} />
      </Button>
    </div>
  );

  const loadError =
    doc.error ??
    (visualParseError
      ? t('config_management.visual_mode_unavailable_detail', { message: visualParseError })
      : null);
  const alert = loadError ? (
    <div
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      {loadError}
    </div>
  ) : null;

  const overlays = (
    <>
      <FloatingSaveBar
        visible={isCurrentLayer && doc.isDirty}
        statusText={t(
          doc.recoveryRequired
            ? 'config_management.precise_save_recovery_required'
            : isMobile
              ? status.shortLabelKey
              : status.labelKey
        )}
        statusTone={status.tone}
        saving={doc.saving}
        saveDisabled={saveDisabled}
        discardDisabled={doc.loading || doc.saving}
        onSave={doc.handleSave}
        onDiscard={doc.handleDiscard}
      />

      <DiffModal
        open={doc.diffModalOpen}
        original={doc.serverYaml}
        modified={doc.mergedYaml}
        onConfirm={doc.handleConfirmSave}
        onCancel={doc.closeDiff}
        loading={doc.saving}
      />
    </>
  );

  if (mode === 'source') {
    // The YAML editor uses the full width and height, so it skips Page's narrow content column.
    return (
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-6 sm:px-10 sm:py-8">
          <h1 className="text-2xl font-semibold tracking-tight">{t('config_management.title')}</h1>
          {actions}
        </header>
        <div className="flex shrink-0 flex-col gap-3 border-b px-5 py-3 sm:px-10">
          {alert}
          <SourceSearchBar search={sourceSearch} disabled={disableControls || doc.loading} />
        </div>
        <SourcePanel
          search={sourceSearch}
          value={doc.content}
          onChange={doc.handleChange}
          editable={!disableControls && !doc.loading && !doc.saving && !doc.diffModalOpen}
        />
        {overlays}
      </div>
    );
  }

  return (
    <Page
      title={t('config_management.title')}
      actions={actions}
      tabs={tabs}
      tab={activeSection}
      onTab={handleSectionChange}
    >
      <div className="flex flex-col gap-8">
        {alert}
        <ConfigSearch disabled={disableControls || doc.loading} onJump={jumpToField} />
        {renderActiveSection()}
        {/* Room for the save bar so it never covers the last setting. */}
        {doc.isDirty ? <div aria-hidden="true" className="h-14" /> : null}
      </div>
      {overlays}
    </Page>
  );
}
