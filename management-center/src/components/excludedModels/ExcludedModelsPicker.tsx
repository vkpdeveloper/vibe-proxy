import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, ArrowDown01Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ExcludedModelChipRow, ExcludedModelRuleChip } from './ExcludedModelRuleChip';
import { ExcludedModelsPanel, type ExcludedModelCandidate } from './ExcludedModelsPanel';
import {
  formatExcludedRulesText,
  getModelExclusionState,
  matchedModelsByRule,
  normalizeExcludedRules,
  replaceCustomExcludedRules,
  splitExcludedRules,
  summarizeExclusion,
  toggleExcludedRule,
} from './excludedModelRules';

export type { ExcludedModelCandidate };

export type ExcludedModelsCatalogState = 'ready' | 'loading' | 'unavailable' | 'error';

/** 派生 chip 的上限——超过这个数就只报总数，否则 chip 行会淹没整个字段。 */
const DERIVED_CHIP_LIMIT = 8;

export interface ExcludedModelsPickerProps {
  /** 规范的规则列表。调用方内部存文本/Set 都行，在边界上适配一次即可。 */
  value: readonly string[];
  onChange: (next: string[]) => void;

  candidates: readonly ExcludedModelCandidate[];
  catalogState?: ExcludedModelsCatalogState;
  onRetryCatalog?: () => void;

  /** 真实禁用（未连接 / 保存中）。**绝不要**因为目录为空就传 true。 */
  disabled?: boolean;

  /** picker 不得读写、也不许用户输入的规则。provider 表单传 `['*']`。 */
  reservedRules?: readonly string[];
  reservedRuleMessage?: string;

  /** 关掉通配符规则编辑器。 */
  showRuleEditor?: boolean;

  labelledBy?: string;
  className?: string;
  /** Trigger wording; the OAuth pages call these models "disabled" rather than "excluded". */
  summaryKeys?: ExcludedModelsSummaryKeys;
}

export type ExcludedModelsSummaryKeys = {
  empty: string;
  /** Interpolates {{excluded}} and {{available}}. */
  summary: string;
  /** Interpolates {{n}}, used when there is no model catalog. */
  rules: string;
};

const DEFAULT_SUMMARY_KEYS: ExcludedModelsSummaryKeys = {
  empty: 'excluded_models.trigger_empty',
  summary: 'excluded_models.trigger_summary',
  rules: 'excluded_models.trigger_summary_rules',
};

