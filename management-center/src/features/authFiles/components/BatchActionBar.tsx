import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkSquare02Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useActionBarHeightVar } from '@/hooks/useActionBarHeightVar';
import { useToastLift } from '@/hooks/useToastLift';

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
 * Phones keep one row: the status actions and delete, with the selection helpers in a menu.
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
  useToastLift(containerRef, visible);

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 mx-auto w-fit max-w-[calc(100%-2rem)] duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none max-sm:w-auto max-sm:max-w-none sm:bottom-6"
    >
      <div
        role="toolbar"
        aria-label={t('auth_files.batch_toolbar_label')}
        aria-orientation="horizontal"
        className="flex flex-wrap items-center gap-1 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg max-sm:flex-nowrap max-sm:gap-2"
      >
        {/* Phones show the count as the select icon and a number, which leaves the three
            actions room to read in full at 360px. */}
        <span
          className="px-2 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums max-sm:px-1.5 max-sm:font-sans max-sm:text-sm max-sm:normal-nums"
          aria-live="polite"
        >
          <span className="max-sm:sr-only">
            {t('auth_files.batch_selected', { count: selectionCount })}
          </span>
          <span aria-hidden="true" className="inline-flex items-center gap-1.5 sm:hidden">
            <HugeiconsIcon icon={CheckmarkSquare02Icon} strokeWidth={1.75} className="size-4" />
            {selectionCount}
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="max-sm:hidden"
          onClick={onSelectPage}
          disabled={selectablePageCount === 0}
        >
          {t('auth_files.batch_select_page')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="max-sm:hidden"
          onClick={onSelectFiltered}
          disabled={selectableFilteredCount === 0}
        >
          {t('auth_files.batch_select_filtered')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="max-sm:hidden"
          onClick={onInvertPage}
          disabled={selectablePageCount === 0}
        >
          {t('auth_files.batch_invert_page')}
        </Button>
        <Button variant="ghost" size="sm" className="max-sm:hidden" onClick={onDeselectAll}>
          {t('auth_files.batch_deselect')}
        </Button>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border max-sm:hidden" />
        <Button
          variant="outline"
          size="sm"
          className="max-sm:hidden"
          onClick={onDownload}
          disabled={disableControls || selectionCount === 0}
        >
          {t('auth_files.batch_download')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="max-sm:h-10 max-sm:min-w-0 max-sm:flex-1 max-sm:truncate max-sm:px-2 max-sm:text-sm"
          onClick={onEnable}
          disabled={batchStatusDisabled}
        >
          {t('auth_files.batch_enable')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="max-sm:h-10 max-sm:min-w-0 max-sm:flex-1 max-sm:truncate max-sm:px-2 max-sm:text-sm"
          onClick={onDisable}
          disabled={batchStatusDisabled}
        >
          {t('auth_files.batch_disable')}
        </Button>
        {/* Outline like its neighbours: red text marks it without a filled red button. */}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive-foreground hover:text-destructive-foreground max-sm:h-10 max-sm:min-w-0 max-sm:flex-1 max-sm:truncate max-sm:px-2 max-sm:text-sm"
          onClick={onDelete}
          disabled={disableControls || selectionCount === 0}
        >
          {t('common.delete')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-10 shrink-0 sm:hidden"
              aria-label={t('common.more')}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-auto min-w-48">
            <DropdownMenuItem
              className="h-10"
              onSelect={onSelectPage}
              disabled={selectablePageCount === 0}
            >
              {t('auth_files.batch_select_page')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="h-10"
              onSelect={onSelectFiltered}
              disabled={selectableFilteredCount === 0}
            >
              {t('auth_files.batch_select_filtered')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="h-10"
              onSelect={onInvertPage}
              disabled={selectablePageCount === 0}
            >
              {t('auth_files.batch_invert_page')}
            </DropdownMenuItem>
            <DropdownMenuItem className="h-10" onSelect={onDeselectAll}>
              {t('auth_files.batch_deselect')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="h-10"
              onSelect={onDownload}
              disabled={disableControls || selectionCount === 0}
            >
              {t('auth_files.batch_download')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>,
    document.body
  );
}
