import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useActionBarHeightVar } from '@/hooks/useActionBarHeightVar';

export type BatchActionBarProps = {
  selectionCount: number;
  selectablePageCount: number;
  selectableFilteredCount: number;
  disableControls: boolean;
  batchStatusDisabled: boolean;
  onSelectPage: () => void;
  onSelectFiltered: () => void;
  onInvertPage: () => void;
  onDeselectAll: () => void;
  onDownload: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onDelete: () => void;
};

/**
 * Floating toolbar for the selected credentials, shown while anything is selected.
 * Its live height lands in --auth-files-action-bar-height so the list can leave room for it.
 */
export function BatchActionBar(props: BatchActionBarProps) {
  const {
    selectionCount,
    selectablePageCount,
    selectableFilteredCount,
    disableControls,
    batchStatusDisabled,
    onSelectPage,
    onSelectFiltered,
    onInvertPage,
    onDeselectAll,
    onDownload,
    onEnable,
    onDisable,
    onDelete,
  } = props;
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visible = selectionCount > 0;

  useActionBarHeightVar(containerRef, '--auth-files-action-bar-height', visible);

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-x-4 bottom-16 z-40 mx-auto w-fit max-w-[calc(100%-2rem)] duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none sm:bottom-6"
    >
      <div
        role="toolbar"
        aria-label={t('auth_files.batch_toolbar_label')}
        aria-orientation="horizontal"
        className="flex flex-wrap items-center gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
      >
        <span
          className="px-2 font-mono text-xs text-muted-foreground tabular-nums"
          aria-live="polite"
        >
          {t('auth_files.batch_selected', { count: selectionCount })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectPage}
          disabled={selectablePageCount === 0}
        >
          {t('auth_files.batch_select_page')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectFiltered}
          disabled={selectableFilteredCount === 0}
        >
          {t('auth_files.batch_select_filtered')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onInvertPage}
          disabled={selectablePageCount === 0}
        >
          {t('auth_files.batch_invert_page')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDeselectAll}>
          {t('auth_files.batch_deselect')}
        </Button>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border max-sm:hidden" />
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={disableControls || selectionCount === 0}
        >
          {t('auth_files.batch_download')}
        </Button>
        <Button variant="outline" size="sm" onClick={onEnable} disabled={batchStatusDisabled}>
          {t('auth_files.batch_enable')}
        </Button>
        <Button variant="outline" size="sm" onClick={onDisable} disabled={batchStatusDisabled}>
          {t('auth_files.batch_disable')}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={disableControls || selectionCount === 0}
        >
          {t('common.delete')}
        </Button>
      </div>
    </div>,
    document.body
  );
}