export function ExcludedModelsPicker({
  value,
  onChange,
  candidates,
  catalogState = 'ready',
  onRetryCatalog,
  disabled = false,
  reservedRules,
  reservedRuleMessage,
  showRuleEditor = true,
  labelledBy,
  className,
  summaryKeys = DEFAULT_SUMMARY_KEYS,
}: ExcludedModelsPickerProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const listboxId = `${baseId}-listbox`;
  const [open, setOpen] = useState(false);
  const [reservedHit, setReservedHit] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const reservedKeys = useMemo(
    () => new Set((reservedRules ?? []).map((rule) => rule.trim().toLowerCase())),
    [reservedRules]
  );

  /**
   * 保留规则在**入口**就被剥掉，因此 picker 内部从不见到它，也就不可能把它写回去。
   * provider 表单的 `'*'`（= 已停用）由 disabled 开关独占，排除面无权触碰。
   */
  const rules = useMemo(
    () =>
      normalizeExcludedRules(value).filter((rule) => !reservedKeys.has(rule.trim().toLowerCase())),
    [reservedKeys, value]
  );

  const candidateIds = useMemo(() => candidates.map((c) => c.id), [candidates]);
  const stats = useMemo(() => summarizeExclusion(rules, candidateIds), [candidateIds, rules]);
  const { exactRules, unknownRules, customRules } = useMemo(
    () => splitExcludedRules(rules, candidateIds),
    [candidateIds, rules]
  );

  const commit = useCallback(
    (next: readonly string[]) => {
      // 出口再滤一次保留规则：纵深防御，规则编辑器里手打的 `*` 到不了调用方。
      onChange(next.filter((rule) => !reservedKeys.has(rule.trim().toLowerCase())));
    },
    [onChange, reservedKeys]
  );

  const hasCatalog = catalogState === 'ready' && candidates.length > 0;

  /** 通配符派生出的模型（排除掉已显式勾选的，那些走实线 chip）。 */
  const derivedModels = useMemo(() => {
    if (!hasCatalog) return [];
    const out: Array<{ id: string; rule: string }> = [];
    candidateIds.forEach((id) => {
      const state = getModelExclusionState(rules, id);
      if (state.state === 'excluded' && state.by === 'wildcard') out.push({ id, rule: state.rule });
    });
    return out;
  }, [candidateIds, hasCatalog, rules]);

  const ruleSummaries = useMemo(
    () => (hasCatalog ? matchedModelsByRule(customRules, candidateIds) : []),
    [candidateIds, customRules, hasCatalog]
  );

  const handleToggle = (modelId: string, excluded: boolean) =>
    commit(toggleExcludedRule(rules, modelId, excluded));

  const handleSelectAll = () => commit(normalizeExcludedRules([...rules, ...candidateIds]));

  /** 只清精确勾选，通配符规则留给它自己的编辑器——否则一次点击会抹掉用户手写的规则。 */
  const handleClear = () => commit(customRules);

  const handleRuleEditorChange = (text: string) => {
    const typedReserved = text
      .split(/\r?\n/)
      .some((line) => reservedKeys.has(line.trim().toLowerCase()));
    setReservedHit(typedReserved);
    commit(replaceCustomExcludedRules(rules, candidateIds, text));
  };

  const dismissPanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const summaryText = () => {
    if (catalogState === 'loading') return t('excluded_models.catalog_loading');
    if (hasCatalog) {
      if (stats.excluded === 0 && rules.length === 0) return t(summaryKeys.empty);
      return t(summaryKeys.summary, {
        excluded: stats.excluded,
        available: stats.available,
      });
    }
    // 无目录：只能诚实地报规则条数，不能假装知道「还剩几个可用」。
    if (rules.length === 0) return t(summaryKeys.empty);
    return t(summaryKeys.rules, { n: rules.length });
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <button
        ref={triggerRef}
        type="button"
        className="relative flex h-9 w-full items-center max-sm:h-10 justify-between gap-2 overflow-hidden rounded-lg border border-input bg-input/30 px-2.5 text-left text-sm transition-colors outline-none hover:bg-input/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-labelledby={labelledBy}
        disabled={disabled}
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {catalogState === 'loading' ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : null}
          <span className="truncate">{summaryText()}</span>
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={1.75}
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
            open && 'rotate-180'
          )}
          aria-hidden="true"
        />
        {hasCatalog ? (
          <span
            className="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
            role="img"
            aria-label={t('excluded_models.meter_aria', {
              excluded: stats.excluded,
              total: stats.total,
            })}
          >
            <span
              className="block h-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
              style={{ width: `${stats.total ? (stats.excluded / stats.total) * 100 : 0}%` }}
            />
          </span>
        ) : null}
      </button>

      {/* Inline disclosure: the grid row goes 0fr to 1fr, so filtering the list re-solves the
          height on every keystroke without measuring. */}
      <div
        id={panelId}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          {catalogState === 'ready' || candidates.length > 0 ? (
            <ExcludedModelsPanel
              rules={rules}
              candidates={candidates}
              stats={stats}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onClear={handleClear}
              disabled={disabled}
              listboxId={listboxId}
              autoFocus={open}
              onDismiss={dismissPanel}
            />
          ) : (
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border bg-card px-3.5 py-3 text-[13px] text-muted-foreground">
              <span>
                {catalogState === 'loading'
                  ? t('excluded_models.catalog_loading')
                  : catalogState === 'error'
                    ? t('excluded_models.catalog_error')
                    : t('excluded_models.catalog_unavailable')}
              </span>
              {onRetryCatalog && catalogState !== 'loading' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="max-sm:h-10 max-sm:px-3"
                  onClick={onRetryCatalog}
                >
                  {t('excluded_models.catalog_retry')}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {exactRules.length > 0 || derivedModels.length > 0 || unknownRules.length > 0 ? (
        <ExcludedModelChipRow>
          {exactRules.map((rule) => (
            <ExcludedModelRuleChip
              key={`exact-${rule.toLowerCase()}`}
              label={rule}
              variant="exact"
              onRemove={() => commit(toggleExcludedRule(rules, rule, false))}
              removeAriaLabel={t('excluded_models.chip_remove', { rule })}
              disabled={disabled}
            />
          ))}
          {derivedModels.slice(0, DERIVED_CHIP_LIMIT).map((item) => (
            <ExcludedModelRuleChip
              key={`derived-${item.id.toLowerCase()}`}
              label={item.id}
              variant="wildcard"
              detail={item.rule}
              title={t('excluded_models.wildcard_reason', { rule: item.rule })}
            />
          ))}
          {derivedModels.length > DERIVED_CHIP_LIMIT ? (
            <span className="self-center text-xs text-faint">
              {t('excluded_models.chips_more', { n: derivedModels.length - DERIVED_CHIP_LIMIT })}
            </span>
          ) : null}
          {unknownRules.map((rule) => (
            <ExcludedModelRuleChip
              key={`unknown-${rule.toLowerCase()}`}
              label={rule}
              variant="unknown"
              detail={t('excluded_models.badge_unknown')}
              onRemove={() => commit(toggleExcludedRule(rules, rule, false))}
              removeAriaLabel={t('excluded_models.chip_remove', { rule })}
              disabled={disabled}
            />
          ))}
        </ExcludedModelChipRow>
      ) : null}

      {showRuleEditor ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={`${baseId}-rules`}>
            {t('excluded_models.rules_label')}
          </label>
          <Textarea
            id={`${baseId}-rules`}
            className="font-mono text-xs placeholder:font-sans max-sm:text-base md:text-xs"
            value={formatExcludedRulesText(customRules)}
            placeholder={t('excluded_models.rules_placeholder')}
            rows={3}
            disabled={disabled}
            spellCheck={false}
            onChange={(event) => handleRuleEditorChange(event.target.value)}
          />

          {reservedHit ? (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-3.5" />
              {reservedRuleMessage ?? t('excluded_models.rules_reserved')}
            </p>
          ) : null}

          {hasCatalog && ruleSummaries.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {ruleSummaries.map((summary) => (
                <li
                  key={summary.rule.toLowerCase()}
                  className={cn(
                    'flex items-center gap-1.5 text-xs text-muted-foreground',
                    // No match is a warning, not an error: a rule may name a model the catalog lacks.
                    summary.matchCount === 0 && 'text-warning'
                  )}
                >
                  <code className="font-mono text-foreground">{summary.rule}</code>
                  {summary.matchCount === 0
                    ? t('excluded_models.rules_match_none')
                    : t('excluded_models.rules_match_count', { n: summary.matchCount })}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-sm text-muted-foreground">{t('excluded_models.rules_hint')}</p>
        </div>
      ) : null}
    </div>
  );
}
