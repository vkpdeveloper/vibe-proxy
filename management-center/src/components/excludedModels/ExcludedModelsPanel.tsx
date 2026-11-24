import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';
import {
  getModelExclusionState,
  type ExclusionStats,
  type ModelExclusionState,
} from './excludedModelRules';

export interface ExcludedModelCandidate {
  id: string;
  displayName?: string;
}

interface ExcludedModelsPanelProps {
  rules: readonly string[];
  candidates: readonly ExcludedModelCandidate[];
  /** 由 Picker 算好传下来，避免在 footer 里把整个目录再扫一遍。 */
  stats: ExclusionStats;
  onToggle: (modelId: string, excluded: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
  disabled: boolean;
  listboxId: string;
  /** 展开后是否把焦点送进搜索框（键盘展开时为 true，鼠标点开时也为 true）。 */
  autoFocus: boolean;
  /** 收起面板并把焦点还给 trigger。 */
  onDismiss: () => void;
}

const matchesQuery = (candidate: ExcludedModelCandidate, query: string): boolean =>
  candidate.id.toLowerCase().includes(query) ||
  (candidate.displayName ?? '').toLowerCase().includes(query);

export function ExcludedModelsPanel({
  rules,
  candidates,
  stats,
  onToggle,
  onSelectAll,
  onClear,
  disabled,
  listboxId,
  autoFocus,
  onDismiss,
}: ExcludedModelsPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return candidates;
    return candidates.filter((candidate) => matchesQuery(candidate, normalized));
  }, [candidates, query]);

  // 高亮永远钳在可见范围内：过滤后列表变短，旧索引会指向不存在的行。
  const activeIndex = visible.length === 0 ? -1 : Math.min(highlight, visible.length - 1);
  const activeId = activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined;

  useLayoutEffect(() => {
    // Touch screens would pop the keyboard over the list the user opened to scan.
    if (!autoFocus || window.matchMedia('(pointer: coarse)').matches) return;
    // preventScroll：裸 focus() 会把外层 Sheet 的滚动猛拽过来，动画中途还会把面板顶出视野。
    inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    if (!autoFocus || activeIndex < 0) return;
    document
      .getElementById(`${listboxId}-opt-${activeIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, autoFocus, listboxId]);

  const toggleAt = (index: number) => {
    const candidate = visible[index];
    if (!candidate || disabled) return;
    const current = getModelExclusionState(rules, candidate.id);
    // 纯通配符命中的行不可直接切换——它的排除权属于那条规则。行内副文本常驻解释原因。
    if (current.state === 'excluded' && current.by === 'wildcard') return;
    onToggle(candidate.id, current.state !== 'excluded');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlight((prev) => Math.min(prev + 1, visible.length - 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        setHighlight((prev) => Math.max(prev - 1, 0));
        return;
      case 'Home':
        if (visible.length === 0) return;
        event.preventDefault();
        setHighlight(0);
        return;
      case 'End':
        if (visible.length === 0) return;
        event.preventDefault();
        setHighlight(visible.length - 1);
        return;
      case 'Enter':
        event.preventDefault();
        if (activeIndex >= 0) toggleAt(activeIndex);
        return;
      case 'Escape':
        // 外层 Sheet 在 document 上、OAuth 页在 window 上都听 Escape。
        // 不拦住就会「关面板 = 关 Sheet / 离开页面 + 触发未保存弹窗」。
        event.preventDefault();
        event.stopPropagation();
        if (query) {
          setQuery('');
          setHighlight(0);
          return;
        }
        onDismiss();
        return;
      default:
    }
  };

  return (
    <div className="mt-1.5 flex flex-col overflow-hidden rounded-xl border bg-card duration-200 animate-in fade-in-0 zoom-in-[0.98] motion-reduce:animate-none">
      <div className="border-b p-2">
        {/* 16px on phones: iOS zooms into any smaller text field on focus. */}
        <InputGroup className="h-7 max-sm:h-10 sm:h-8">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            type="text"
            className="h-7 text-[13px] max-sm:h-10 max-sm:text-base sm:h-8"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlight(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('excluded_models.search_placeholder')}
            aria-label={t('excluded_models.search_aria')}
            aria-controls={listboxId}
            aria-activedescendant={activeId}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />
        </InputGroup>
      </div>

      <div
        id={listboxId}
        className="flex max-h-64 flex-col overflow-y-auto overscroll-contain p-1"
        role="listbox"
        aria-multiselectable="true"
        aria-label={t('excluded_models.list_aria')}
      >
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">
            {query.trim()
              ? t('excluded_models.no_results', { query: query.trim() })
              : t('excluded_models.catalog_empty')}
          </p>
        ) : (
          visible.map((candidate, index) => (
            <ExcludedModelRow
              key={candidate.id.toLowerCase()}
              id={`${listboxId}-opt-${index}`}
              candidate={candidate}
              state={getModelExclusionState(rules, candidate.id)}
              highlighted={index === activeIndex}
              onHover={() => setHighlight(index)}
              onToggle={() => toggleAt(index)}
            />
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t bg-muted/50 px-3 py-1.5 sm:py-1">
        <span className="font-sans text-xs text-muted-foreground">
          {t('excluded_models.footer_count', { excluded: stats.excluded, total: stats.total })}
        </span>
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="max-sm:h-10 max-sm:px-3 sm:h-8 sm:px-2.5 sm:text-[13px]"
            onClick={onSelectAll}
            disabled={disabled || candidates.length === 0}
          >
            {t('excluded_models.select_all')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="max-sm:h-10 max-sm:px-3 sm:h-8 sm:px-2.5 sm:text-[13px]"
            onClick={onClear}
            disabled={disabled}
            aria-label={t('excluded_models.clear_aria')}
          >
            {t('excluded_models.clear')}
          </Button>
        </span>
      </div>
    </div>
  );
}

interface ExcludedModelRowProps {
  id: string;
  candidate: ExcludedModelCandidate;
  state: ModelExclusionState;
  highlighted: boolean;
  onHover: () => void;
  onToggle: () => void;
}

function ExcludedModelRow({
  id,
  candidate,
  state,
  highlighted,
  onHover,
  onToggle,
}: ExcludedModelRowProps) {
  const { t } = useTranslation();
  const excluded = state.state === 'excluded';
  const lockedByRule = state.state === 'excluded' && state.by === 'wildcard';
  // 把「哪条规则、用哪句话解释」在一处收敛好，下面的 JSX 就不必再做类型收窄。
  const wildcardReason =
    state.state === 'excluded' && (state.by === 'wildcard' || state.by === 'both')
      ? {
          rule: state.rule,
          text:
            state.by === 'wildcard'
              ? t('excluded_models.wildcard_locked', { rule: state.rule })
              : t('excluded_models.also_wildcard', { rule: state.rule }),
          muted: state.by === 'both',
        }
      : null;

  return (
    <div
      id={id}
      role="option"
      // 行永不进 tab 序：外层 Sheet 的焦点陷阱每次 Tab 都枚举全部可聚焦元素，
      // 几十个可聚焦的行会把它拖垮。漫游全靠 aria-activedescendant。
      tabIndex={-1}
      aria-selected={excluded}
      aria-disabled={lockedByRule || undefined}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 select-none',
        highlighted && 'bg-accent',
        lockedByRule && 'cursor-default opacity-60'
      )}
      onMouseEnter={onHover}
      onClick={onToggle}
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-input/30 transition-colors',
          excluded && 'border-primary-solid bg-primary-solid text-primary-foreground'
        )}
        aria-hidden="true"
      >
        {excluded ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="size-3.5" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-xs">{candidate.id}</span>
        {candidate.displayName && candidate.displayName !== candidate.id ? (
          <span className="truncate text-xs text-muted-foreground">{candidate.displayName}</span>
        ) : null}
        {wildcardReason ? (
          <span className="truncate text-xs text-muted-foreground">{wildcardReason.text}</span>
        ) : null}
      </span>
      {wildcardReason ? (
        <span
          className={cn(
            'shrink-0 rounded-full border border-dashed border-primary/35 px-1.5 py-px text-[10px] text-muted-foreground',
            wildcardReason.muted && 'border-dotted border-input text-faint'
          )}
        >
          {t('excluded_models.badge_wildcard')}
        </span>
      ) : null}
    </div>
  );
}
