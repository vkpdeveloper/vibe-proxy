import type { DragEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type { AliasNode, ProviderNode, SourceNode } from './ModelMappingDiagramTypes';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Canvas-style cards: rounded-xl on black with a hairline border, like VM Bridge's Canvas nodes.
const COLUMN = 'z-[2] flex flex-none flex-col gap-3';
const COLUMN_HEADER = 'mb-1 px-1 text-xs font-medium text-muted-foreground';
const CARD =
  'relative flex w-full max-w-[280px] items-center justify-between gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-[13px] transition-colors duration-150 ease-out hover:z-10 hover:border-input';
const DRAGGABLE = 'cursor-grab active:cursor-grabbing';
const SELECTED =
  'border-primary/40 shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_10%,transparent)]';
const DROP_TARGET = 'border-primary bg-primary/5';
const DRAGGING = 'border-dashed opacity-50';
const COUNT = 'ml-1 shrink-0 font-mono text-xs text-muted-foreground tabular-nums';
const NAME = 'min-w-0 flex-1 truncate';

interface ProviderColumnProps {
  providerNodes: ProviderNode[];
  collapsedProviders: Set<string>;
  getProviderColor: (provider: string) => string;
  providerGroupHeights?: Record<string, number>;
  providerRefs: RefObject<Map<string, HTMLDivElement>>;
  onToggleCollapse: (provider: string) => void;
  onContextMenu: (e: ReactMouseEvent, type: 'provider' | 'background', data?: string) => void;
  label: string;
  expandLabel: string;
  collapseLabel: string;
}

export function ProviderColumn({
  providerNodes,
  collapsedProviders,
  getProviderColor,
  providerGroupHeights = {},
  providerRefs,
  onToggleCollapse,
  onContextMenu,
  label,
  expandLabel,
  collapseLabel,
}: ProviderColumnProps) {
  return (
    <div
      className={cn(COLUMN, 'min-w-36 items-end')}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, 'background');
      }}
    >
      <div className={COLUMN_HEADER}>{label}</div>
      {providerNodes.map(({ provider, sources }) => {
        const collapsed = collapsedProviders.has(provider);
        const groupHeight = collapsed ? undefined : providerGroupHeights[provider];
        return (
          <div
            key={provider}
            className="flex w-full items-center justify-end"
            style={groupHeight ? { height: groupHeight } : undefined}
          >
            <div
              ref={(el) => {
                if (el) providerRefs.current?.set(provider, el);
                else providerRefs.current?.delete(provider);
              }}
              className={cn(CARD, 'gap-2 pl-1.5')}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onContextMenu(e, 'provider', provider);
              }}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                onClick={() => onToggleCollapse(provider)}
                aria-label={collapsed ? expandLabel : collapseLabel}
                title={collapsed ? expandLabel : collapseLabel}
              >
                <HugeiconsIcon
                  icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
                  strokeWidth={1.75}
                />
              </Button>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: getProviderColor(provider) }}
              />
              <span className={cn(NAME, 'font-medium')}>{provider}</span>
              <span className={COUNT}>{sources.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface SourceColumnProps {
  providerNodes: ProviderNode[];
  collapsedProviders: Set<string>;
  sourceRefs: RefObject<Map<string, HTMLDivElement>>;
  getProviderColor: (provider: string) => string;
  selectedSourceId?: string | null;
  onSelectSource?: (source: SourceNode) => void;
  draggedSource: SourceNode | null;
  dropTargetSource: string | null;
  draggable: boolean;
  onDragStart: (e: DragEvent, source: SourceNode) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent, source: SourceNode) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent, source: SourceNode) => void;
  onContextMenu: (e: ReactMouseEvent, type: 'source' | 'background', data?: string) => void;
  label: string;
}

export function SourceColumn({
  providerNodes,
  collapsedProviders,
  sourceRefs,
  getProviderColor,
  selectedSourceId,
  onSelectSource,
  draggedSource,
  dropTargetSource,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  label,
}: SourceColumnProps) {
  return (
    <div
      className={cn(COLUMN, 'min-w-52 items-start')}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, 'background');
      }}
    >
      <div className={COLUMN_HEADER}>{label}</div>
      {providerNodes.flatMap(({ provider, sources }) => {
        if (collapsedProviders.has(provider)) return [];
        return sources.map((source) => (
          <div
            key={source.id}
            ref={(el) => {
              if (el) sourceRefs.current?.set(source.id, el);
              else sourceRefs.current?.delete(source.id);
            }}
            className={cn(
              CARD,
              draggable && DRAGGABLE,
              selectedSourceId === source.id && SELECTED,
              dropTargetSource === source.id && DROP_TARGET,
              draggedSource?.id === source.id && DRAGGING
            )}
            onClick={() => onSelectSource?.(source)}
            draggable={draggable}
            onDragStart={(e) => onDragStart(e, source)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, source)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, source)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(e, 'source', source.id);
            }}
          >
            <span className={cn(NAME, 'font-mono text-xs')} title={source.name}>
              {source.name}
            </span>
            <div
              className="absolute top-1/2 -right-[3px] size-1.5 -translate-y-1/2 rounded-full"
              style={{
                background: getProviderColor(source.provider),
                opacity: source.aliases.length > 0 ? 1 : 0.3,
              }}
            />
          </div>
        ));
      })}
    </div>
  );
}

interface AliasColumnProps {
  aliasNodes: AliasNode[];
  aliasRefs: RefObject<Map<string, HTMLDivElement>>;
  dropTargetAlias: string | null;
  draggedAlias: string | null;
  selectedAlias?: string | null;
  onSelectAlias?: (alias: string) => void;
  draggable: boolean;
  onDragStart: (e: DragEvent, alias: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent, alias: string) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent, alias: string) => void;
  onContextMenu: (e: ReactMouseEvent, type: 'alias' | 'background', data?: string) => void;
  label: string;
}

export function AliasColumn({
  aliasNodes,
  aliasRefs,
  dropTargetAlias,
  draggedAlias,
  selectedAlias,
  onSelectAlias,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  label,
}: AliasColumnProps) {
  return (
    <div
      className={cn(COLUMN, 'min-w-52 items-start')}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, 'background');
      }}
    >
      <div className={COLUMN_HEADER}>{label}</div>
      {aliasNodes.map((node) => (
        <div
          key={node.id}
          ref={(el) => {
            if (el) aliasRefs.current?.set(node.id, el);
            else aliasRefs.current?.delete(node.id);
          }}
          className={cn(
            CARD,
            draggable && DRAGGABLE,
            selectedAlias === node.alias && SELECTED,
            dropTargetAlias === node.alias && DROP_TARGET,
            draggedAlias === node.alias && DRAGGING
          )}
          onClick={() => onSelectAlias?.(node.alias)}
          draggable={draggable}
          onDragStart={(e) => onDragStart(e, node.alias)}
          onDragEnd={onDragEnd}
          onDragOver={(e) => onDragOver(e, node.alias)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, node.alias)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, 'alias', node.alias);
          }}
        >
          <div className="absolute top-1/2 -left-[3px] size-1.5 -translate-y-1/2 rounded-full bg-faint" />
          <span className={cn(NAME, 'font-mono text-xs')} title={node.alias}>
            {node.alias}
          </span>
          <span className={COUNT}>{node.sources.length}</span>
        </div>
      ))}
    </div>
  );
}
