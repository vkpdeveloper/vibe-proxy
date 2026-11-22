import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import type { ContextMenuState } from './ModelMappingDiagramTypes';
import { cn } from '@/lib/utils';

interface DiagramContextMenuProps {
  contextMenu: ContextMenuState | null;
  t: TFunction;
  onRequestClose: () => void;
  onAddAlias: () => void;
  onRenameAlias: (alias: string) => void;
  onOpenAliasSettings: (alias: string) => void;
  onDeleteAlias: (alias: string) => void;
  onEditProvider: (provider: string) => void;
  onDeleteProvider: (provider: string) => void;
  onOpenSourceSettings: (sourceId: string) => void;
}

function MenuItem({
  onClick,
  danger = false,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden select-none hover:bg-accent focus-visible:bg-accent',
        danger && 'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10'
      )}
    >
      {children}
    </button>
  );
}

const MenuDivider = () => <div className="-mx-1 my-1 h-px bg-border" role="separator" />;

export function DiagramContextMenu({
  contextMenu,
  t,
  onRequestClose,
  onAddAlias,
  onRenameAlias,
  onOpenAliasSettings,
  onDeleteAlias,
  onEditProvider,
  onDeleteProvider,
  onOpenSourceSettings,
}: DiagramContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onRequestClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu, onRequestClose]);

  if (!contextMenu) return null;

  const { type, data } = contextMenu;

  const renderBackground = () => (
    <MenuItem onClick={onAddAlias}>{t('oauth_model_alias.diagram_add_alias')}</MenuItem>
  );

  const renderAlias = () => {
    if (!data) return null;
    return (
      <>
        <MenuItem onClick={() => onRenameAlias(data)}>
          {t('oauth_model_alias.diagram_rename')}
        </MenuItem>
        <MenuItem onClick={() => onOpenAliasSettings(data)}>
          {t('oauth_model_alias.diagram_settings')}
        </MenuItem>
        <MenuDivider />
        <MenuItem danger onClick={() => onDeleteAlias(data)}>
          {t('oauth_model_alias.diagram_delete_alias')}
        </MenuItem>
      </>
    );
  };

  const renderProvider = () => {
    if (!data) return null;
    return (
      <>
        <MenuItem onClick={() => onEditProvider(data)}>{t('common.edit')}</MenuItem>
        <MenuDivider />
        <MenuItem danger onClick={() => onDeleteProvider(data)}>
          {t('oauth_model_alias.delete')}
        </MenuItem>
      </>
    );
  };

  const renderSource = () => {
    if (!data) return null;
    return (
      <MenuItem onClick={() => onOpenSourceSettings(data)}>
        {t('oauth_model_alias.diagram_settings')}
      </MenuItem>
    );
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {type === 'background' && renderBackground()}
      {type === 'alias' && renderAlias()}
      {type === 'provider' && renderProvider()}
      {type === 'source' && renderSource()}
    </div>,
    document.body
  );
}
